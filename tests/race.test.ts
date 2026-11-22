import { describe, expect, it } from 'vitest'
import { Autopilot } from '../src/core/ai'
import { satPush, type OBB } from '../src/core/collide'
import { CAR_HALF_LONG, CAR_HALF_WIDE, COUNTDOWN_SECONDS } from '../src/core/config'
import {
  formatRaceLine,
  gridPose,
  PLAYER_NAME,
  Race,
  RIVALS,
  runRace,
} from '../src/core/race'
import { buildTrack } from '../src/core/track'

const track = buildTrack()

const fOf = (x: number, z: number): number =>
  (x - track.startPos.x) * track.startTangent.x + (z - track.startPos.z) * track.startTangent.z
const gOf = (x: number, z: number): number =>
  (x - track.startPos.x) * track.startNormal.x + (z - track.startPos.z) * track.startNormal.z

describe('the grid and the countdown', () => {
  it('stands four cars behind the line, two by two, the player last', () => {
    const race = new Race()
    expect(race.racers).toHaveLength(4)
    expect(race.racers.slice(0, 3).map((r) => r.name)).toEqual(RIVALS.map((r) => r.name))
    expect(race.player().name).toBe(PLAYER_NAME)
    for (const r of race.racers) {
      expect(fOf(r.car.x, r.car.z)).toBeLessThan(0) // behind the line
      expect(Math.abs(gOf(r.car.x, r.car.z))).toBeLessThan(6) // within the road
      expect(track.onRoad({ x: r.car.x, z: r.car.z })).toBe(true)
    }
    // two rows of two
    const f = race.racers.map((r) => fOf(r.car.x, r.car.z))
    expect(f[0]).toBeCloseTo(f[1]!, 6)
    expect(f[2]).toBeCloseTo(f[3]!, 6)
    expect(f[0]! - f[2]!).toBeCloseTo(7, 6)
    const g = race.racers.map((r) => gOf(r.car.x, r.car.z))
    expect(g[0]).toBeCloseTo(-g[1]!, 6)
    expect(g[2]).toBeCloseTo(-g[3]!, 6)
    // the grid pose helper agrees with the placed cars
    race.racers.forEach((r, slot) => {
      const pose = gridPose(track, slot)
      expect(r.car.x).toBe(pose.x)
      expect(r.car.z).toBe(pose.z)
    })
  })

  it('moves nobody before GO, then the clock and the cars start', () => {
    const race = new Race({ playerAuto: true })
    const before = race.racers.map((r) => ({ x: r.car.x, z: r.car.z }))
    for (let i = 0; i < 120 * (COUNTDOWN_SECONDS - 0.2); i++) race.step()
    expect(race.phase).toBe('countdown')
    expect(race.racers.every((r) => r.car.speed === 0)).toBe(true)
    expect(race.raceTime).toBe(0)
    race.racers.forEach((r, i) => {
      expect(r.car.x).toBe(before[i]!.x)
      expect(r.car.z).toBe(before[i]!.z)
    })
    while (race.phase === 'countdown') race.step()
    expect(race.raceTime).toBe(0) // the clock starts on GO, not before
    for (let i = 0; i < 120; i++) race.step()
    expect(race.racers.every((r) => r.car.speed > 0)).toBe(true)
    expect(race.raceTime).toBeGreaterThan(0.9)
  })
})

describe('the rivals', () => {
  it('race three laps by the same rules, each at its own pace', () => {
    const r = runRace()
    expect(r.laps).toBe(3)
    expect(r.results).toHaveLength(4)
    const times = r.results.map((e) => e.time)
    for (const t of times) expect(t).not.toBeNull()
    for (let i = 1; i < times.length; i++) expect(times[i]!).toBeGreaterThanOrEqual(times[i - 1]!)
    // the rivals do not finish in a line: three distinct best laps, spread
    // quickest-vs-slowest by about a tenth
    const rivalBests = r.results.filter((e) => e.name !== PLAYER_NAME).map((e) => e.best!)
    expect(new Set(rivalBests).size).toBe(3)
    const ratio = Math.max(...rivalBests) / Math.min(...rivalBests)
    expect(ratio).toBeGreaterThan(1.07)
    expect(ratio).toBeLessThan(1.13)
  }, 60000)

  it('prints one deterministic line of JSON for the whole race', () => {
    const line = formatRaceLine(runRace())
    expect(line).toMatch(
      /^\{"laps": 3, "results": \[\{"name": "[^"]+", "time": \d+(\.\d+)?, "best": \d+(\.\d+)?\}(, \{"name": "[^"]+", "time": \d+(\.\d+)?, "best": \d+(\.\d+)?\}){3}\]\}$/,
    )
    expect(formatRaceLine(runRace())).toBe(line)
  }, 120000)

  it('keeps every car on the road for the whole race', () => {
    const race = new Race({ playerAuto: true })
    while (!race.racers.every((r) => r.finished)) race.step()
    for (const r of race.racers) expect(r.offRoadTotal).toBe(0)
  }, 60000)
})

