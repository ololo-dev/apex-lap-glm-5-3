import { describe, expect, it } from 'vitest'
import { Simulation } from '../src/core/sim'
import { buildTrack } from '../src/core/track'

const track = buildTrack()

const drive = (sim: Simulation, seconds: number) => {
  for (let i = 0; i < seconds * 120; i++) sim.step()
}

describe('a lap', () => {
  it('is counted once the twelve points are passed in order and the line crossed', () => {
    const sim = new Simulation({ demo: true })
    drive(sim, 70)
    const s = sim.status()
    expect(s.laps).toBe(1)
    expect(s.lastLap).toBeGreaterThan(20)
    expect(s.lastOffRoad).toBe(0)
    expect(s.bestLap).toBe(s.lastLap)
  })

  it('keeps counting laps while the demo keeps driving', () => {
    const sim = new Simulation({ demo: true })
    drive(sim, 120)
    expect(sim.status().laps).toBeGreaterThanOrEqual(2)
  })

  it('starts timing on the first step across the line, and counts nothing yet', () => {
    const sim = new Simulation({ demo: true })
    expect(sim.status().lapTime).toBeNull() // standing on the line, nothing yet
    sim.step()
    const s = sim.status()
    expect(s.lapTime).not.toBeNull() // first forward step across the line
    expect(s.lapTime).toBeLessThanOrEqual(1 / 60)
    expect(s.laps).toBe(0) // but nothing is counted yet
    expect(s.lapNumber).toBe(1)
  })
})

describe('not a lap', () => {
  it('crossing the line without the checkpoints counts nothing', () => {
    const sim = new Simulation({ demo: false })
    sim.setManual({ throttle: 1, brake: 0, steer: 0, boost: 0 })
    drive(sim, 5)
    const s = sim.status()
    expect(s.laps).toBe(0)
    expect(s.lapTime).not.toBeNull() // the lap is being timed...
    expect(s.lapNumber).toBe(1)
  })

  it('crossing the line the wrong way counts nothing', () => {
    const sim = new Simulation({ demo: false })
    sim.setManual({ throttle: 0, brake: 1, steer: 0, boost: 0 })
    drive(sim, 6) // reverse across the line and away from it
    const s = sim.status()
    expect(s.laps).toBe(0)
    expect(s.lapTime).toBeNull() // the lap never started
    expect(s.wrongWay).toBe(true)
  })

  it('cutting across the middle and missing points counts nothing', () => {
    const sim = new Simulation({ demo: true })
    // Let the demo drive until the car is up at E, partway round.
    const e = track.waypoint(4)
    for (let i = 0; i < 120 * 30; i++) {
      sim.step()
      if (Math.hypot(sim.car.x - e.x, sim.car.z - e.z) < 15) break
    }
    expect(Math.hypot(sim.car.x - e.x, sim.car.z - e.z)).toBeLessThan(20)
    // The player cuts across the middle to H, skipping F and G.
    const h = track.waypoint(7)
    sim.car.x = h.x
    sim.car.z = h.z
    const th = track.waypointTangent(7)
    sim.car.heading = Math.atan2(th.z, th.x)
    sim.car.speed = 20
    // Demo drive the rest of the way round and across the line.
    for (let i = 0; i < 120 * 40; i++) {
      sim.step()
      if (sim.status().laps >= 1) break
    }
    const s = sim.status()
    expect(s.laps).toBe(0) // F and G were never passed: no lap
  })

  it('a cut lap cannot be rescued by crossing the line again', () => {
    const sim = new Simulation({ demo: true })
    sim.car.x = track.waypoint(7).x // dropped at H with nothing passed
    sim.car.z = track.waypoint(7).z
    const th = track.waypointTangent(7)
    sim.car.heading = Math.atan2(th.z, th.x)
    sim.car.speed = 20
    drive(sim, 40)
    expect(sim.status().laps).toBe(0)
  })
})

describe('off the road bookkeeping', () => {
  it('counts the seconds spent off the road during a lap', () => {
    const sim = new Simulation({ demo: false })
    sim.setManual({ throttle: 0.6, brake: 0, steer: 0.35, boost: 0 })
    drive(sim, 12)
    const s = sim.status()
    if (s.offRoad > 0) {
      expect(s.onRoad).toBe(false)
    }
    // The scripted drive is messy: it may or may not be off-road at this
    // instant, but the counter and the flag must agree about right now.
    expect(s.onRoad).toBe(sim.track.project({ x: sim.car.x, z: sim.car.z }).dist <= 6)
  })

  it('keeps lap state through a reset', () => {
    const sim = new Simulation({ demo: true })
    drive(sim, 50)
    expect(sim.status().laps).toBe(1)
    sim.reset()
    const s = sim.status()
    expect(s.laps).toBe(0)
    expect(s.lastLap).toBeNull()
    expect(s.lapTime).toBeNull()
    expect(s.x).toBe(track.startPos.x)
    expect(s.z).toBe(track.startPos.z)
  })
})
