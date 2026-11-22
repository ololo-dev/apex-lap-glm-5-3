import {
  LINE_HALF,
  PASS_RADIUS,
  ROAD_HALF_WIDTH,
  WRONG_WAY_SPEED,
  WRONG_WAY_TIME,
} from './config'
import type { Car } from './physics'
import type { Projection, Track } from './track'
import { vec } from './vec'

// Lap rules. A lap passes the twelve points in order (the car starts on A, so
// the checkpoints are B..L) and then crosses the start line at A forward.
// Crossing the line the wrong way, or cutting across the middle and missing a
// point, counts nothing.

export class LapCounter {
  /** Laps completed. */
  lapCount = 0
  lapActive = false
  /** Seconds of the lap being driven. */
  lapTime = 0
  lastLap: number | null = null
  bestLap: number | null = null
  /** Seconds off the road during the lap being driven. */
  offRoadTime = 0
  lastOffRoad: number | null = null
  wrongWay = false

  private nextCheckpoint = 1
  // The car starts on the line, where f = 0; arming prevF to 0 means the
  // first forward step across it starts lap 1.
  private prevF = 0
  private wrongTimer = 0

  constructor(private readonly track: Track) {}

  update(car: Car, proj: Projection, dt: number): void {
    const track = this.track
    if (this.lapActive && proj.dist > ROAD_HALF_WIDTH) this.offRoadTime += dt

    // Velocity along the track: negative means driving the circuit backwards.
    const vx = Math.cos(car.heading) * car.speed
    const vz = Math.sin(car.heading) * car.speed
    const t = track.tangentAt(proj.idx)
    const forward = vx * t.x + vz * t.z
    this.wrongTimer = forward < -WRONG_WAY_SPEED ? this.wrongTimer + dt : 0
    this.wrongWay = this.wrongTimer > WRONG_WAY_TIME

    // Checkpoints: the next point in order, passed within radius, moving forward.
    if (this.nextCheckpoint < track.waypointCount) {
      const wp = track.waypoint(this.nextCheckpoint)
      const near = Math.hypot(car.x - wp.x, car.z - wp.z)
      const twp = track.waypointTangent(this.nextCheckpoint)
      if (near < PASS_RADIUS && vx * twp.x + vz * twp.z > 0) {
        this.nextCheckpoint++
      }
    }

    // Start line: signed distance along the track direction at A.
    const rx = car.x - track.startPos.x
    const rz = car.z - track.startPos.z
    const f = rx * track.startTangent.x + rz * track.startTangent.z
    const g = Math.abs(rx * track.startNormal.x + rz * track.startNormal.z)
    const pf = this.prevF
    this.prevF = f
    if (pf !== null && pf <= 0 && f > 0 && g <= LINE_HALF) {
      if (!this.lapActive) {
        this.beginLap()
      } else if (this.nextCheckpoint >= track.waypointCount) {
        this.completeLap()
      }
      // Else: crossing the line early or after a cut — no lap counted.
    }
    if (this.lapActive) this.lapTime += dt
  }

  private beginLap(): void {
    this.lapActive = true
    this.lapTime = 0
    this.offRoadTime = 0
    this.nextCheckpoint = 1
  }

  private completeLap(): void {
    this.lapCount++
    this.lastLap = this.lapTime
    this.lastOffRoad = this.offRoadTime
    if (this.bestLap === null || this.lapTime < this.bestLap) this.bestLap = this.lapTime
    this.beginLap() // the next lap starts on the same crossing
  }

  reset(): void {
    this.lapCount = 0
    this.lapActive = false
    this.lapTime = 0
    this.lastLap = null
    this.bestLap = null
    this.offRoadTime = 0
    this.lastOffRoad = null
    this.wrongWay = false
    this.nextCheckpoint = 1
    this.prevF = 0
    this.wrongTimer = 0
  }
}

/** Velocity vector helper (used by HUD-style consumers and tests). */
export const carVelocity = (car: Car): { x: number; z: number } =>
  vec(Math.cos(car.heading) * car.speed, Math.sin(car.heading) * car.speed)
