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
  await expect(page.locator('.flower-garden')).not.toHaveAttribute('data-pointer-opened', '')
  expect(await page.locator('.flower-garden').evaluate(element => element.getAnimations().length)).toBe(0)
}

for (const reduced of [false, true]) {
  test(`pointer opening fades actions without blocking them${reduced ? ' with reduced motion' : ''}`, async ({ page }) => {
    await page.emulateMedia({ reducedMotion: reduced ? 'reduce' : 'no-preference' })
    await page.goto(gift)
    const opener = page.getByRole('button', { name: 'Open your flowers', exact: true })
    await expect(opener).toBeEnabled()
    const actions = page.locator('.flower-garden')
    await actions.evaluate(element => {
      element.addEventListener('transitionrun', () => {
        element.getAnimations().forEach(animation => animation.pause())
      }, { once: true })
    })
    await opener.click()
    await expect.poll(() => actions.evaluate(element => element.getAnimations().length)).toBe(1)
    const reveal = await actions.evaluate(element => {
      const animation = element.getAnimations()[0]
      const style = getComputedStyle(element)
      return {
        duration: animation.effect?.getTiming().duration,
        property: style.transitionProperty,
        curve: style.transitionTimingFunction,
        opacity: Number(style.opacity),
        transform: style.transform,
        inert: element.hasAttribute('inert'),
        sealed: element.hasAttribute('data-sealed'),
      }
    })
    expect(reveal.duration).toBe(reduced ? 80 : 180)
    expect(reveal.property).toBe('opacity')
    expect(reveal.curve).toBe('cubic-bezier(0.23, 1, 0.32, 1)')
    expect(reveal.opacity).toBeLessThan(1)
    expect(reveal.transform).toBe('none')
    expect(reveal.inert).toBe(false)
    expect(reveal.sealed).toBe(false)
    await page.getByRole('button', { name: 'Grow another', exact: true }).click()
    await expect(page.locator('canvas')).not.toHaveAttribute('data-seed', seed)
    await actions.evaluate(element => element.getAnimations().forEach(animation => animation.finish()))
    await expect(actions).toHaveCSS('opacity', '1')
    await page.getByRole('button', { name: 'Grow another', exact: true }).click()
    expect(await actions.evaluate(element => element.getAnimations().length)).toBe(0)
  })
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

test('context loss dismisses a sealed cover, keeps sharing available, and restores the same bouquet', async ({ page }) => {
  await page.goto(gift)
  await expect(page.getByRole('button', { name: 'Open your flowers', exact: true })).toBeEnabled()
  const canLoseContext = await page.evaluate(() => {
    const canvas = document.querySelector('canvas')!
    const gl = canvas.getContext('webgl2') ?? canvas.getContext('webgl')
    const extension = gl?.getExtension('WEBGL_lose_context')
    if (!extension) return false
    ;(window as unknown as { contextLoss: WEBGL_lose_context }).contextLoss = extension
    extension.loseContext()
    return true
  })
  expect(canLoseContext).toBe(true)
  await expect(page.getByText(/3D preview paused/)).toBeVisible()
  await expect(page.getByRole('button', { name: 'Open your flowers', exact: true })).not.toBeVisible()
  await expect(page.getByRole('button', { name: 'Send flowers', exact: true })).toBeEnabled()
  await expect(page.locator('.flower-garden')).not.toHaveAttribute('data-pointer-opened', '')
  await expect(page.locator('.flower-garden')).toHaveCSS('opacity', '1')
  await page.evaluate(() => (window as unknown as { contextLoss: WEBGL_lose_context }).contextLoss.restoreContext())
  await expect(page.getByText(/3D preview paused/)).not.toBeVisible()
  await expect(page.locator('canvas')).toHaveAttribute('data-seed', seed)
  await expect(page.getByRole('button', { name: /Save postcard/ })).toBeEnabled()
})

test('stationery uses continuous corners and stays usable with larger text and increased contrast', async ({ page }) => {
  await page.emulateMedia({ contrast: 'more', reducedMotion: 'reduce' })
  await openGift(page)
  const corners = await page.locator('.flower-postcard').evaluate(element => ({
    supported: CSS.supports('corner-shape', 'squircle'),
    shape: getComputedStyle(element).getPropertyValue('corner-shape'),
    outline: getComputedStyle(element).outlineStyle,
  }))
  if (corners.supported) expect(corners.shape).toBe('superellipse(2)')
  expect(corners.outline).toBe('solid')
  for (const name of ['Send flowers', 'Grow another', 'Reset view']) {
    const control = page.getByRole('button', { name, exact: true })
    const box = await control.boundingBox()
    expect(box!.height).toBeGreaterThanOrEqual(44)
    expect(box!.width).toBeGreaterThanOrEqual(44)
  }
  await page.addStyleTag({ content: 'html { font-size: 200%; }' })
  expect(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)).toBe(false)
  await expect(page.getByRole('button', { name: 'Send flowers', exact: true })).toBeEnabled()
  await page.locator('canvas').focus()
  await expect(page.locator('canvas')).toHaveCSS('outline-style', 'solid')
})

test('sealed invitation stays inside the postcard at narrow widths and 200% text', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 740 })
  await page.goto(gift)
  const opener = page.getByRole('button', { name: 'Open your flowers', exact: true })
  await expect(opener).toBeEnabled()
  await page.addStyleTag({ content: 'html { font-size: 200%; }' })
  const card = (await page.locator('.flower-postcard').boundingBox())!
  for (const element of [page.locator('#flower-cover-note'), opener]) {
    const box = (await element.boundingBox())!
    expect(box.x).toBeGreaterThanOrEqual(card.x)
    expect(box.x + box.width).toBeLessThanOrEqual(card.x + card.width)
  }
  expect(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)).toBe(false)
})

test('renderer failure exposes a readable recovery rather than a sealed cover', async ({ page }) => {
  await page.addInitScript(() => {
    const get = HTMLCanvasElement.prototype.getContext
    HTMLCanvasElement.prototype.getContext = function (this: HTMLCanvasElement, type: string, ...args: unknown[]) {
      return /webgl/.test(type) ? null : get.call(this, type as '2d', ...args)
    } as typeof HTMLCanvasElement.prototype.getContext
  })
  await page.goto(gift)
  await expect(page.getByText(/WebGL|couldn.t open|couldn.t bloom|couldn.t load|hardware acceleration|3D/i).first()).toBeVisible()
  await expect(page.getByRole('button', { name: 'Open your flowers', exact: true })).not.toBeVisible()
})
