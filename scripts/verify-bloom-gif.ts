// Run against a local production build. Usage: node scripts/verify-bloom-gif.ts http://127.0.0.1:4276
import assert from 'node:assert/strict'
import { mkdir, readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { decompressFrame, parseGIF } from 'gifuct-js'
import { chromium, type Page } from 'playwright'
import { GIF_FINAL_HOLD, GIF_HEIGHT, GIF_WIDTH, bloomGifFrames } from '../src/garden/bloom-gif-format.ts'
import { BLOOM_DURATION } from '../src/garden/bloom-score.ts'

const origin = process.argv[2]
assert(origin, 'Pass a running local production server URL.')
const output = resolve('.cache/bloom-gif-proof')
await mkdir(output, { recursive: true })
const browser = await chromium.launch({ args: ['--enable-webgl', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] })
const context = await browser.newContext({ viewport: { width: 1040, height: 1000 }, reducedMotion: 'reduce' })
const gifts = [
  { seed: '1970260fd01', version: 2 },
  { seed: '1970260fd01', version: 3 }, // Claret rose
  { seed: '1970260fd08', version: 3 }, // Ivory rose
]
const errors: string[] = []

async function openGift(page: Page, token: string, seed: string, version: number) {
  await page.goto(`${origin}/?bouquet=${token}`)
  const opener = page.getByRole('button', { name: 'Open your flowers' })
  await page.waitForFunction(() => document.querySelector('.flower-open:enabled') !== null)
  await opener.press('Enter')
  assert.equal(await page.getByRole('button', { name: 'Replay bloom' }).count(), 0)
  const art = page.locator('#flower')
  assert.equal(await art.getAttribute('data-seed'), String(parseInt(seed, 16)))
  assert.equal(await art.getAttribute('data-version'), String(version))
  await page.addStyleTag({ content: `.flower-stage { inline-size: ${GIF_WIDTH}px; block-size: ${GIF_HEIGHT}px; min-block-size: 0; }` })
  await page.waitForFunction(({ width, height }) => {
    const canvas = document.querySelector<HTMLCanvasElement>('#flower')
    return canvas?.width === width && canvas.height === height
  }, { width: GIF_WIDTH, height: GIF_HEIGHT })
  return art
}

try {
  const page = await context.newPage()
  page.on('pageerror', error => errors.push(error.message))
  await page.goto(origin)
  await page.evaluate(async () => {
    const { active } = await navigator.serviceWorker.ready
    if (!active) throw new Error('The service worker is unavailable.')
    if (active.state === 'activated') return
    await new Promise<void>(resolve => active.addEventListener('statechange', () => {
      if (active.state === 'activated') resolve()
    }))
  })
  let previousFinal: Uint8ClampedArray | undefined
  for (const { seed, version } of gifts) {
    const token = version === 2 ? seed : `v3-${seed}`
    const art = await openGift(page, token, seed, version)
    const finalReference = await art.evaluate((element) => {
      const canvas = element as HTMLCanvasElement
      canvas.dispatchEvent(new KeyboardEvent('keydown', { key: 'Home' }))
      const copy = document.createElement('canvas')
      copy.width = canvas.width
      copy.height = canvas.height
      const ctx = copy.getContext('2d')!
      ctx.fillStyle = '#fff9f2'
      ctx.fillRect(0, 0, copy.width, copy.height)
      ctx.drawImage(canvas, 0, 0)
      return Array.from(ctx.getImageData(0, 0, copy.width, copy.height).data)
    })
    await art.press('ArrowRight')
    await page.getByRole('button', { name: 'Look closer' }).press('Enter')
    // Observe only draws on the live context, not the detached GIF context.
    await art.evaluate(element => {
      const gl = (element as HTMLCanvasElement).getContext('webgl2')!
      const watch = <Args extends unknown[]>(draw: (...args: Args) => void) => (...args: Args) => {
        element.setAttribute('data-proof-drawn', '')
        draw.apply(gl, args)
      }
      gl.drawArrays = watch(gl.drawArrays)
      gl.drawElements = watch(gl.drawElements)
      gl.drawArraysInstanced = watch(gl.drawArraysInstanced)
      gl.drawElementsInstanced = watch(gl.drawElementsInstanced)
    })
    // Cover the service-worker-cached worker bootstrap as well as the online path.
    await page.waitForFunction(() => navigator.serviceWorker.controller !== null)
    if (version === 3) await context.setOffline(true)
    const save = page.getByRole('button', { name: 'Save bloom GIF' })
    const downloadPromise = page.waitForEvent('download', { timeout: 60_000 })
    await save.press('Enter')
    await page.waitForFunction(() => document.querySelector('button[aria-busy="true"]')?.textContent?.includes('Save bloom GIF'))
    const download = await Promise.race([
      downloadPromise,
      page.getByText('Couldn’t save the bloom GIF.', { exact: false }).waitFor({ timeout: 60_000 })
        .then(() => { throw new Error(`GIF export failed for ${token}.`) }),
    ])
    assert.equal(download.suggestedFilename(), `flowers-for-you-${token}.gif`)
    const path = resolve(output, download.suggestedFilename())
    await download.saveAs(path)
    await page.getByText('Bloom GIF download started.', { exact: true }).waitFor()
    await context.setOffline(false)
    assert.equal(await art.getAttribute('data-proof-drawn'), null, 'GIF export must not redraw the live stage.')
    assert.equal(await page.getByRole('button', { name: 'Look closer' }).getAttribute('aria-pressed'), 'true')

    const bytes = await readFile(path)
    assert.equal(bytes.at(-1), 0x3b, 'GIF trailer')
    const gif = parseGIF(Uint8Array.from(bytes).buffer)
    assert.deepEqual(gif.header, { signature: 'GIF', version: '89a' })
    assert.equal(gif.lsd.width, GIF_WIDTH)
    assert.equal(gif.lsd.height, GIF_HEIGHT)
    const loop = gif.frames.find((frame) => 'application' in frame)
    assert(loop && 'application' in loop)
    assert.equal(loop.application.id, 'NETSCAPE2.0')
    assert.deepEqual(Array.from(loop.application.blocks), [1, 0, 0], 'GIF repeats indefinitely.')
    const frames = gif.frames.filter(frame => 'image' in frame)
    const schedule = bloomGifFrames()
    assert.equal(frames.length, schedule.length)
    assert.deepEqual(frames.map(frame => frame.gce.delay * 10), schedule.map(frame => frame.delay))
    assert.equal(frames.reduce((sum, frame) => sum + frame.gce.delay * 10, 0), BLOOM_DURATION + GIF_FINAL_HOLD)
    const decode = (i: number) => decompressFrame(frames[i], gif.gct, true).patch
    const first = decode(0), middle = decode(Math.floor(frames.length / 2)), final = decode(frames.length - 1)
    assert(!Buffer.from(first).equals(Buffer.from(middle)), 'Opening and middle samples must be different.')
    assert(!Buffer.from(middle).equals(Buffer.from(final)), 'Middle and final samples must be different.')
    assert.deepEqual(Array.from(final.slice(0, 4)), [255, 249, 242, 255], 'GIF preserves cream paper.')
    if (previousFinal) assert(!Buffer.from(final).equals(Buffer.from(previousFinal)), 'Each gift recipe yields a distinct final frame.')
    previousFinal = final
    let artPixels = 0, totalError = 0
    for (let i = 0; i < finalReference.length; i += 4) {
      const r = finalReference[i], g = finalReference[i + 1], b = finalReference[i + 2]
      if (Math.abs(r - 255) + Math.abs(g - 249) + Math.abs(b - 242) <= 24) continue
      artPixels++
      totalError += Math.abs(r - final[i]) + Math.abs(g - final[i + 1]) + Math.abs(b - final[i + 2])
    }
    assert(artPixels > 1_000, 'Final live reference has rendered artwork.')
    const meanError = totalError / artPixels / 3
    assert(meanError < 12, `Decoded final GIF should match the requested live gift (mean channel error: ${meanError.toFixed(2)}).`)
    console.log(`${path}: ${frames.length} frames, ${BLOOM_DURATION + GIF_FINAL_HOLD}ms, infinite loop, ${bytes.length} bytes; matches ${token}${version === 3 ? ' (offline)' : ''}`)
  }

  let unexpectedDownloads = 0
  page.on('download', () => { unexpectedDownloads++ })
  const save = page.getByRole('button', { name: 'Save bloom GIF' })
  const [cancelWorker] = await Promise.all([page.waitForEvent('worker'), save.press('Enter')])
  const canceled = cancelWorker.waitForEvent('close')
  await page.getByRole('button', { name: 'Cancel GIF export' }).press('Enter')
  await canceled
  await page.getByText('GIF export canceled.', { exact: true }).waitFor()
  assert.equal(await save.evaluate(button => button === document.activeElement), true, 'Focus returns to Save.')
  const [staleWorker] = await Promise.all([page.waitForEvent('worker'), save.press('Enter')])
  const replaced = staleWorker.waitForEvent('close')
  await page.getByRole('button', { name: 'Grow another' }).press('Enter')
  await replaced
  await page.waitForFunction(oldSeed => document.querySelector('#flower')?.getAttribute('data-seed') !== oldSeed, String(parseInt(gifts.at(-1)!.seed, 16)))
  assert.equal(await page.getByRole('button', { name: 'Cancel GIF export' }).count(), 0)
  assert.equal(unexpectedDownloads, 0)
  assert.deepEqual(errors, [])
  console.log('Pending, keyboard cancellation, focus restoration, and cancellation on replacing the gift verified.')
} finally {
  await browser.close()
}
