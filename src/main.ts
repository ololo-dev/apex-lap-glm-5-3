import { FixedStepRunner } from './core/clock'
import { Race, type RaceStatus } from './core/race'
import { buildTrack, showcaseWaypoint } from './core/track'
import { buildCar } from './render/carMesh'
import { ChaseCamera } from './render/chase'
import { buildGridMarks } from './render/gridMarks'
import { buildProps } from './render/props'
import { createWorld } from './render/scene'
import { buildTrackMeshes } from './render/trackMesh'
import { startRecorder, type AutoRecorder } from './recorder'
import { formatLapTime } from './ui/hud'
import { Hud } from './ui/hud'

// The game: a three-lap race — the player's Vantor GT-12 against three
// rivals, from a countdown grid to a results table. Input, fixed-step
// simulation, three.js scene, HUD, and (when asked) the screencast recorder.
// ?demo=1 starts in autopilot, ?record=1 records the race and offers the
// webm as a download.

const params = new URLSearchParams(location.search)
const startInDemo = params.has('demo')
const recording = params.has('record')

const track = buildTrack()
const race = new Race({ playerAuto: startInDemo })
const world = createWorld(document.getElementById('app')!, { preserveDrawingBuffer: recording })
world.scene.add(buildTrackMeshes(track), buildProps(track), buildGridMarks(track, race.racers.length))
const cars = race.racers.map((r) => buildCar(r.color))
for (const c of cars) world.scene.add(c.group)
const chase = new ChaseCamera(world.camera)
const hud = new Hud(document.getElementById('hud')!)

const snapCamera = () => {
  const p = race.player()
  chase.snap(p.car.x, p.car.z, p.car.heading)
}
snapCamera()
const prevHeadings = race.racers.map((r) => r.car.heading)

// ---- input ---------------------------------------------------------------
const keys = new Set<string>()
const drive = new Set(['ArrowUp', 'KeyW', 'ArrowDown', 'KeyS', 'ArrowLeft', 'KeyA', 'ArrowRight', 'KeyD'])
let steer = 0 // the wheel eases between the keys and full lock

window.addEventListener('keydown', (e) => {
  if (e.repeat) return
  if (drive.has(e.code)) {
    e.preventDefault()
    if (race.playerAutoOn) race.setPlayerAuto(false) // any driving key takes the car back
    keys.add(e.code)
  }
  if (e.code === 'KeyP') {
    race.setPlayerAuto(!race.playerAutoOn)
    hud.flash(race.playerAutoOn ? 'AUTO-PILOT' : 'MANUAL', '#7ee0ff')
  }
  if (e.code === 'KeyN' || (e.code === 'Enter' && race.phase === 'over')) {
    newRace()
  }
})
window.addEventListener('keyup', (e) => keys.delete(e.code))
window.addEventListener('newrace', newRace)

function newRace(): void {
  race.reset()
  keys.clear()
  steer = 0
  lapWasOver = false
  lastLaps = 0
  snapCamera()
  hud.flash('NEW RACE')
}

const steerTarget = () =>
  (keys.has('ArrowRight') || keys.has('KeyD') ? 1 : 0) - (keys.has('ArrowLeft') || keys.has('KeyA') ? 1 : 0)

// ---- recorder + event marks (record mode only) ----------------------------
type Mark = { t: number; type: 'grid' | 'lapStart' | 'corner' | 'lapDone' | 'rival' | 'results' }
const marks: Mark[] = []
let recorder: AutoRecorder | null = null
const showcase = showcaseWaypoint(track)
const showcasePos = track.waypoint(showcase)
let cornerMarked = false
let rivalMarked = false
let gridMarked = false
let lapWasLive = false
let stopTimer: number | undefined

// ---- the loop: fixed steps by the clock, pictures when there's time ------
const runner = new FixedStepRunner()
let last: number | undefined
let lastLaps = 0
let lapWasOver = false
let lapDoneMarked = false
let status: RaceStatus = race.status()

