import {
  BOOST_ENGINE_FACTOR,
  BOOST_RECHARGE,
  BOOST_SECONDS,
  BRAKE_A,
  DRAG_A,
  ENGINE_A,
  LAT_GRIP_OFF,
  LAT_GRIP_ROAD,
  OFFROAD_DECEL,
  REVERSE_A,
  STEER_RATE,
  STEER_REF_V,
  TAPER,
  V_MAX_BOOST,
  V_MAX_OFF,
  V_MAX_REVERSE,
  V_MAX_ROAD,
} from './config'
import { clamp } from './vec'

// Arcade car rules. State is position on the flat ground (x east, z south),
// a heading in radians (0 = east, growing towards south = turning right on
// screen) and a signed speed along the heading. The step is pure: same state
// and inputs in, same state out, no clocks, no chance.

export interface Car {
  x: number
  z: number
  heading: number
  /** Signed speed along the heading, m/s. Negative = reversing. */
  speed: number
  /** Boost charge, 0..1. A full charge burns for BOOST_SECONDS. */
  boostCharge: number
}

export interface CarInput {
  /** 0..1 */
  throttle: number
  /** 0..1 — slows to a stop; held longer, reverses */
  brake: number
  /** -1..1, positive turns right */
  steer: number
  /** 0..1 — held: burn the charge and lift the road limit to 270 km/h */
  boost: number
}

export const cloneCar = (c: Car): Car => ({
  x: c.x,
  z: c.z,
  heading: c.heading,
  speed: c.speed,
  boostCharge: c.boostCharge,
})

export const freshCar = (): Car => ({ x: 0, z: 0, heading: 0, speed: 0, boostCharge: 1 })

/**
 * One fixed step of the car. `onRoad` decides the grip and, with the boost
 * burning, the limit: 216 km/h on the road, 270 while the boost burns,
 * 72 km/h off it no matter what.
 *
 * Steering authority grows with speed (a standing car does not turn on the
 * spot) and the yaw rate is capped by lateral grip: a corner taken too fast
 * carries the car wide. The boost burns while held with charge left (a full
 * charge lasts BOOST_SECONDS) and refills over BOOST_RECHARGE seconds while
 * it is not burning.
 */
export function stepCar(car: Car, input: CarInput, onRoad: boolean, dt: number): void {
  const burning = input.boost > 0 && car.boostCharge > 0
  if (burning) {
    car.boostCharge = Math.max(0, car.boostCharge - dt / BOOST_SECONDS)
  } else {
    car.boostCharge = Math.min(1, car.boostCharge + dt / BOOST_RECHARGE)
  }
  const cap = onRoad ? (burning ? V_MAX_BOOST : V_MAX_ROAD) : V_MAX_OFF
  const v = car.speed

  if (input.throttle > 0 && v < cap) {
    // Engine accel tapering to just past the cap so rolling drag can never
    // hold the car short of its limit; the boost pushes harder still.
    const a = burning ? ENGINE_A * BOOST_ENGINE_FACTOR : ENGINE_A
    car.speed += a * input.throttle * (1 - v / (cap * TAPER)) * dt
  }

  if (input.brake > 0) {
    if (car.speed > 0) {
      car.speed = Math.max(0, car.speed - BRAKE_A * input.brake * dt)
    } else if (car.speed > -V_MAX_REVERSE) {
      car.speed = Math.max(-V_MAX_REVERSE, car.speed - REVERSE_A * input.brake * dt)
    }
  }

  // Rolling resistance, towards zero, never past it.
  const mag = Math.abs(car.speed)
  car.speed = mag <= DRAG_A * dt ? 0 : Math.sign(car.speed) * (mag - DRAG_A * dt)

  // Off the road the car is held to 72 km/h until it is back.
  if (!onRoad && car.speed > V_MAX_OFF) {
    car.speed = Math.max(V_MAX_OFF, car.speed - OFFROAD_DECEL * dt)
  }
  car.speed = Math.min(car.speed, cap)
  car.speed = Math.max(car.speed, -V_MAX_REVERSE)

  // Steering: authority ramps with speed, then the yaw rate is capped by grip.
  const authority = clamp(car.speed / STEER_REF_V, -1, 1)
  const cmd = input.steer * STEER_RATE * authority
  const grip = (onRoad ? LAT_GRIP_ROAD : LAT_GRIP_OFF) / Math.max(Math.abs(car.speed), 1)
  const omega = clamp(cmd, -grip, grip)
  car.heading += omega * dt

  car.x += Math.cos(car.heading) * car.speed * dt
  car.z += Math.sin(car.heading) * car.speed * dt
}
