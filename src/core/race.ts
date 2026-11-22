import { Autopilot, type Traffic } from './ai'
import { satPush } from './collide'
import {
  CAR_HALF_LONG,
  CAR_HALF_WIDE,
  CONTACT_RESTITUTION,
  CONTACT_SCRUB,
  COUNTDOWN_SECONDS,
  DT,
  GRID_FIRST_ROW,
  GRID_GAP_LONG,
  GRID_HALF_GAP_LAT,
  RACE_LAPS,
  RACE_TIMEOUT,
  ROAD_HALF_WIDTH,
} from './config'
import { LapCounter } from './lap'
import { type Car, type CarInput, stepCar } from './physics'
import { buildTrack, Track } from './track'
import { clamp } from './vec'

// The race: three laps of the circuit, four cars on a grid two by two behind
// the start line, the player last. A countdown 3, 2, 1, GO; nobody moves
// before GO. Rivals drive themselves by the same lap rules as the player.
// Positions: laps completed first, then how far round the lap. Cars push
// apart when they meet — nobody drives through anybody. Nothing here is left
// to chance: the same race run twice is the same race.

export interface RivalSpec {
  name: string
  color: number
  pace: number
  lineOffset: number
}

/** The three rivals, pole slot first. The player is last on the grid. */
export const RIVALS: RivalSpec[] = [
  { name: 'Kestrel S2', color: 0x20d4c0, pace: 1.15, lineOffset: -1.2 },
  { name: 'Sable R', color: 0xa78bfa, pace: 1.065, lineOffset: 0.9 },
  { name: 'Marrow GT', color: 0xa3e635, pace: 1.0, lineOffset: 1.3 },
]

export const PLAYER_NAME = 'Vantor GT-12'
export const PLAYER_COLOR = 0xff6a1a

export type RacePhase = 'countdown' | 'racing' | 'over'

/** Where a grid slot stands: behind the start line, two by two. */
export function gridPose(track: Track, slot: number): { x: number; z: number; heading: number } {
  const row = Math.floor(slot / 2)
  const col = slot % 2
  const back = GRID_FIRST_ROW + row * GRID_GAP_LONG
  const lat = (col === 0 ? -1 : 1) * GRID_HALF_GAP_LAT
  const t = track.startTangent
  const nrm = track.startNormal
  return {
    x: track.startPos.x - t.x * back + nrm.x * lat,
    z: track.startPos.z - t.z * back + nrm.z * lat,
    heading: Math.atan2(t.z, t.x),
  }
}

export interface Racer {
  name: string
  color: number
  isPlayer: boolean
  car: Car
  laps: LapCounter
  autopilot: Autopilot
  projIdx: number
  onRoad: boolean
  finished: boolean
  finishTime: number | null
  bestLap: number | null
  /** Total seconds spent off the road over the whole race. */
  offRoadTotal: number
  lastInput: CarInput
  /** laps * track length + metres into the lap: the position order key. */
  progress: number
  place: number
}

export interface RacerStatus {
  name: string
  color: number
  isPlayer: boolean
  place: number
  lapsDone: number
  lapNumber: number
  lapTime: number | null
  lastLap: number | null
  bestLap: number | null
  finished: boolean
  finishTime: number | null
  onRoad: boolean
  wrongWay: boolean
  /** Boost charge, 0..1. */
  boost: number
  x: number
  z: number
  heading: number
  speedKmh: number
}

export interface RaceStatus {
  phase: RacePhase
  countdown: number
  raceTime: number
  /** e.g. "3 / 4" */
  playerPlace: string
  playerLapNumber: number
  playerLapTime: number | null
  playerLastLap: number | null
  playerBestLap: number | null
  playerAuto: boolean
  racers: RacerStatus[]
}

const COAST: CarInput = { throttle: 0, brake: 0, steer: 0, boost: 0 }

export interface RaceOptions {
  track?: Track
  playerAuto?: boolean
}

export class Race {
  readonly track: Track
  readonly racers: Racer[]
  phase: RacePhase = 'countdown'
  countdown = COUNTDOWN_SECONDS
  raceTime = 0
  time = 0

  private playerAuto: boolean
  private playerInput: CarInput = { throttle: 0, brake: 0, steer: 0, boost: 0 }

  constructor(opts: RaceOptions = {}) {
    this.track = opts.track ?? buildTrack()
    this.playerAuto = opts.playerAuto ?? false
    const specs: { name: string; color: number; pace: number; lineOffset: number; isPlayer: boolean }[] = [
      ...RIVALS.map((r) => ({ ...r, isPlayer: false })),
      { name: PLAYER_NAME, color: PLAYER_COLOR, pace: 1, lineOffset: 0, isPlayer: true },
    ]
    this.racers = specs.map((spec, slot) => this.makeRacer(spec, slot))
    this.orderPlaces()
  }

