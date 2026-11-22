import { pathToFileURL } from 'node:url'
import { formatRaceLine, runRace } from './core/race'

// A race without a browser: the whole race driven under the same rules the
// page uses — the player's car by the built-in driver, three rivals at their
// own pace — with no browser and no window. Prints one line of JSON:
// {"laps": 3, "results": [...]}. Deterministic: run it twice, the same line.

function isEntry(): boolean {
  return process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href
}

if (isEntry()) {
  console.log(formatRaceLine(runRace()))
}
