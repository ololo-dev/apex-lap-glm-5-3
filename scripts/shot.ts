// Throwaway eyeball tool: serve build, open page, drive demo N seconds, shoot.
import { chromium } from 'playwright'

const url = process.argv[2] ?? 'http://localhost:4173/?demo=1'
const wait = Number(process.argv[3] ?? 5)
const out = process.argv[4] ?? 'docs/demo/tmp/shot.png'

const browser = await chromium.launch({ channel: 'chrome' })
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } })
await page.goto(url)
await page.waitForFunction(() => (window as { __gameReady?: boolean }).__gameReady === true, undefined, { timeout: 15000 })
await page.waitForTimeout(wait * 1000)
const s = (await page.evaluate(() => (window as { __status: () => unknown }).__status())) as {
  kmh?: number
  x?: number
  z?: number
  laps?: number
}
console.log('status', JSON.stringify(s))
await page.screenshot({ path: out })
await browser.close()
console.log('saved', out)
