import { ROAD_HALF_WIDTH } from './config'
import { catmullRomClosed } from './spline'
import { dist, type Vec2, norm, perp, sub, vec } from './vec'

// The Oxbow Ring: a closed, smooth curve through the twelve points, in order,
// back to the first. x runs east, z runs south; the ground is flat.

export const WAYPOINTS: Vec2[] = [
  { x: 0, z: 0 }, // A
  { x: 120, z: 0 }, // B
  { x: 200, z: 40 }, // C
  { x: 220, z: 120 }, // D
  { x: 160, z: 180 }, // E
  { x: 80, z: 160 }, // F
  { x: 40, z: 220 }, // G
  { x: -60, z: 240 }, // H
  { x: -140, z: 180 }, // I
  { x: -120, z: 80 }, // J
  { x: -180, z: 20 }, // K
  { x: -100, z: -40 }, // L
]

export interface Projection {
  /** Index of the nearest centreline sample. */
  idx: number
  /** Distance in metres from the car to the centreline of the road. */
  dist: number
}

/** Point-to-segment distance. */
function segmentDist(p: Vec2, a: Vec2, b: Vec2): number {
  const abx = b.x - a.x
  const abz = b.z - a.z
  const l2 = abx * abx + abz * abz
  if (l2 < 1e-12) return dist(p, a)
  const t = Math.max(0, Math.min(1, ((p.x - a.x) * abx + (p.z - a.z) * abz) / l2))
  return Math.hypot(p.x - (a.x + abx * t), p.z - (a.z + abz * t))
}

/** Resample a closed polyline to exactly `n` points, evenly spaced by arc length. */
function resampleClosed(raw: Vec2[], n: number): { pts: Vec2[]; spacing: number } {
  const m = raw.length
  const cum = new Float64Array(m + 1)
  for (let i = 0; i < m; i++) cum[i + 1] = cum[i] + dist(raw[i], raw[(i + 1) % m])
  const total = cum[m]
  const spacing = total / n
  const pts: Vec2[] = []
  let k = 0
  for (let j = 0; j < n; j++) {
    const s = j * spacing
    while (k < m - 1 && cum[k + 1] < s) k++
    const span = cum[k + 1] - cum[k]
    const f = span > 1e-12 ? (s - cum[k]) / span : 0
    const a = raw[k]
    const b = raw[(k + 1) % m]
    pts.push({ x: a.x + (b.x - a.x) * f, z: a.z + (b.z - a.z) * f })
  }
  return { pts, spacing }
}

export class Track {
  readonly waypoints: readonly Vec2[]
  /** Centreline samples, evenly spaced, closed: pts[i] to pts[i+1] is `spacing` metres. */
  readonly pts: readonly Vec2[]
  readonly spacing: number
  readonly length: number
  readonly tangents: readonly Vec2[]
  /** Signed curvature, 1/metres. Positive = turning right (heading increasing). */
  readonly curvature: readonly number[]
  readonly startPos: Vec2
  readonly startTangent: Vec2
  readonly startNormal: Vec2
  /** Nearest centreline sample for each waypoint. */
  readonly wpIdx: readonly number[]

  constructor(waypoints: Vec2[] = WAYPOINTS, sampleCount = 1024) {
    const raw = catmullRomClosed(waypoints, 96)
    const { pts, spacing } = resampleClosed(raw, sampleCount)
    this.waypoints = waypoints
    this.pts = pts
    this.spacing = spacing
    this.length = spacing * pts.length
    const n = pts.length
    const tangents: Vec2[] = []
    const curvature: number[] = []
    for (let i = 0; i < n; i++) {
      const prev = pts[(i - 1 + n) % n]
      const cur = pts[i]
      const next = pts[(i + 1) % n]
      tangents.push(norm(sub(next, prev)))
      const a = sub(cur, prev)
      const b = sub(next, cur)
      const angle = Math.atan2(a.x * b.z - a.z * b.x, a.x * b.x + a.z * b.z)
      curvature.push(angle / spacing)
    }
    this.tangents = tangents
    this.curvature = curvature
    this.wpIdx = waypoints.map((w) => this.nearest(w))
    this.startPos = { ...waypoints[0] }
    this.startTangent = this.tangentAt(this.wpIdx[0])
    this.startNormal = perp(this.startTangent)
  }

