import { type Vec2, dist } from './vec'

// Centripetal Catmull-Rom through the given points, closed into a loop.
// Centripetal (alpha = 1/2) avoids the loops and overshoots the uniform
// variant produces on unevenly spaced points.

interface Knots {
  t0: number
  t1: number
  t2: number
  t3: number
}

/** Barry-Goldman evaluation of one spline segment at parameter t in [t1, t2]. */
function segmentPoint(
  p0: Vec2,
  p1: Vec2,
  p2: Vec2,
  p3: Vec2,
  k: Knots,
  t: number,
): Vec2 {
  const L = (a: Vec2, b: Vec2, ta: number, tb: number): Vec2 => {
    const f = (t - ta) / (tb - ta)
    return { x: a.x + (b.x - a.x) * f, z: a.z + (b.z - a.z) * f }
  }
  const a1 = L(p0, p1, k.t0, k.t1)
  const a2 = L(p1, p2, k.t1, k.t2)
  const a3 = L(p2, p3, k.t2, k.t3)
  const b1 = L(a1, a2, k.t0, k.t2)
  const b2 = L(a2, a3, k.t1, k.t3)
  return L(b1, b2, k.t1, k.t2)
}

/**
 * Sample the closed curve. Returns `samplesPerSegment` points per waypoint gap,
 * each segment starting exactly at its waypoint, so samples[0] === points[0].
 */
export function catmullRomClosed(points: Vec2[], samplesPerSegment: number): Vec2[] {
  const n = points.length
  const out: Vec2[] = []
  for (let i = 0; i < n; i++) {
    const p0 = points[(i - 1 + n) % n]
    const p1 = points[i]
    const p2 = points[(i + 1) % n]
    const p3 = points[(i + 2) % n]
    const t0 = 0
    const t1 = t0 + Math.sqrt(dist(p0, p1))
    const t2 = t1 + Math.sqrt(dist(p1, p2))
    const t3 = t2 + Math.sqrt(dist(p2, p3))
    for (let j = 0; j < samplesPerSegment; j++) {
      const u = j / samplesPerSegment
      const t = t1 + u * (t2 - t1)
      out.push(segmentPoint(p0, p1, p2, p3, { t0, t1, t2, t3 }, t))
    }
  }
  return out
}
