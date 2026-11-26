// Usage: node tools/florist-proof.mjs http://127.0.0.1:3000 /tmp/florist-proof [chromium|webkit]
import { chromium, webkit } from 'playwright'
import { mkdir } from 'node:fs/promises'
import { resolve, join } from 'node:path'
import { execFileSync } from 'node:child_process'

const [, , address, destination, engine = 'chromium'] = process.argv
if (!address || !destination || !['chromium', 'webkit'].includes(engine)) throw new Error('Supply a local app URL, an output directory, and optionally a browser.')
const root = resolve(destination), art = join(root, 'cards')
await mkdir(art, { recursive: true })
const browser = await (engine === 'webkit' ? webkit : chromium).launch(engine === 'chromium' ? { args: ['--enable-unsafe-swiftshader'] } : {})
const file = (i, suffix) => join(art, `${String(i).padStart(2, '0')}${suffix}.png`)
const seed = 1748091600123, selected = [1, 28, 46], times = [700, 1250, 1900, 2700, 3600, 4650]
try {
  const page = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1, serviceWorkers: 'block' })
  const open = page.getByRole('button', { name: 'Open your flowers', exact: true }), stage = page.locator('.flower-stage')
  const visit = async i => {
    const url = new URL(address)
    url.searchParams.set('bouquet', `v3-${(seed + i).toString(16)}`)
    await page.goto(url.href)
    await page.locator(`canvas[data-version="3"][data-seed="${seed + i}"]`).waitFor({ state: 'attached' })
  }
  for (let i = 0; i < 60; i++) {
    await visit(i)
    await open.press('Enter')
    await page.locator('canvas').blur()
    await stage.screenshot({ path: file(i, '') })
  }
  const sheet = join(root, 'contact60.jpg')
  execFileSync('magick', ['montage', ...Array.from({ length: 60 }, (_, i) => file(i, '')), '-tile', '10x6', '-geometry', '+2+3', '-background', '#f4e6dc', sheet])
  execFileSync('magick', [sheet, '-colorspace', 'Gray', join(root, 'contact60-gray.jpg')])
  for (const i of selected) {
    await visit(i)
    await page.clock.install()
    await page.clock.pauseAt(new Date(Date.now() + (i + 1) * 30_000))
    await open.dispatchEvent('click', { detail: 1 })
    let prior = 0
    for (const t of times) {
      await page.clock.fastForward(t - prior)
      prior = t
      await stage.screenshot({ path: file(i, `-t${t}`) })
    }
    await page.getByRole('button', { name: 'Look closer', exact: true }).press('Enter')
    await stage.screenshot({ path: file(i, '-close') })
    await page.clock.resume()
    execFileSync('magick', [...times.map(t => file(i, `-t${t}`)), '+append', join(root, `reveal-${i}.jpg`)])
  }
} finally { await browser.close() }
