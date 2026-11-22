import { describe, expect, it } from 'vitest'
import { DT } from '../src/core/config'
import { FixedStepRunner } from '../src/core/clock'
import { Simulation } from '../src/core/sim'

describe('the fixed-step clock', () => {
  it('moves by the clock, not by the frame rate', () => {
    const runner = new FixedStepRunner()
    let steps = 0
    for (let i = 0; i < 60; i++) steps += runner.frame(1 / 60) // a 60 Hz page
    expect(steps).toBe(Math.round(1 / DT))
  })

  it('covers the same distance in a second on a slow page', () => {
    const runner = new FixedStepRunner()
    let steps = 0
    for (let i = 0; i < 10; i++) steps += runner.frame(1 / 10) // a 10 fps page
    expect(steps).toBe(Math.round(1 / DT))
  })

  it('does not fast-forward after a long freeze', () => {
    const runner = new FixedStepRunner()
    const steps = runner.frame(30) // the tab was hidden for half a minute
    expect(steps).toBeLessThanOrEqual(Math.round(0.25 / DT))
  })

  it('keeps the alpha in [0, 1)', () => {
    const runner = new FixedStepRunner()
    runner.frame(0.0173)
    expect(runner.alpha).toBeGreaterThanOrEqual(0)
    expect(runner.alpha).toBeLessThan(1)
  })

  it('drives the same race through jittery frames as straight fixed steps', () => {
    // Whatever the frame rate, the runner turns wall-clock time into the same
    // fixed steps; stepping the simulation through them is bit-for-bit the
    // same race as stepping it directly.
    const direct = new Simulation({ demo: true })
    const framed = new Simulation({ demo: true })
    const runner = new FixedStepRunner()
    const frameDeltas = [1 / 60, 1 / 60, 1 / 30, 0.021, 0.014, 1 / 45, 0.05, 1 / 144, 1 / 30]
    let fed = 0
    let f = 0
    let driven = 0
    while (fed < 5 - 1e-9) {
      const d = frameDeltas[f++ % frameDeltas.length]
      fed += d
      const steps = runner.frame(d)
      driven += steps
      for (let i = 0; i < steps; i++) framed.step()
    }
    expect(driven).toBeGreaterThan(590) // ~5 s of sim time got simulated
    expect(driven).toBeLessThan(610)
    for (let i = 0; i < driven; i++) direct.step()
    expect(framed.car.x).toBe(direct.car.x)
    expect(framed.car.z).toBe(direct.car.z)
    expect(framed.car.heading).toBe(direct.car.heading)
    expect(framed.car.speed).toBe(direct.car.speed)
  })
})
