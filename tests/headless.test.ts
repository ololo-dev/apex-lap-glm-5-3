import { describe, expect, it } from 'vitest'
import { runLap } from '../src/core/sim'
import { formatResultLine } from '../src/headless'

// The `lap:` command's contract: one line of JSON, deterministic across runs.
describe('a lap without a browser', () => {
  it('prints one line of JSON with the lap and the off-road time', () => {
    const line = formatResultLine({ laps: 1, time: 44.442, offRoad: 0 })
    expect(line).toBe('{"laps": 1, "time": 44.442, "offRoad": 0}')
    expect(line).toMatch(/^\{"laps": \d+, "time": \d+(\.\d+)?, "offRoad": \d+(\.\d+)?\}$/)
  })

  it('rounds to milliseconds so the line is stable', () => {
    expect(formatResultLine({ laps: 1, time: 42.4999999, offRoad: 0.0004 })).toBe(
      '{"laps": 1, "time": 42.5, "offRoad": 0}',
    )
  })

  it('drives one lap under the same rules the page uses', () => {
    const a = runLap()
    const b = runLap()
    expect(a.laps).toBe(1)
    expect(a.time).toBeGreaterThan(20)
    expect(a.offRoad).toBe(0)
    expect(b).toEqual(a) // run it again, the same line comes out
  })
})
