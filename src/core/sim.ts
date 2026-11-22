import { DT, HEADLESS_TIMEOUT, ROAD_HALF_WIDTH } from './config'
import { Autopilot } from './ai'
import { LapCounter } from './lap'
import type { Car, CarInput } from './physics'
import { cloneCar, stepCar } from './physics'
import { buildTrack, startHeading, Track } from './track'
import { vec } from './vec'

// The whole race in one object: the track, the car, the lap counter and (in
// demo mode) the autopilot. Pure fixed steps — the page feeds it render-frame
// deltas through FixedStepRunner, the headless runner steps it directly, and
// both drive exactly the same race.

export interface Status {
  x: number
  z: number
  heading: number
  /** Signed speed, m/s. */
  speed: number
  speedKmh: number
  onRoad: boolean
  /** Boost charge, 0..1. */
  boost: number
  /** Laps completed. */
  laps: number
  /** The lap being driven, 1-based, or 0 before the first crossing. */
  lapNumber: number
  /** Seconds of the lap being driven, or null before it starts. */
  lapTime: number | null
  lastLap: number | null
  bestLap: number | null
  /** Seconds off the road during the lap being driven. */
  offRoad: number
  lastOffRoad: number | null
  wrongWay: boolean
  demo: boolean
  /** Sim time in seconds since the last reset. */
  time: number
}

export interface SimOptions {
  track?: Track
  demo?: boolean
}

export class Simulation {
  readonly track: Track
  car: Car
  prevCar: Car
  demo: boolean
  time = 0
  /** The input the last step actually used (manual or autopilot). */
  lastInput: CarInput = { throttle: 0, brake: 0, steer: 0 }

  private readonly laps: LapCounter
  private readonly autopilot: Autopilot
  private manual: CarInput = { throttle: 0, brake: 0, steer: 0, boost: 0 }
  private projIdx = 0
  private onRoad = true

  constructor(opts: SimOptions = {}) {
    this.track = opts.track ?? buildTrack()
    this.demo = opts.demo ?? false
    this.autopilot = new Autopilot(this.track, { useBoost: true })
    this.laps = new LapCounter(this.track)
    this.car = this.freshCar()
    this.prevCar = cloneCar(this.car)
  }

  private freshCar(): Car {
    return {
      x: this.track.startPos.x,
      z: this.track.startPos.z,
      heading: startHeading(this.track),
      speed: 0,
      boostCharge: 1,
    }
  }

  setManual(input: CarInput): void {
    this.manual = { throttle: input.throttle, brake: input.brake, steer: input.steer, boost: input.boost }
  }

  setDemo(on: boolean): void {
    this.demo = on
  }

  step(dt: number = DT): void {
    this.prevCar = cloneCar(this.car)
    const input = this.demo ? this.autopilot.drive(this.car, this.projIdx) : this.manual
    this.lastInput = input
    stepCar(this.car, input, this.onRoad, dt)
    this.time += dt
    const proj = this.track.project(this.car, this.projIdx)
    this.projIdx = proj.idx
    this.onRoad = proj.dist <= ROAD_HALF_WIDTH
    this.laps.update(this.car, proj, dt)
  }

  status(): Status {
    const s = this.laps
    return {
      x: this.car.x,
      z: this.car.z,
      heading: this.car.heading,
      speed: this.car.speed,
      speedKmh: Math.abs(this.car.speed) * 3.6,
      onRoad: this.onRoad,
      boost: this.car.boostCharge,
      laps: s.lapCount,
      lapNumber: s.lapActive ? s.lapCount + 1 : 0,
      lapTime: s.lapActive ? s.lapTime : null,
      lastLap: s.lastLap,
      bestLap: s.bestLap,
      offRoad: s.offRoadTime,
      lastOffRoad: s.lastOffRoad,
      wrongWay: s.wrongWay,
      demo: this.demo,
      time: this.time,
    }
  }

  reset(): void {
    this.car = this.freshCar()
    this.prevCar = cloneCar(this.car)
    this.laps.reset()
    this.projIdx = 0
    this.onRoad = true
    this.manual = { throttle: 0, brake: 0, steer: 0, boost: 0 }
    this.time = 0
  }
}

/** Drive one full lap headlessly under the same rules the page uses. */
export function runLap(track?: Track): { laps: number; time: number; offRoad: number } {
  const sim = new Simulation({ demo: true, ...(track ? { track } : {}) })
  while (sim.status().laps < 1 && sim.time < HEADLESS_TIMEOUT) sim.step()
  const s = sim.status()
  return { laps: s.laps, time: s.lastLap ?? 0, offRoad: s.lastOffRoad ?? 0 }
}

export const simPos = (s: Status) => vec(s.x, s.z)