  get sampleCount(): number {
    return this.pts.length
  }

  get waypointCount(): number {
    return this.waypoints.length
  }

  wrap(i: number): number {
    const n = this.pts.length
    return ((i % n) + n) % n
  }

  pointAt(i: number): Vec2 {
    return this.pts[this.wrap(i)]
  }

  tangentAt(i: number): Vec2 {
    return this.tangents[this.wrap(i)]
  }

  curvatureAt(i: number): number {
    return this.curvature[this.wrap(i)]
  }

  waypoint(i: number): Vec2 {
    return this.waypoints[((i % this.waypoints.length) + this.waypoints.length) % this.waypoints.length]
  }

  waypointTangent(i: number): Vec2 {
    return this.tangentAt(this.wpIdx[((i % this.waypoints.length) + this.waypoints.length) % this.waypoints.length])
  }

  /** Full scan for the nearest centreline sample. */
  nearest(p: Vec2): number {
    const n = this.pts.length
    let best = 0
    let bestD = Infinity
    for (let i = 0; i < n; i++) {
      const d = dist(p, this.pts[i])
      if (d < bestD) {
        bestD = d
        best = i
      }
    }
    return best
  }

  /**
   * Project a point onto the centreline, searching a window around the last
   * known index first (the car moves continuously). Falls back to a full scan
   * when the window loses the car (teleport, reset). Distance is refined
   * against the two adjacent segments so the road edge is exact to within a
   * centimetre, not half a sample.
   */
  project(p: Vec2, hint?: number): Projection {
    let idx: number
    let d: number
    if (hint === undefined) {
      idx = this.nearest(p)
      d = dist(p, this.pts[idx])
    } else {
      const W = 40
      idx = this.wrap(hint)
      d = dist(p, this.pts[idx])
      for (let o = 1; o <= W; o++) {
        const j = this.wrap(hint + o)
        const dj = dist(p, this.pts[j])
        if (dj < d) {
          d = dj
          idx = j
        }
        const k = this.wrap(hint - o)
        const dk = dist(p, this.pts[k])
        if (dk < d) {
          d = dk
          idx = k
        }
      }
      if (d > 30) {
        idx = this.nearest(p)
        d = dist(p, this.pts[idx])
      }
    }
    const i = this.wrap(idx)
    const prev = this.pts[this.wrap(i - 1)]
    const cur = this.pts[i]
    const next = this.pts[this.wrap(i + 1)]
    d = Math.min(d, segmentDist(p, prev, cur), segmentDist(p, cur, next))
    return { idx: i, dist: d }
  }

  /** Is the point on the road (within half the width of the centreline)? */
  onRoad(p: Vec2, hint?: number): boolean {
    return this.project(p, hint).dist <= ROAD_HALF_WIDTH
  }
}

let cached: Track | undefined

/** The shared Oxbow Ring instance (built once; cheap to read, safe to share). */
export function buildTrack(): Track {
  cached ??= new Track()
  return cached
}

/** The most dramatic waypoint: where the tightest corner bites. */
export function showcaseWaypoint(track: Track): number {
  let worst = 1
  let worstK = Math.abs(track.curvatureAt(track.wpIdx[1]))
  for (let i = 2; i < track.waypointCount; i++) {
    const k = Math.abs(track.curvatureAt(track.wpIdx[i]))
    if (k > worstK) {
      worstK = k
      worst = i
    }
  }
  return worst
}

/** The car starts on the line at A, facing point B. */
export function startHeading(track: Track): number {
  const a = track.waypoint(0)
  const b = track.waypoint(1)
  return Math.atan2(b.z - a.z, b.x - a.x)
}

export const startPos = (track: Track): Vec2 => vec(track.startPos.x, track.startPos.z)
