import { DT } from './config'

// The fixed-step accumulator: the game moves by the clock, not by the frame
// rate. A slow page draws fewer pictures and covers the same distance in a
// second; a fast one draws more, and drives no further.

export class FixedStepRunner {
  private acc = 0

  constructor(
    readonly dt: number = DT,
    private readonly maxFrame = 0.25,
  ) {}

  /** Feed one render-frame delta; returns how many fixed steps to run. */
  frame(frameSeconds: number): number {
    this.acc = Math.min(this.acc + Math.max(0, Math.min(frameSeconds, this.maxFrame)), this.maxFrame)
    let steps = 0
    while (this.acc >= this.dt - 1e-9) {
      this.acc -= this.dt
      steps++
    }
    return steps
  }

  /** Fraction of a step towards the next fixed tick, for render interpolation. */
  get alpha(): number {
    return Math.min(this.acc / this.dt, 1)
  }
}
