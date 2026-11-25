import { expect, test } from '@playwright/test'

const gift = '/?bouquet=1970260fcfb'
const seed = '1748091600123'

async function openGift(page: import('@playwright/test').Page) {
  await page.goto(gift)
  const opener = page.getByRole('button', { name: 'Open your flowers', exact: true })
  await expect(opener).toBeEnabled()
  await opener.focus()
  await page.keyboard.press('Enter')
  await expect(opener).not.toBeVisible()
  await expect(page.locator('canvas')).toHaveAttribute('data-seed', seed)
}

test('opens the exact shared bouquet and preserves it through replay and saving', async ({ page }) => {
  const errors: string[] = []
  page.on('pageerror', error => errors.push(error.message))
  await openGift(page)
  await expect(page.getByRole('button', { name: 'Send flowers', exact: true })).toBeEnabled()
  await page.getByRole('button', { name: 'Replay bloom', exact: true }).focus()
  await page.keyboard.press('Enter')
  await expect(page.locator('canvas')).toHaveAttribute('data-seed', seed)
  await page.locator('canvas').focus()
  await page.keyboard.press('ArrowRight')
  await page.keyboard.press('Home')
  const downloadPromise = page.waitForEvent('download')
  await page.getByRole('button', { name: /Save postcard/ }).click()
  const download = await downloadPromise
  expect(download.suggestedFilename()).toBe(`flowers-for-you-${seed}.png`)
  await page.getByRole('button', { name: 'Grow another', exact: true }).click()
  await expect(page.locator('canvas')).not.toHaveAttribute('data-seed', seed)
  expect(new URL(page.url()).searchParams.has('bouquet')).toBe(false)
  expect(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)).toBe(false)
  expect(errors).toEqual([])
})

test('reduced motion opens a complete bouquet with accessible controls', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await openGift(page)
  await expect(page.getByRole('button', { name: 'Replay bloom', exact: true })).not.toBeVisible()
  await expect(page.getByText(/animation is off/i)).toBeVisible()
  await expect(page.getByRole('button', { name: /Reset view/ })).toBeEnabled()
  expect(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)).toBe(false)
})

test('copies the current link and offers manual recovery when clipboard access fails', async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(navigator, 'share', { configurable: true, value: undefined })
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText: async (text: string) => { (window as unknown as { copied: string }).copied = text } } })
  })
  await openGift(page)
  await page.getByRole('button', { name: 'Send flowers', exact: true }).click()
  await expect(page.getByText('Bouquet link copied.', { exact: true })).toBeVisible()
  expect(await page.evaluate(() => (window as unknown as { copied: string }).copied)).toMatch(/bouquet=1970260fcfb$/)
  await page.evaluate(() => { navigator.clipboard.writeText = async () => { throw new Error('Permission denied') } })
  await page.getByRole('button', { name: 'Send flowers', exact: true }).click()
  await expect(page.getByRole('textbox', { name: 'Bouquet link', exact: true })).toHaveValue(/bouquet=1970260fcfb$/)
})

test('canceling native sharing never writes to the clipboard', async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(navigator, 'share', { configurable: true, value: async () => { throw new DOMException('Canceled', 'AbortError') } })
    Object.defineProperty(navigator, 'canShare', { configurable: true, value: () => true })
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText: async () => { (window as unknown as { copied: boolean }).copied = true } } })
  })
  await openGift(page)
  await page.getByRole('button', { name: 'Send flowers', exact: true }).click()
  await expect(page.getByText('Sharing canceled.', { exact: true })).toBeVisible()
  expect(await page.evaluate(() => (window as unknown as { copied?: boolean }).copied)).toBeUndefined()
})

test('shows an invalid-link notice without trapping the gift', async ({ page }) => {
  await page.goto('/?bouquet=not-a-seed')
  await expect(page.getByText(/fresh bouquet|link couldn.t|link is/i).first()).toBeVisible()
  await expect(page.getByRole('button', { name: 'Open your flowers', exact: true })).toBeEnabled()
})

test('renderer failure exposes a readable recovery rather than a sealed cover', async ({ page }) => {
  await page.addInitScript(() => {
    const get = HTMLCanvasElement.prototype.getContext
    HTMLCanvasElement.prototype.getContext = function (type: string, ...args: unknown[]) {
      return /webgl/.test(type) ? null : get.call(this, type as '2d', ...args)
    } as typeof HTMLCanvasElement.prototype.getContext
  })
  await page.goto(gift)
  await expect(page.getByText(/WebGL|couldn.t open|couldn.t bloom|couldn.t load|hardware acceleration|3D/i).first()).toBeVisible()
  await expect(page.getByRole('button', { name: 'Open your flowers', exact: true })).not.toBeVisible()
})
