import { describe, expect, it } from 'vitest'
import {
  BRAKE_A,
  DRAG_A,
  LAT_GRIP_ROAD,
  STEER_REF_V,
  V_MAX_OFF,
  V_MAX_REVERSE,
  V_MAX_ROAD,
} from '../src/core/config'
import { type Car, stepCar } from '../src/core/physics'
import { buildTrack } from '../src/core/track'

const track = buildTrack()

const freshCar = (): Car => ({ x: 0, z: 0, heading: 0, speed: 0 })

// Place the car on a long straight bit of road (the A->B run) pointing east.
const carOnRoad = (speed: number): Car => ({ x: 60, z: 0, heading: 0, speed })

const offRoadSpot = { x: 60, z: 40 } // 40 m south of the A->B straight

const full = { throttle: 1, brake: 0, steer: 0, boost: 0 }
const coast = { throttle: 0, brake: 0, steer: 0, boost: 0 }
const brakes = { throttle: 0, brake: 1, steer: 0, boost: 0 }

describe('the car on the road', () => {
  it('gains speed up to 216 km/h and never more', () => {
    const car = carOnRoad(0)
    let max = 0
    for (let i = 0; i < 120 * 30; i++) {
      stepCar(car, full, true, 1 / 120)
      max = Math.max(max, car.speed)
    }
    expect(max).toBeLessThanOrEqual(V_MAX_ROAD + 1e-9)
    expect(max * 3.6).toBeGreaterThanOrEqual(215) // it really reaches the cap
    expect(max * 3.6).toBeLessThanOrEqual(216)
  })

  it('slows to a stop when braking, and held longer it reverses', () => {
    const car = carOnRoad(30)
    // Brake until stopped: exactly zero, not a whisker past it.
    for (let i = 0; i < 240 && car.speed > 0; i++) stepCar(car, brakes, true, 1 / 120)
    expect(car.speed).toBe(0)
    // Release: it stays stopped.
    for (let i = 0; i < 120; i++) stepCar(car, coast, true, 1 / 120)
    expect(car.speed).toBe(0)
    // Hold the brake longer: it reverses, up to the reverse cap.
    for (let i = 0; i < 120 * 3; i++) stepCar(car, brakes, true, 1 / 120)
    expect(car.speed).toBeLessThan(0)
    for (let i = 0; i < 120 * 5; i++) stepCar(car, brakes, true, 1 / 120)
    expect(car.speed).toBeCloseTo(-V_MAX_REVERSE, 2) // held at the reverse cap
  })

  it('does not turn on the spot', () => {
    const car = freshCar()
    for (let i = 0; i < 600; i++) stepCar(car, { throttle: 0, brake: 0, steer: 1, boost: 0 }, true, 1 / 120)
    expect(car.heading).toBe(0)
    expect(car.x).toBe(0)
    expect(car.z).toBe(0)
  })

  it('turns as it moves, and the yaw rate is capped by grip', () => {
    const car = carOnRoad(0)
    for (let i = 0; i < 240; i++) stepCar(car, full, true, 1 / 120)
    expect(car.speed).toBeGreaterThan(10) // full steering authority by now
    const before = car.heading
    stepCar(car, { throttle: 1, brake: 0, steer: 1, boost: 0 }, true, 1 / 120)
    const omega = car.heading - before
    expect(omega).toBeGreaterThan(0)
    // Grip: at speed v the car can only turn at LAT_GRIP/v radians per second.
    expect(omega).toBeLessThanOrEqual((LAT_GRIP_ROAD / car.speed) * (1 / 120) + 1e-9)
    // Steering authority ramps with speed.
    const slow = carOnRoad(3)
    const slowBefore = slow.heading
    stepCar(slow, { throttle: 0, brake: 0, steer: 1, boost: 0 }, true, 1 / 120)
    expect(slow.heading - slowBefore).toBeCloseTo((3 / STEER_REF_V) * 2.4 * (1 / 120), 4)
  })

  it('carries a corner wide when taken too fast', () => {
    // At 40 m/s a 30 m-radius corner needs 1.33 rad/s; grip allows 0.325, so
    // the car can only hold a ~123 m radius and runs wide.
    const car = carOnRoad(40)
    const lateral0 = car.z
    for (let i = 0; i < 120; i++) stepCar(car, { throttle: 0, brake: 0, steer: 1, boost: 0 }, true, 1 / 120)
    expect(car.heading).toBeGreaterThan(0.32) // grip allows 13/40 = 0.325 rad/s, no more
    expect(car.heading).toBeLessThan(0.33)
    expect(car.z - lateral0).toBeGreaterThan(1) // it does turn...
    expect(car.z - lateral0).toBeLessThan(8) // ...but far too little to make a tight corner
  })

  it('coasts to a halt on rolling drag', () => {
    const car = carOnRoad(20)
    for (let i = 0; i < 120 * 120; i++) stepCar(car, coast, true, 1 / 120)
    expect(car.speed).toBe(0)
  })
})

