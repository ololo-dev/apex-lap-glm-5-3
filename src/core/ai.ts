import { BRAKE_A, LAT_GRIP_ROAD, OVERTAKE_LOOK, OVERTAKE_OFFSET, V_MAX_BOOST, V_MAX_ROAD } from './config'
import type { Car, CarInput } from './physics'
import type { Track } from './track'
import { clamp, wrapAngle } from './vec'

// The demo driver. It brakes for the corners and follows the centreline:
// a speed profile from curvature (limited by the same lateral grip the car
// has, with a safety margin), relaxed backwards along the track so the car
// starts braking early enough, plus pure-pursuit steering. Each driver has
// its own pace (a speed multiplier) and its own small line offset, and it
// reads the traffic: a rival coming up behind a slower car aims round it.

export interface Traffic {
  x: number
  z: number
  heading: number
  speed: number
}

export interface AutopilotOptions {
  pace?: number
  lineOffset?: number
  latMargin?: number
  brakeMargin?: number
  /** Spend the boost on long straights, always in the same places. */
  useBoost?: boolean
}

export class Autopilot {
  private readonly vTarget: Float64Array
  private readonly lineOffset: number
  private readonly useBoost: boolean

  constructor(
    private readonly track: Track,
    opts: AutopilotOptions = {},
  ) {
    const pace = opts.pace ?? 1
    // The base profile sits well under the car's lateral grip, so a paced
    // rival scales its whole lap — corners included — without leaving the road.
    const lat = opts.latMargin ?? 0.62 * LAT_GRIP_ROAD
    const brk = opts.brakeMargin ?? 0.8 * BRAKE_A
    const n = track.sampleCount
    const ds = track.spacing
    const vt = new Float64Array(n)
    for (let i = 0; i < n; i++) {
      const k = Math.max(Math.abs(track.curvatureAt(i)), 1e-4)
      // Paced profile; tight corners capped at 0.9 g of the real grip so a
      // fast rival still keeps the car on the road.
      vt[i] = Math.min(Math.sqrt(lat / k) * pace, Math.sqrt((0.9 * LAT_GRIP_ROAD) / k), V_MAX_ROAD)
    }
    // Backward relaxation (twice around the loop for wrap-around): every
    // sample may not exceed the speed from which braking reaches v[i+1].
    for (let pass = 0; pass < 2; pass++) {
      for (let i = 2 * n - 1; i >= 0; i--) {
        const j = (i + 1) % n
        const here = i % n
        vt[here] = Math.min(vt[here], Math.sqrt(vt[j] * vt[j] + 2 * brk * ds))
      }
    }
    this.vTarget = vt
    this.lineOffset = opts.lineOffset ?? 0
    this.useBoost = opts.useBoost ?? false
  }

  /** Metres of track ahead before the next corner (|curvature| above `limit`). */
  private straightAhead(idx: number, maxM = 400, limit = 0.012): number {
    const ds = this.track.spacing
    const step = Math.max(1, Math.round(4 / ds))
    for (let k = 0; k * 4 <= maxM; k++) {
      if (Math.abs(this.track.curvatureAt(idx + k * step)) > limit) return k * 4
    }
    return maxM
  }

  drive(car: Car, projIdx: number, traffic: Traffic[] = []): CarInput {
    const track = this.track
    const n = track.sampleCount
    const ds = track.spacing
    const idx = ((projIdx % n) + n) % n
    const v = car.speed

    // The boost: burn while there is room to brake for the corner at the end
    // of the straight. Pure state, no timers: the same places every time.
    const straight = this.straightAhead(idx)
    const vCorner = 26 // pace a corner at the end of a boost window is taken at
    const brakeM = Math.max(0, (v * v - vCorner * vCorner) / (2 * 0.9 * BRAKE_A))
    let boost = 0
    if (this.useBoost && car.boostCharge > 0.55 && v > 28 && straight > brakeM + 20) {
      boost = 1
    }

    // While burning, aim at the boost limit so the throttle stays open.
    const target = boost > 0 ? V_MAX_BOOST : this.vTarget[idx]

    const dv = target - v
    let throttle = clamp((dv - 0.2) / 2, 0, 1)
    let brake = v > 0.5 ? clamp((-dv - 0.2) / 1.5, 0, 1) : 0

    // Read the traffic: the nearest car ahead in my lane-ish.
    const fx = Math.cos(car.heading)
    const fz = Math.sin(car.heading)
    let offset = this.lineOffset
    let look = clamp(4 + 0.55 * v, 5, 26)
    let blocked: { ahead: number; lat: number; speed: number } | null = null
    for (const o of traffic) {
      const rx = o.x - car.x
      const rz = o.z - car.z
      const ahead = rx * fx + rz * fz
      if (ahead <= 0 || ahead > OVERTAKE_LOOK) continue
      const lat = -rx * fz + rz * fx
      if (Math.abs(lat) > 3.4) continue
      if (!blocked || ahead < blocked.ahead) blocked = { ahead, lat, speed: o.speed }
    }
    if (blocked) {
      // Go round on the side the car in front is not on.
      const side =
        blocked.lat > 0.3 ? -1 : blocked.lat < -0.3 ? 1 : this.lineOffset >= 0 ? -1 : 1
      offset = side * OVERTAKE_OFFSET
      look = Math.min(look, 16)
      const closing = v - blocked.speed
      if (blocked.ahead < 12 && closing > 0.5) throttle = Math.min(throttle, 0.35)
      if (blocked.ahead < 7 && closing > 3) brake = Math.max(brake, 0.4)
    }

    // Pure pursuit: aim at a point on the centreline ahead, offset to my
    // line — but the tighter the corner there, the closer to the centreline
    // the aim, so offsets and passes never push the line off the road.
    const steps = Math.round(look / ds)
    const aim = track.pointAt(idx + steps)
    const kAim = Math.abs(track.curvatureAt(idx + steps))
    const effOffset = offset / (1 + 60 * kAim)
    const t = track.tangentAt(idx + steps)
    const aimX = aim.x + -t.z * effOffset
    const aimZ = aim.z + t.x * effOffset
    const rel = Math.atan2(aimZ - car.z, aimX - car.x)
    const steer = clamp(wrapAngle(rel - car.heading) * 1.8, -1, 1)

    return { throttle, brake, steer, boost }
  }
}
