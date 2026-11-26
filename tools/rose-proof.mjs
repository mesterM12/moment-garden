// node tools/rose-proof.mjs http://127.0.0.1:3000/ /tmp/rose-study [baseline|candidate] [token]
import { chromium, devices } from 'playwright'
import { mkdir } from 'node:fs/promises'
import { join } from 'node:path'

const [, , address, directory, mode = 'candidate', token = 'v3-1970260fd01'] = process.argv
if (!address || !directory || !['baseline', 'candidate'].includes(mode)) throw new Error('Supply an app URL, an output directory, and optionally baseline or candidate.')
const url = new URL(address)
url.searchParams.set('bouquet', token) // Default: Yours, Always — Claret Rose
await mkdir(directory, { recursive: true })
const browser = await chromium.launch()
try {
  const page = await browser.newPage({ ...devices['iPhone 13'], deviceScaleFactor: 2, serviceWorkers: 'block' })
  const card = page.locator('.flower-postcard'), stage = page.locator('.flower-stage'), art = page.locator('#flower')
  const opener = page.getByRole('button', { name: 'Open your flowers', exact: true })
  const detail = page.getByRole('button', { name: 'Look closer', exact: true })
  const replay = page.getByRole('button', { name: 'Replay bloom', exact: true })
  const visit = async () => {
    await page.goto(url.href)
    await page.locator(`#flower[data-seed="${Number.parseInt(token.replace(/^v3-/, ''), 16)}"]`).waitFor({ state: 'attached' })
    await page.addStyleTag({ content: 'nextjs-portal { display: none }' })
  }
  const shot = (locator, suffix) => locator.screenshot({ path: join(directory, `${mode}-${suffix}.png`), scale: 'css', caret: 'hide' })
  const turn = async steps => {
    for (let i = 0; i < steps; i++) await art.press('ArrowRight')
    await art.blur()
  }
  await visit()
  await shot(card, 'sealed')
  await opener.press('Enter')
  await art.blur()
  await shot(card, 'postcard')
  await detail.press('Enter')
  await detail.blur()
  await shot(stage, 'front')
  await turn(5)
  await shot(stage, 'quarter')
  await turn(5)
  await shot(stage, 'side')

  // Put WebGL's clock at exact beats, independent of screenshot and GPU time.
  await visit()
  await page.clock.install()
  await page.clock.pauseAt(new Date(Date.now() + 1000))
  await opener.dispatchEvent('click', { detail: 1 })
  let prior = 0
  const times = mode === 'baseline' ? [400, 900, 1450, 1800, 3300, 4605] : [600, 900, 1450, 1800, 3300, 4800, 5750, 6505]
  for (const t of times) {
    await page.clock.fastForward(t - prior)
    prior = t
    await art.blur()
    await shot(stage, `t${t}`)
    if (t === 1800) await shot(card, 'held-postcard')
  }
  if (mode === 'candidate') {
    // Grab at the held framing with no movement; let the shape, but not the lens, finish.
    await replay.press('Enter')
    await page.clock.fastForward(1300)
    const box = await art.boundingBox()
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2)
    await page.mouse.down()
    await page.mouse.up()
    await page.clock.fastForward(5300)
    await replay.blur()
    await shot(stage, 'mature-macro')
    await turn(5)
    await shot(stage, 'mature-macro-quarter')
    await turn(5)
    await shot(stage, 'mature-macro-side')
  }
  await page.clock.resume()
  if (mode === 'candidate') {
    await page.emulateMedia({ reducedMotion: 'reduce' })
    await visit()
    await opener.dispatchEvent('click', { detail: 1 })
    await art.blur()
    await shot(card, 'reduced')
  }
} finally {
  await browser.close()
}