describe('the car off the road', () => {
  it('is held to 72 km/h from above', () => {
    const car = { x: offRoadSpot.x, z: offRoadSpot.z, heading: 0, speed: 59 }
    for (let i = 0; i < 120 * 10; i++) stepCar(car, full, false, 1 / 120)
    expect(car.speed).toBeLessThanOrEqual(V_MAX_OFF + 1e-9)
    expect(car.speed).toBeGreaterThanOrEqual(V_MAX_OFF - 0.05) // it settles on the limit
  })

  it('is held to 72 km/h from below', () => {
    const car = { x: offRoadSpot.x, z: offRoadSpot.z, heading: 0, speed: 0 }
    for (let i = 0; i < 120 * 30; i++) stepCar(car, full, false, 1 / 120)
    expect(car.speed).toBeLessThanOrEqual(V_MAX_OFF + 1e-9)
    expect(car.speed * 3.6).toBeGreaterThan(70)
  })

  it('brakes to a clean stop off the road too', () => {
    const car = { x: offRoadSpot.x, z: offRoadSpot.z, heading: 0, speed: 19 }
    for (let i = 0; i < 240 && car.speed > 0; i++) stepCar(car, brakes, false, 1 / 120)
    expect(car.speed).toBe(0)
  })
})

describe('physics hygiene', () => {
  it('is deterministic: same inputs, same state', () => {
    const run = (): number => {
      const car = freshCar()
      let hash = 0
      for (let i = 0; i < 2400; i++) {
        const input = { throttle: (i % 240) < 120 ? 1 : 0, brake: 0, steer: Math.sin(i / 97), boost: 0 }
        stepCar(car, input, (i % 480) < 400, 1 / 120)
        hash = hash * 31 + car.x + car.z * 7 + car.heading * 13 + car.speed * 19
      }
      return hash
    }
    expect(run()).toBe(run())
  })

  it('never exceeds the caps mid-acceleration', () => {
    const car = freshCar()
    for (let i = 0; i < 120 * 20; i++) {
      stepCar(car, full, true, 1 / 120)
      expect(car.speed).toBeLessThanOrEqual(V_MAX_ROAD + 1e-9)
    }
    for (let i = 0; i < 120 * 20; i++) {
      stepCar(car, { ...full }, false, 1 / 120)
      expect(car.speed).toBeLessThanOrEqual(V_MAX_OFF + 1e-9)
    }
  })

  it('brake strength matches the constant (plus rolling drag)', () => {
    const car = carOnRoad(V_MAX_ROAD)
    const before = car.speed
    stepCar(car, brakes, true, 1 / 120)
    expect(before - car.speed).toBeCloseTo((BRAKE_A + DRAG_A) * (1 / 120), 6)
  })

  it('stays measured on the road through a scripted drive', () => {
    // A short manual drive along the A->B straight stays measured and on-road.
    const car = carOnRoad(0)
    for (let i = 0; i < 120 * 3; i++) stepCar(car, full, true, 1 / 120)
    expect(track.onRoad({ x: car.x, z: car.z })).toBe(true)
  })
})