  private makeRacer(
    spec: { name: string; color: number; pace: number; lineOffset: number; isPlayer: boolean },
    slot: number,
  ): Racer {
    const track = this.track
    const pose = gridPose(track, slot)
    const car: Car = { x: pose.x, z: pose.z, heading: pose.heading, speed: 0, boostCharge: 1 }
    const proj = track.project(car)
    return {
      name: spec.name,
      color: spec.color,
      isPlayer: spec.isPlayer,
      car,
      laps: new LapCounter(track),
      autopilot: new Autopilot(track, {
        pace: spec.pace,
        lineOffset: spec.lineOffset,
        useBoost: spec.isPlayer,
      }),
      projIdx: proj.idx,
      onRoad: true,
      finished: false,
      finishTime: null,
      bestLap: null,
      offRoadTotal: 0,
      lastInput: COAST,
      progress: 0,
      place: slot + 1,
    }
  }

  setPlayerInput(input: CarInput): void {
    this.playerInput = {
      throttle: input.throttle,
      brake: input.brake,
      steer: input.steer,
      boost: input.boost,
    }
  }

  setPlayerAuto(on: boolean): void {
    this.playerAuto = on
  }

  get playerAutoOn(): boolean {
    return this.playerAuto
  }

  player(): Racer {
    return this.racers[this.racers.length - 1]
  }

  step(dt: number = DT): void {
    this.time += dt
    if (this.phase === 'countdown') {
      this.countdown -= dt
      if (this.countdown <= 0) {
        this.countdown = 0
        this.phase = 'racing'
      }
      return // nobody moves before GO
    }
    this.raceTime += dt
    for (const r of this.racers) {
      let input: CarInput
      if (r.finished) {
        // The race is over for this car: brake to a standstill on the road.
        const drv = r.autopilot.drive(r.car, r.projIdx, [])
        input = { throttle: 0, brake: Math.abs(r.car.speed) > 0.5 ? 1 : 0, steer: drv.steer }
      } else if (r.isPlayer && !this.playerAuto) {
        input = this.playerInput
      } else {
        input = r.autopilot.drive(r.car, r.projIdx, this.trafficFor(r))
      }
      r.lastInput = input
      stepCar(r.car, input, r.onRoad, dt)
      const proj = this.track.project(r.car, r.projIdx)
      r.projIdx = proj.idx
      r.onRoad = proj.dist <= ROAD_HALF_WIDTH
      r.laps.update(r.car, proj, dt)
      if (!r.onRoad) r.offRoadTotal += dt
      if (r.laps.bestLap !== null) r.bestLap = r.laps.bestLap
      if (!r.finished && r.laps.lapCount >= RACE_LAPS) {
        r.finished = true
        r.finishTime = this.raceTime
        if (r.isPlayer) this.phase = 'over'
      }
      r.progress = r.laps.lapCount * this.track.length + r.projIdx * this.track.spacing
    }
    this.resolveContacts()
    this.orderPlaces()
  }

  private trafficFor(self: Racer): Traffic[] {
    const out: Traffic[] = []
    for (const o of this.racers) {
      if (o === self) continue
      out.push({ x: o.car.x, z: o.car.z, heading: o.car.heading, speed: o.car.speed })
    }
    return out
  }

  /** Equal-mass inelastic response between the two car boxes. */
  private contact(a: Racer, b: Racer): void {
    const hit = satPush(
      { x: a.car.x, z: a.car.z, heading: a.car.heading, hx: CAR_HALF_LONG, hz: CAR_HALF_WIDE },
      { x: b.car.x, z: b.car.z, heading: b.car.heading, hx: CAR_HALF_LONG, hz: CAR_HALF_WIDE },
    )
    if (!hit) return
    const nx = hit.nx
    const nz = hit.nz
    // Push apart.
    a.car.x -= nx * hit.pen * 0.5
    a.car.z -= nz * hit.pen * 0.5
    b.car.x += nx * hit.pen * 0.5
    b.car.z += nz * hit.pen * 0.5
    // Lose the closing speed, and a little more besides.
    const ca = Math.cos(a.car.heading)
    const sa = Math.sin(a.car.heading)
    const cb = Math.cos(b.car.heading)
    const sb = Math.sin(b.car.heading)
    const vax = ca * a.car.speed
    const vaz = sa * a.car.speed
    const vbx = cb * b.car.speed
    const vbz = sb * b.car.speed
    const vrel = (vbx - vax) * nx + (vbz - vaz) * nz
    if (vrel < 0) {
      const j = (-vrel * (1 + CONTACT_RESTITUTION)) / 2
      const wax = vax - nx * j
      const waz = vaz - nz * j
      const wbx = vbx + nx * j
      const wbz = vbz + nz * j
      a.car.speed = clamp((ca * wax + sa * waz) * CONTACT_SCRUB, -12, 60)
      b.car.speed = clamp((cb * wbx + sb * wbz) * CONTACT_SCRUB, -12, 60)
    }
  }

