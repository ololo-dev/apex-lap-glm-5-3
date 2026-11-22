// Throwaway: capture the race-round ux-review artifacts.
import { chromium } from 'playwright'
import { mkdirSync } from 'node:fs'

const OUT = '.ololo/artifacts/ea32b9b4-ecef-4f12-a144-804b7e978261'
mkdirSync(OUT, { recursive: true })

const browser = await chromium.launch({ channel: 'chrome' })

async function session(width: number, height: number) {
  const ctx = await browser.newContext({ viewport: { width, height } })
  const page = await ctx.newPage()
  await page.goto('http://localhost:4173/?demo=1')
  await page.waitForFunction(() => (window as { __gameReady?: boolean }).__gameReady === true, undefined, { timeout: 15000 })
  return page
}

const st = (page: { evaluate: (fn: () => unknown) => Promise<unknown> }) => page.evaluate(() => (window as { __status: () => unknown }).__status()) as Promise<{
  phase: string
  countdown: number
  raceTime: number
  playerPlace: string
  racers: { x: number; z: number; isPlayer: boolean }[]
}>

// countdown.png — "3" showing, four cars on the grid
{
  const page = await session(1280, 720)
  await page.waitForTimeout(350)
  await page.screenshot({ path: `${OUT}/countdown.png` })
  console.log('countdown done')
}

// race.png — rival in view, place + lap readouts
{
  const page = await session(1280, 720)
  await page.waitForFunction(async () => {
    const s = (window as { __status: () => { phase: string; raceTime: number; racers: { x: number; z: number; isPlayer: boolean }[] } }).__status()
    if (s.phase !== 'racing' || s.raceTime < 5) return false
    const p = s.racers.find((r) => r.isPlayer)!
    return s.racers.some((r) => !r.isPlayer && Math.hypot(r.x - p.x, r.z - p.z) < 25)
  }, undefined, { timeout: 60000 })
  await page.screenshot({ path: `${OUT}/race.png` })
  console.log('race done')
}

// results.png — table after the third lap
{
  const page = await session(1280, 720)
  await page.waitForFunction(() => (window as { __status: () => { phase: string } }).__status().phase === 'over', undefined, { timeout: 180000 })
  await page.waitForTimeout(1200)
  await page.screenshot({ path: `${OUT}/results.png` })
  console.log('results done')
}

// results-mobile.png
{
  const page = await session(375, 812)
  await page.waitForFunction(() => (window as { __status: () => { phase: string } }).__status().phase === 'over', undefined, { timeout: 180000 })
  await page.waitForTimeout(1200)
  await page.screenshot({ path: `${OUT}/results-mobile.png` })
  console.log('results-mobile done')
}

// place-mobile.png — racing at narrow width
{
  const page = await session(375, 812)
  await page.waitForFunction(() => (window as { __status: () => { phase: string; raceTime: number } }).__status().raceTime > 6, undefined, { timeout: 60000 })
  await page.screenshot({ path: `${OUT}/place-mobile.png` })
  console.log('place-mobile done')
}

await browser.close()
console.log('all artifacts saved to', OUT)