/** Box state of a racer's car, as the collision rules see it. */
const asBox = (r: { car: { x: number; z: number; heading: number } }) => ({
  x: r.car.x,
  z: r.car.z,
  heading: r.car.heading,
  hx: CAR_HALF_LONG,
  hz: CAR_HALF_WIDE,
})

describe('the collision boxes', () => {
  const box = (x: number, z: number, heading = 0): OBB => ({ x, z, heading, hx: CAR_HALF_LONG, hz: CAR_HALF_WIDE })

  it('separates nose-to-tail along the track', () => {
    const hit = satPush(box(0, 0), box(4, 0)) // bumpers 0.6 m short of touching
    expect(hit!.pen).toBeCloseTo(2 * CAR_HALF_LONG - 4, 6)
    expect(hit!.nx).toBeCloseTo(1, 6)
  })

  it('separates side-by-side sideways', () => {
    const hit = satPush(box(0, 0), box(0, 1.5))
    expect(hit!.pen).toBeCloseTo(2 * CAR_HALF_WIDE - 1.5, 6)
    expect(hit!.nz).toBeCloseTo(1, 6)
  })

  it('lets clean gaps through', () => {
    expect(satPush(box(0, 0), box(5, 0))).toBeNull()
    expect(satPush(box(0, 0), box(0, 3))).toBeNull()
    expect(satPush(box(0, 0, 0.5), box(50, -20))).toBeNull()
  })
})

describe('positions and contact', () => {
  it('orders the field by laps completed, then distance round the lap', () => {
    const race = new Race({ playerAuto: true })
    expect(race.racers.map((r) => r.place)).toEqual([1, 2, 3, 4]) // the grid order
    while (race.phase === 'countdown') race.step()
    for (let i = 0; i < 120 * 40; i++) race.step()
    const sorted = [...race.racers].sort((a, b) => b.progress - a.progress)
    expect(sorted.map((r) => r.place)).toEqual([1, 2, 3, 4])
    expect(sorted[0]!.name).toBe('Kestrel S2') // the quickest rival leads
    expect(race.status().playerPlace).toMatch(/^\d \/ 4$/)
  }, 30000)

  it('pushes meeting cars apart and scrubs the closing speed', () => {
    const race = new Race({ playerAuto: true })
    while (race.phase === 'countdown') race.step()
    const a = race.racers[0]!
    const b = race.racers[1]!
    // Nose to tail, overlapping, same heading, on the A->B straight.
    const p = track.pointAt(60)
    const t = track.tangentAt(60)
    const heading = Math.atan2(t.z, t.x)
    a.car.x = p.x
    a.car.z = p.z
    a.car.heading = heading
    a.car.speed = 20
    b.car.x = p.x - Math.cos(heading) * 3.5 // bumpers overlapping by 1.1 m
    b.car.z = p.z - Math.sin(heading) * 3.5
    b.car.heading = heading
    b.car.speed = 25 // closing on a
    expect(satPush(asBox(a), asBox(b))).not.toBeNull()
    const closingBefore = b.car.speed - a.car.speed
    race.step()
    const after = satPush(asBox(a), asBox(b))
    expect(after === null || after.pen <= 0.02).toBe(true) // nobody drives through anybody
    const closingAfter = b.car.speed - a.car.speed
    expect(closingAfter).toBeLessThan(closingBefore)
  })

  it('aims a fast car round a slower one ahead of it', () => {
    const ai = new Autopilot(track)
    const p = track.pointAt(60)
    const t = track.tangentAt(60)
    const heading = Math.atan2(t.z, t.x)
    const car = { x: p.x, z: p.z, heading, speed: 20 }
    // a slower car 10 m ahead, sitting a little to the right of my line
    const ahead = {
      x: p.x + t.x * 10 - t.z * 0.8,
      z: p.z + t.z * 10 + t.x * 0.8,
      heading,
      speed: 12,
    }
    const alone = ai.drive(car, 60)
    const withTraffic = ai.drive(car, 60, [ahead])
    expect(withTraffic.steer).toBeLessThan(alone.steer) // aim left, where it is not
    expect(withTraffic.throttle).toBeLessThan(alone.throttle) // and do not ram it
  })
})
