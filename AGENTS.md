# Oxbow Ring — a browser racing game

One car, one circuit, three rivals, the clock. A 3D racing game that runs in
the browser: a three-lap race of the Vantor GT-12 against three self-driving
rivals, from a countdown grid to a results table, with a demo autopilot and
headless lap and race runners.

The player's car is the **Vantor GT-12** (invented). The rivals are the
**Kestrel S2**, **Sable R** and **Marrow GT** (invented). The circuit is the
**Oxbow Ring** (invented): a closed, smooth curve through the twelve given
points, 12 m wide, start line across the road at point A.

## Stack

- **TypeScript** everywhere, **Vite** for the dev server and build.
- **Three.js** for the 3D rendering — an npm dependency, never vendored.
- **Vitest** for the unit tests, **tsx** to run TypeScript in Node without a
  browser, **Playwright** (Chromium/Chrome) to record the demo video.

## Layout

- `src/core/` — the rules of car and road. Pure TypeScript: no DOM, no
  Three.js, no window. Fixed timestep (1/120 s) so every machine drives the
  same race.
  - `config.ts` — every tunable number, named.
  - `spline.ts` — centripetal Catmull-Rom through the twelve points, closed.
  - `track.ts` — the circuit: uniform centreline, tangents, curvature, road
    width, on/off-road test, nearest-point projection, start line.
  - `physics.ts` — the car: throttle, brake/reverse, steering, grip (a corner
    taken too fast carries the car wide), 216 km/h on the road, 72 km/h off it.
  - `lap.ts` — lap counting: twelve points in order, then the start line;
    timers, last/best lap, wrong-way and off-road bookkeeping.
  - `ai.ts` — the demo driver: speed profile from curvature, brakes for
    corners, pure-pursuit steering, its own pace and line, and it reads the
    traffic — a rival coming up behind a slower car aims round it.
  - `race.ts` — the race: grid, countdown 3-2-1-GO, three rivals, positions,
    contact between cars, the results table, and the headless race runner.
  - `sim.ts` — track + car + laps + autopilot in one fixed-step simulation.
  - `clock.ts` — the fixed-step accumulator (fewer pictures, same distance).
- `src/render/` — Three.js scene: road, edges, curbs, start gantry, grid
  slots, roadside props, the car meshes, chase camera. Reads geometry from
  `core`, never mutates it.
- `src/ui/hud.ts` — DOM HUD: speed in km/h, place, lap, lap times, standings,
  countdown, off-road warning, results table.
- `src/main.ts` — wires input, race, rendering, HUD, recorder.
- `src/headless.ts` — one lap, no browser: drives it under the same rules
  the page uses and prints one line of JSON.
- `src/headless-race.ts` — the whole race, no browser: prints one line of
  JSON with every car in finishing order.
- `scripts/record.ts` — builds the game, serves it, records the demo race in
  Chromium, saves the `docs/race/` and `docs/demo/` recordings and stills.
- `docs/race/` — the race recording and its stills. `docs/demo/` — the demo
  recording and its stills.

## Commands

run: npm run dev
test: npm test
coverage: npm run coverage
lap: npm run lap
race: npm run race

- `npm run dev` serves the game at http://localhost:5173
- `npm test` runs the unit suite (the core rules — no browser needed)
- `npm run coverage` runs the suite with V8 coverage over `src/core` and the
  headless runners (the render/UI layer is exercised by the recording
  pipeline, not by unit tests)
- `npm run lap` drives one lap headlessly, no browser, no window, and prints
  one line of JSON, e.g. `{"laps": 1, "time": 47.983, "offRoad": 0}`.
  Deterministic: run it twice, the line is the same.
- `npm run race` drives the whole three-lap race headlessly — the player's
  car by the built-in driver — and prints one line of JSON with every car in
  finishing order, e.g. `{"laps": 3, "results": [{"name": "Kestrel S2",
  "time": 129.258, "best": 42.367}, ...]}`. Deterministic as well.
- `npm run record` records the demo race and writes `docs/race/` and
  `docs/demo/` (builds and serves the game itself, needs Chrome or Chromium).

## Driving

- ↑/W throttle · ↓/S brake, hold longer to reverse · ←→/A D steer
- **P** autopilot demo (drives the player's whole race) · any driving key
  takes the car back · **N** new race · **Enter** new race from the results

## Numbers that matter

| | |
|---|---|
| ground | flat, metres; x east, z south |
| road | 12 m wide smooth closed curve through A…L |
| on the road | 216 km/h, no more |
| off the road | held to 72 km/h |
| timestep | fixed 1/120 s, render follows the wall clock |
| race | 3 laps, 4 cars, grid two by two, player last, countdown 3-2-1-GO |
| rivals | own name, colour and pace; quickest about a tenth faster than the slowest |
