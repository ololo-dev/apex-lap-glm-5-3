import { describe, expect, it } from 'vitest'
import { Autopilot } from '../src/core/ai'
import { runLap, Simulation } from '../src/core/sim'
import { buildTrack } from '../src/core/track'

const track = buildTrack()

describe('the demo driver', () => {
  it('completes a lap without leaving the road', () => {
    const result = runLap()
    expect(result.laps).toBe(1)
    expect(result.offRoad).toBe(0)
    expect(result.time).toBeGreaterThan(20)
    expect(result.time).toBeLessThan(90)
  })

  it('drives the same race every time', () => {
    const a = runLap()
    const b = runLap()
    expect(b.time).toBe(a.time)
    expect(b.offRoad).toBe(a.offRoad)
  })

  it('brakes for the corners: it is slower through them than on the straights', () => {
    const sim = new Simulation({ demo: true })
    let straightest = 0
    let slowest = Infinity
    let hint = 0
    for (let i = 0; i < 120 * 60; i++) {
      sim.step()
      const s = sim.status()
      const proj = track.project({ x: s.x, z: s.z }, hint)
      hint = proj.idx
      const k = Math.abs(track.curvatureAt(proj.idx))
      if (k < 0.005) straightest = Math.max(straightest, s.speedKmh)
      if (k > 0.03) slowest = Math.min(slowest, s.speedKmh)
      if (s.laps >= 1) break
    }
    expect(straightest).toBeGreaterThan(slowest + 40)
  })

  it('asks for throttle when handed a stopped car mid-corner', () => {
    const ai = new Autopilot(track)
    const k = track.wpIdx[10] + 8 // just past the hairpin apex, pointing along the road
    const p = track.pointAt(k)
    const t = track.tangentAt(k)
    const input = ai.drive({ x: p.x, z: p.z, heading: Math.atan2(t.z, t.x), speed: 0 }, k)
    expect(input.throttle).toBeGreaterThan(0)
  })
})