const frame = (now: number): void => {
  const dt = last === undefined ? 0 : (now - last) / 1000
  last = now

  steer += (steerTarget() - steer) * Math.min(1, dt * 22)
  if (Math.abs(steer) < 0.01) steer = steerTarget()
  race.setPlayerInput({
    throttle: keys.has('ArrowUp') || keys.has('KeyW') ? 1 : 0,
    brake: keys.has('ArrowDown') || keys.has('KeyS') ? 1 : 0,
    steer,
  })

  const steps = runner.frame(dt)
  for (let i = 0; i < steps; i++) race.step()
  status = race.status()

  // Draw every car; the camera follows the player.
  race.racers.forEach((r, i) => {
    const omega = steps > 0 ? (r.car.heading - prevHeadings[i]!) * 120 : 0
    cars[i].update(
      { x: r.car.x, z: r.car.z, heading: r.car.heading, speed: r.car.speed, steer: r.lastInput.steer, omega },
      Math.max(dt, 0.001),
    )
    prevHeadings[i] = r.car.heading
  })
  const player = race.player()
  chase.update(player.car.x, player.car.z, player.car.heading, player.car.speed, dt)

  // The sun and its shadow box follow the player.
  world.sunTarget.position.set(player.car.x, 0, player.car.z)
  world.sun.position.set(player.car.x + 60, 110, player.car.z + 30)

  // Lap bookkeeping on screen.
  if (player.laps.lapCount > lastLaps) {
    const t = player.laps.lastLap ?? 0
    const isBest = player.laps.bestLap !== null && Math.abs(player.laps.bestLap - t) < 1e-9
    hud.flash(
      `LAP ${player.laps.lapCount} — ${formatLapTime(t)}${isBest && player.laps.lapCount > 1 ? ' · BEST' : ''}`,
      isBest ? '#7ee0ff' : '#eef2f6',
    )
    lastLaps = player.laps.lapCount
  }
  if (status.phase === 'over' && !lapWasOver) {
    hud.flash(`FINISHED — ${status.playerPlace}`, '#ffd166')
    lapWasOver = true
  }
  hud.update(status)

  // Record-mode marks: video-relative times of the moments worth stilling.
  if (recorder && steps > 0) {
    const vt = performance.now() - recorder.t0
    if (!gridMarked && status.phase === 'countdown' && status.countdown < 2.4) {
      gridMarked = true
      marks.push({ t: vt, type: 'grid' })
    }
    const lapLive = status.playerLapTime !== null
    if (lapLive && !lapWasLive) marks.push({ t: vt, type: 'lapStart' })
    if (!cornerMarked && lapLive && Math.hypot(player.car.x - showcasePos.x, player.car.z - showcasePos.z) < 16) {
      cornerMarked = true
      marks.push({ t: vt, type: 'corner' })
    }
    if (!lapDoneMarked && status.phase === 'racing' && player.laps.lapCount >= 1) {
      lapDoneMarked = true
      marks.push({ t: vt, type: 'lapDone' })
    }
    if (!rivalMarked && status.phase === 'racing' && status.raceTime > 4) {
      const near = race.racers.some(
        (r) => !r.isPlayer && Math.hypot(r.car.x - player.car.x, r.car.z - player.car.z) < 30,
      )
      if (near) {
        rivalMarked = true
        marks.push({ t: vt, type: 'rival' })
      }
    }
    if (player.finished && stopTimer === undefined) {
      marks.push({ t: vt, type: 'results' })
      stopTimer = window.setTimeout(() => recorder?.stop(), 3500)
    }
    lapWasLive = lapLive
  }

  world.renderer.render(world.scene, world.camera)
  requestAnimationFrame(frame)
}

// Expose a little telemetry for the record script; harmless in normal play.
declare global {
  interface Window {
    __status: () => RaceStatus
    __marks: () => Mark[]
    __gameReady: boolean
  }
}
window.__status = () => status
window.__marks = () => marks
window.__gameReady = true

if (recording) recorder = startRecorder(world.renderer.domElement)
requestAnimationFrame(frame)
