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
  await expect(page.getByRole('button', { name: 'Replay bloom', exact: true })).toBeDisabled()
  await expect(page.getByRole('button', { name: /Reset view/ })).toBeEnabled()
  expect(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)).toBe(false)
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