  private resolveContacts(): void {
    for (let i = 0; i < this.racers.length; i++) {
      for (let j = i + 1; j < this.racers.length; j++) {
        this.contact(this.racers[i]!, this.racers[j]!)
      }
    }
  }

  /** Positions: by laps completed, then how far round the lap; ties keep order. */
  private orderPlaces(): void {
    const order = [...this.racers].sort((p, q) => q.progress - p.progress)
    order.forEach((r, i) => (r.place = i + 1))
  }

  status(): RaceStatus {
    const racers: RacerStatus[] = this.racers.map((r) => ({
      name: r.name,
      color: r.color,
      isPlayer: r.isPlayer,
      place: r.place,
      lapsDone: r.laps.lapCount,
      lapNumber: r.laps.lapActive ? r.laps.lapCount + 1 : 0,
      lapTime: r.laps.lapActive ? r.laps.lapTime : null,
      lastLap: r.laps.lastLap,
      bestLap: r.laps.bestLap,
      finished: r.finished,
      finishTime: r.finishTime,
      onRoad: r.onRoad,
      wrongWay: r.laps.wrongWay,
      boost: r.car.boostCharge,
      x: r.car.x,
      z: r.car.z,
      heading: r.car.heading,
      speedKmh: Math.abs(r.car.speed) * 3.6,
    }))
    const player = racers[racers.length - 1]!
    return {
      phase: this.phase,
      countdown: this.countdown,
      raceTime: this.raceTime,
      playerPlace: `${player.place} / ${racers.length}`,
      playerLapNumber: player.lapNumber,
      playerLapTime: player.lapTime,
      playerLastLap: player.lastLap,
      playerBestLap: player.bestLap,
      playerAuto: this.playerAuto,
      racers,
    }
  }

  reset(): void {
    this.phase = 'countdown'
    this.countdown = COUNTDOWN_SECONDS
    this.raceTime = 0
    this.time = 0
    this.playerInput = { throttle: 0, brake: 0, steer: 0, boost: 0 }
    this.racers.forEach((r, slot) => {
      const pose = gridPose(this.track, slot)
      r.car.x = pose.x
      r.car.z = pose.z
      r.car.heading = pose.heading
      r.car.speed = 0
      r.car.boostCharge = 1
      const proj = this.track.project(r.car)
      r.projIdx = proj.idx
      r.onRoad = true
      r.finished = false
      r.finishTime = null
      r.bestLap = null
      r.offRoadTotal = 0
      r.lastInput = COAST
      r.progress = 0
      r.place = slot + 1
      r.laps.reset()
    })
  }
}

export interface RaceResultEntry {
  name: string
  time: number | null
  best: number | null
}

/** Drive a whole race with the built-in driver, no browser, to the end. */
export function runRace(opts: RaceOptions = {}): { laps: number; results: RaceResultEntry[] } {
  const race = new Race({ playerAuto: true, ...opts })
  const allDone = () => race.racers.every((r) => r.finished)
  while (!allDone() && race.time < RACE_TIMEOUT) race.step()
  const finishers = race.racers.filter((r) => r.finished)
  const rest = race.racers.filter((r) => !r.finished)
  const byFinish = (a: Racer, b: Racer) => (a.finishTime ?? 0) - (b.finishTime ?? 0)
  const results: RaceResultEntry[] = [...finishers.sort(byFinish), ...rest].map((r) => ({
    name: r.name,
    time: r.finished ? (r.finishTime ?? null) : null,
    best: r.laps.bestLap,
  }))
  return { laps: RACE_LAPS, results }
}

export const cssColor = (c: number): string => `#${c.toString(16).padStart(6, '0')}`

const num = (x: number): number => Math.round(x * 1000) / 1000

/** The `race:` command's one line of JSON. */
export function formatRaceLine(r: { laps: number; results: RaceResultEntry[] }): string {
  const entries = r.results
    .map(
      (e) =>
        `{"name": ${JSON.stringify(e.name)}, "time": ${e.time === null ? 'null' : num(e.time)}, "best": ${e.best === null ? 'null' : num(e.best)}}`,
    )
    .join(', ')
  return `{"laps": ${r.laps}, "results": [${entries}]}`
}
