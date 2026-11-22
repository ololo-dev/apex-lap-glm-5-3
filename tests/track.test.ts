import { describe, expect, it } from 'vitest'
import { ROAD_HALF_WIDTH } from '../src/core/config'
import { Track, WAYPOINTS, buildTrack } from '../src/core/track'
import { perp } from '../src/core/vec'

const track = buildTrack()

describe('the circuit', () => {
  it('is a closed curve of even 1-metre-ish samples', () => {
    const n = track.sampleCount
    for (let i = 0; i < n; i++) {
      const a = track.pointAt(i)
      const b = track.pointAt(i + 1)
      // Chord of a ~1 m arc, a hair under the arc length; uniform to one
      // part in a thousand — good enough that s = idx * spacing holds.
      const chord = Math.hypot(b.x - a.x, b.z - a.z)
      expect(chord).toBeGreaterThan(track.spacing * 0.999)
      expect(chord).toBeLessThan(track.spacing * 1.001)
    }
    expect(track.pointAt(0).x).toBeCloseTo(WAYPOINTS[0].x, 6)
    expect(track.pointAt(0).z).toBeCloseTo(WAYPOINTS[0].z, 6)
  })

  it('passes through all twelve points, in order', () => {
    expect(track.waypointCount).toBe(12)
    let prev = -1
    for (let i = 0; i < 12; i++) {
      const wp = track.waypoint(i)
      const proj = track.project(wp)
      expect(proj.dist).toBeLessThan(0.6)
      expect(proj.idx).toBeGreaterThan(prev)
      prev = proj.idx
    }
  })

  it('is a plausible length and never folds onto itself', () => {
    expect(track.length).toBeGreaterThan(950)
    expect(track.length).toBeLessThan(1300)
    const n = track.sampleCount
    let min = Infinity
    for (let i = 0; i < n; i += 4) {
      for (let j = i + 24; j < n; j += 4) {
        const gap = Math.min(j - i, n - (j - i))
        if (gap < 24) continue
        const a = track.pointAt(i)
        const b = track.pointAt(j)
        min = Math.min(min, Math.hypot(a.x - b.x, a.z - b.z))
      }
    }
    // Two road ribbons 12 m wide must not overlap: centres stay 24 m apart.
    expect(min).toBeGreaterThan(24)
  })

  it('knows the road from the ground', () => {
    const i = 300
    const p = track.pointAt(i)
    const t = track.tangentAt(i)
    const right = perp(t)
    const at = (d: number) => ({ x: p.x + right.x * d, z: p.z + right.z * d })
    expect(track.onRoad(at(0))).toBe(true)
    expect(track.onRoad(at(ROAD_HALF_WIDTH - 0.1))).toBe(true)
    expect(track.onRoad(at(ROAD_HALF_WIDTH + 0.1))).toBe(false)
    expect(track.onRoad(at(-ROAD_HALF_WIDTH + 0.1))).toBe(true)
    expect(track.onRoad(at(-ROAD_HALF_WIDTH - 0.1))).toBe(false)
    expect(track.onRoad({ x: 900, z: 900 })).toBe(false)
  })

  it('projects continuously while the car moves along it', () => {
    let idx = track.project(track.pointAt(0)).idx
    const n = track.sampleCount
    for (let k = 1; k <= 600; k++) {
      const p = track.pointAt(idx + 3)
      const proj = track.project(p, idx)
      expect(proj.dist).toBeLessThan(0.5)
      const moved = Math.abs(proj.idx - idx)
      expect(Math.min(moved, n - moved)).toBeLessThanOrEqual(4) // monotonic, wrap included
      idx = proj.idx
    }
  })

  it('recovers a lost car with a full scan', () => {
    const hint = 10
    const far = track.pointAt(700)
    const proj = track.project(far, hint)
    expect(proj.idx).toBeGreaterThan(600)
    expect(proj.dist).toBeLessThan(0.5)
  })

  it('builds the shared instance once', () => {
    expect(new Track()).not.toBe(track)
    expect(buildTrack()).toBe(track)
  })
})
