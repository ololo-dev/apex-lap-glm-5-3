import { pathToFileURL } from 'node:url'
import { runLap } from './core/sim'

// A lap without a browser: the built-in driver drives one lap under the same
// rules the page uses — same track, same physics, same fixed timestep — with
// no browser and no window. Prints one line of JSON. Deterministic: run it
// twice, the same line comes out.

export interface LapResult {
  laps: number
  time: number
  offRoad: number
}

const num = (x: number): number => Math.round(x * 1000) / 1000

export function formatResultLine(r: LapResult): string {
  return `{"laps": ${r.laps}, "time": ${num(r.time)}, "offRoad": ${num(r.offRoad)}}`
}

function isEntry(): boolean {
  return process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href
}

if (isEntry()) {
  console.log(formatResultLine(runLap()))
}
