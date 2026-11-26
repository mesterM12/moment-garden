import { readFile } from 'node:fs/promises'
import type { Page } from 'playwright'
import { describe, expect } from 'vitest'
import { browserProjects, createBrowserTest } from './browser.fixtures'
import { pngSize, sameBouquetArtwork } from './postcard-png.fixtures'

const seed = '1748091600123'
const gift = '/?bouquet=v3-1970260fcfb'
const saveButton = (page: Page) => page.getByRole('button', { name: /Save postcard/ })

async function openGift(page: Page) {
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.goto(gift)
  const opener = page.getByRole('button', { name: 'Open your flowers', exact: true })
  await expect(opener).toBeEnabled()
  await opener.press('Enter')
  await expect(saveButton(page)).toBeEnabled()
}

async function savePng(page: Page) {
  const [download] = await Promise.all([page.waitForEvent('download'), saveButton(page).click()])
  expect(download.suggestedFilename()).toBe(`flowers-for-you-${seed}.png`)
  const png = await readFile(await download.path())
  expect(png.subarray(0, 8).toString('hex')).toBe('89504e470d0a1a0a')
  expect(pngSize(png)).toEqual([2400, 1260])
  return png
}

async function flowerMargins(page: Page, png: Buffer) {
  return page.evaluate(async (encoded) => {
    const image = new Image()
    image.src = `data:image/png;base64,${encoded}`
    await image.decode()
    // Read just the right-hand artwork field. Cream and blush are both much
    // lighter than the leaves, binding and stems (regardless of petal colors).
    const canvas = document.createElement('canvas')
    canvas.width = 1384
    canvas.height = 1108
    const ctx = canvas.getContext('2d')!
    ctx.drawImage(image, -940, -76)
    const { data } = ctx.getImageData(0, 0, canvas.width, canvas.height)
    let left = canvas.width, top = canvas.height, right = 0, bottom = 0
    for (let y = 0; y < canvas.height; y++) for (let x = 0; x < canvas.width; x++) {
      if (data[(y * canvas.width + x) * 4] >= 225) continue
      left = Math.min(left, x)
      top = Math.min(top, y)
      right = Math.max(right, x)
      bottom = Math.max(bottom, y)
    }
    return { gap: Math.min(left, top, canvas.width - right, canvas.height - bottom), paintedHeight: bottom - top }
  }, png.toString('base64'))
}

describe.each(browserProjects)('$name saved PNG', ({ options, isMobile }) => {
  const test = createBrowserTest({ ...options, serviceWorkers: 'block' }, isMobile)

  test('uses landscape framing at the current angle, without taking the live camera out of close-up', async ({ page }) => {
    await openGift(page)
    const front = await savePng(page)
    const art = page.locator('canvas')
    for (let i = 0; i < 5; i++) await art.press('ArrowRight')
    for (let i = 0; i < 2; i++) await art.press('ArrowDown')
    const turned = await savePng(page)
    expect(await sameBouquetArtwork(page, front, turned)).toBe(false)
    const margins = await flowerMargins(page, turned)
    expect(margins.gap).toBeGreaterThan(25)
    expect(margins.paintedHeight).toBeGreaterThan(550)

    const detail = page.getByRole('button', { name: 'Look closer', exact: true })
    await detail.press('Enter')
    await expect(detail).toHaveAttribute('aria-pressed', 'true')
    const drawingBuffer = () => art.evaluate(node => {
      const canvas = node as HTMLCanvasElement
      return [canvas.width, canvas.height]
    })
    const liveSize = await drawingBuffer()
    const close = await savePng(page)
    expect(await sameBouquetArtwork(page, turned, close)).toBe(true)
    expect(await drawingBuffer()).toEqual(liveSize)
    await expect(detail).toHaveAttribute('aria-pressed', 'true')
    await expect(art).toHaveAttribute('data-seed', seed)
  })

  test('downloads offline with fallback fonts, and can retry an encoding failure', async ({ context, page }) => {
    await page.route('**/*.woff2', route => route.abort())
    await openGift(page)
    await context.setOffline(true)
    const offline = await savePng(page)
    expect((await flowerMargins(page, offline)).paintedHeight).toBeGreaterThan(550)

    // Only the newly created output canvas uses toBlob. Fail one encode,
    // then let the real browser method handle the next attempt.
    await page.evaluate(() => {
      const original = HTMLCanvasElement.prototype.toBlob
      HTMLCanvasElement.prototype.toBlob = function (callback) {
        HTMLCanvasElement.prototype.toBlob = original
        callback(null)
      }
    })
    await saveButton(page).click()
    await expect(page.getByText('Couldn’t save the postcard. Try downloading it again.', { exact: true })).toBeVisible()
    expect(await sameBouquetArtwork(page, offline, await savePng(page))).toBe(true)
  })
})
