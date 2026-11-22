import { type RacerStatus, type RaceStatus, cssColor } from '../core/race'

// The page's account of the race: speed in km/h, the player's place,
// lap, lap time, last and best lap, the standings, the countdown, and —
// when the player's race is over — the results table.

export function formatLapTime(t: number | null): string {
  if (t === null) return '--:--.---'
  const m = Math.floor(t / 60)
  const s = t - m * 60
  return `${m}:${s.toFixed(3).padStart(6, '0')}`
}

export class Hud {
  private readonly kmh: HTMLElement
  private readonly lap: HTMLElement
  private readonly place: HTMLElement
  private readonly lapTime: HTMLElement
  private readonly last: HTMLElement
  private readonly best: HTMLElement
  private readonly offroad: HTMLElement
  private readonly wrongway: HTMLElement
  private readonly demo: HTMLElement
  private readonly countdown: HTMLElement
  private readonly standings: HTMLElement
  private readonly results: HTMLElement
  private readonly resultsBody: HTMLElement
  private readonly flashEl: HTMLElement
  private flashTimer: number | undefined

  constructor(root: HTMLElement) {
    const el = (cls: string, html: string) => {
      const d = document.createElement('div')
      d.className = cls
      d.innerHTML = html
      return d
    }

    const timing = el('panel', `
      <div class="trackname">Oxbow Ring · Vantor GT-12</div>
      <div class="row"><span class="label">LAP</span><b id="lap">–</b></div>
      <div class="row"><span class="label">PLACE</span><b id="place">–</b></div>
      <div class="row"><span class="label">TIME</span><b id="lapTime">--:--.---</b></div>
      <div class="row"><span class="label">LAST</span><b id="last">--:--.---</b></div>
      <div class="row"><span class="label">BEST</span><b id="best">--:--.---</b></div>`)
    timing.id = 'timing'

    const speed = el('panel', `<b>0</b><small>km/h</small>`)
    speed.id = 'speed'

    const standings = el('panel', '')
    standings.id = 'standings'

    const alerts = document.createElement('div')
    alerts.id = 'alerts'
    const badge = (id: string, text: string, hidden = true) => {
      const b = document.createElement('div')
      b.className = 'badge'
      b.id = id
      b.textContent = text
      if (hidden) b.style.display = 'none'
      return b
    }
    const offroad = badge('offroad', 'OFF ROAD · 72 km/h')
    const wrongway = badge('wrongway', 'WRONG WAY')
    const demo = badge('demo', 'AUTO-PILOT · press any key')
    alerts.append(offroad, wrongway, demo)

    const countdown = el('', '')
    countdown.id = 'countdown'

    const results = el('panel', `
      <div class="trackname">RACE RESULTS · 3 LAPS</div>
      <table><thead><tr><th></th><th></th><th class="num">RACE</th><th class="num">BEST LAP</th></tr></thead>
      <tbody id="resultsBody"></tbody></table>
      <div class="newrace"><button id="newrace">NEW RACE</button><span>or press <kbd>N</kbd></span></div>`)
    results.id = 'results'
    results.style.display = 'none'

    const flash = el('', '')
    flash.id = 'flash'

    const controls = el('', `
      <kbd>↑</kbd>/<kbd>W</kbd> throttle · <kbd>↓</kbd>/<kbd>S</kbd> brake, hold to reverse ·
      <kbd>←</kbd><kbd>→</kbd>/<kbd>A</kbd><kbd>D</kbd> steer · <kbd>P</kbd> auto-pilot · <kbd>N</kbd> new race`)
    controls.id = 'controls'

    root.append(timing, speed, standings, alerts, countdown, results, flash, controls)

    this.kmh = speed.querySelector('b')!
    this.lap = timing.querySelector('#lap')!
    this.place = timing.querySelector('#place')!
    this.lapTime = timing.querySelector('#lapTime')!
    this.last = timing.querySelector('#last')!
    this.best = timing.querySelector('#best')!
    this.offroad = offroad
    this.wrongway = wrongway
    this.demo = demo
    this.countdown = countdown
    this.standings = standings
    this.results = results
    this.resultsBody = results.querySelector('#resultsBody')!
    this.flashEl = flash

    results.querySelector('#newrace')!.addEventListener('click', () => {
      window.dispatchEvent(new CustomEvent('newrace'))
    })
  }

  update(s: RaceStatus): void {
    const player = s.racers.find((r) => r.isPlayer)!
    this.kmh.textContent = String(Math.round(player.speedKmh))
    this.lap.textContent = player.lapNumber > 0 ? `${player.lapNumber} / 3` : '–'
    this.place.textContent = s.playerPlace
    this.lapTime.textContent = formatLapTime(player.lapTime)
    this.last.textContent = formatLapTime(player.lastLap)
    this.best.textContent = formatLapTime(s.playerBestLap)
    this.offroad.style.display = player.onRoad ? 'none' : 'block'
    this.wrongway.style.display = player.wrongWay ? 'block' : 'none'
    this.demo.style.display = s.playerAuto && s.phase !== 'over' ? 'block' : 'none'

    // Countdown / GO
    if (s.phase === 'countdown') {
      this.countdown.textContent = String(Math.max(1, Math.ceil(s.countdown)))
      this.countdown.style.opacity = '1'
    } else if (s.raceTime < 1) {
      this.countdown.textContent = 'GO'
      this.countdown.style.opacity = '1'
    } else {
      this.countdown.style.opacity = '0'
    }

    // Standings: place, colour dot, name, lap.
    const rows = [...s.racers]
      .sort((a, b) => a.place - b.place)
      .map(
        (r) =>
          `<div class="srow${r.isPlayer ? ' me' : ''}"><span>${r.place}</span>` +
          `<i style="background:${cssColor(r.color)}"></i><span class="nm">${r.name}</span>` +
          `<span class="st">${r.finished ? 'FIN' : r.lapNumber > 0 ? 'L' + r.lapNumber : '–'}</span></div>`,
      )
      .join('')
    this.standings.innerHTML = `<div class="trackname">STANDINGS</div>${rows}`

    // Results, once the player's race is over.
    if (s.phase === 'over') {
      const finishers = s.racers.filter((r) => r.finished).sort((a, b) => (a.finishTime ?? 0) - (b.finishTime ?? 0))
      const racing = s.racers.filter((r) => !r.finished).sort((a, b) => a.place - b.place)
      const row = (r: RacerStatus, i: number) =>
        `<tr class="${r.isPlayer ? 'me' : ''}"><td>${i + 1}</td>` +
        `<td><i style="background:${cssColor(r.color)}"></i>${r.name}</td>` +
        `<td class="num">${r.finished ? formatLapTime(r.finishTime) : 'on the road'}</td>` +
        `<td class="num">${formatLapTime(r.bestLap)}</td></tr>`
      this.resultsBody.innerHTML = [...finishers, ...racing].map(row).join('')
      this.results.style.display = 'block'
    } else {
      this.results.style.display = 'none'
    }
  }

  flash(text: string, color = '#eef2f6'): void {
    this.flashEl.textContent = text
    this.flashEl.style.color = color
    this.flashEl.style.opacity = '1'
    clearTimeout(this.flashTimer)
    this.flashTimer = window.setTimeout(() => {
      this.flashEl.style.opacity = '0'
    }, 2600)
  }
}
