import { describe, expect } from 'vitest'
import type { Page } from 'playwright'
import { browserProjects, createBrowserTest } from './browser.fixtures'

describe.each(browserProjects)('$name', ({ options, isMobile }) => {
const test = createBrowserTest(options, isMobile)

const gift = '/?bouquet=1970260fcfb'
const seed = '1748091600123'

async function openGift(page: Page, version = 2) {
  await page.goto(version === 2 ? gift : '/?bouquet=v3-1970260fcfb')
  const opener = page.getByRole('button', { name: 'Open your flowers', exact: true })
  await expect(opener).toBeEnabled()
  await opener.focus()
  await page.keyboard.press('Enter')
  await expect(opener).not.toBeVisible()
  await expect(page.locator('canvas')).toHaveAttribute('data-seed', seed)
  await expect(page.locator('canvas')).toHaveAttribute('data-version', String(version))
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

test('a ribbon can be tugged, eased back and pulled again without opening the wrong gift', async ({ page }) => {
  await page.goto(gift)
  const bow = page.getByRole('button', { name: 'Pull the ribbon', exact: true })
  await expect(bow).toBeEnabled()
  const box = (await bow.boundingBox())!
  const x = box.x + box.width / 2, y = box.y + box.height / 2
  const distance = Math.min(110, box.width * .48)
  await page.getByRole('button', { name: 'Open your flowers', exact: true }).focus()
  const initial = await bow.screenshot()
  await page.mouse.move(x, y)
  await page.mouse.down()
  await page.mouse.move(x + distance, y, { steps: 10 })
  await expect(page.getByText('Release to open', { exact: true })).toBeVisible()
  expect((await bow.screenshot()).equals(initial)).toBe(false)
  await page.mouse.move(x + 1, y, { steps: 10 })
  await page.mouse.up()
  await expect(page.getByRole('button', { name: 'Open your flowers' })).toBeEnabled()
  await page.mouse.move(x, y)
  await page.mouse.down()
  await page.mouse.move(x - distance, y, { steps: 10 })
  await page.mouse.up()
  await expect(bow).not.toBeVisible()
  await expect(page.locator('canvas')).toBeFocused()
  await expect(page.locator('canvas')).toHaveAttribute('data-seed', seed)
})

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

test('reading the petals up close does not crop the saved gift or change the seed', async ({ page }) => {
  await openGift(page, 3)
  const art = page.locator('canvas')
  const detail = page.getByRole('button', { name: 'Look closer', exact: true })
  async function keepsake() {
    const [download] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: /Save postcard/ }).click()])
    const chunks: Buffer[] = []
    const stream = await download.createReadStream()
    for await (const chunk of stream!) chunks.push(Buffer.from(chunk))
    return Buffer.concat(chunks)
  }
  await art.focus()
  await page.keyboard.press('ArrowRight')
  await page.keyboard.press('ArrowDown')
  const whole = await keepsake()
  const wide = await art.screenshot()
  await detail.focus()
  await page.keyboard.press('Enter')
  await expect(detail).toHaveAttribute('aria-pressed', 'true')
  expect((await art.screenshot()).equals(wide)).toBe(false)
  expect((await keepsake()).equals(whole)).toBe(true)
  await expect(detail).toHaveAttribute('aria-pressed', 'true')
  await art.focus()
  await page.keyboard.press('Home')
  await expect(detail).toHaveAttribute('aria-pressed', 'false')
  await expect(art).toHaveAttribute('data-seed', seed)
})

test('switching to reduced motion mid-opening goes straight to the final bouquet', async ({ page }) => {
  await page.goto(gift)
  await page.getByRole('button', { name: 'Open your flowers', exact: true }).click()
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await expect(page.locator('.flower-postcard-details [role="status"]').first()).toHaveText('In full bloom')
  await expect(page.locator('.flower-cover')).toHaveCount(0)
  await expect(page.getByRole('button', { name: 'Replay bloom', exact: true })).toHaveCount(0)
  await expect(page.locator('canvas')).toHaveAttribute('data-seed', seed)
  await expect(page.getByRole('button', { name: /Save postcard/ })).toBeEnabled()
})

test('reduced motion opens a complete bouquet with accessible controls', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await openGift(page, 3)
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
  await page.getByRole('button', { name: 'Pull the ribbon' }).focus()
  const canLoseContext = await page.evaluate(() => {
    const canvas = document.querySelector('canvas')!
    const gl = canvas.getContext('webgl2')
    const extension = gl?.getExtension('WEBGL_lose_context')
    if (!extension) return false
    ;(window as unknown as { contextLoss: WEBGL_lose_context }).contextLoss = extension
    extension.loseContext()
    return true
  })
  expect(canLoseContext).toBe(true)
  await expect(page.getByText(/3D preview paused/)).toBeVisible()
  await expect(page.locator('.flower-render-fallback')).toBeFocused()
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

test('the paper and its printed inset share the postcard corner treatment without covering the opener outline', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 568 })
  await page.goto(gift)
  await expect(page.getByRole('button', { name: 'Open your flowers' })).toBeEnabled()
  const frame = await page.evaluate(() => {
    const node = (s: string) => document.querySelector(s)!
    const style = (s: string, pseudo?: string) => getComputedStyle(node(s), pseudo)
    const card = style('.flower-postcard')
    const tag = style('.parcel-tag'), rule = style('.parcel-tag', '::before')
    return {
      shapes: ['.flower-cover', '.flower-stage', '.flower-canvas', '.parcel-open', '.parcel-tag', '.parcel-handle'].map(s => style(s).getPropertyValue('corner-shape')),
      shape: card.getPropertyValue('corner-shape'),
      cover: style('.flower-cover').borderRadius, card: card.borderRadius,
      inset: parseFloat(tag.borderRadius) - parseFloat(rule.borderRadius),
      foot: node('.flower-cover').getBoundingClientRect().bottom - node('.parcel-open').getBoundingClientRect().bottom,
      clear: node('.parcel-hint').getBoundingClientRect().top - node('.parcel-tag').getBoundingClientRect().bottom,
    }
  })
  expect(frame.shapes.every(s => s === frame.shape)).toBe(true)
  expect(frame.cover).toBe(frame.card)
  expect(frame.inset).toBeCloseTo(4)
  expect(frame.foot).toBeGreaterThanOrEqual(10)
  expect(frame.clear).toBeGreaterThanOrEqual(4)
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

test('a WebGL 1-only browser gets recovery and sharing rather than a sealed cover', async ({ page }) => {
  await page.addInitScript(() => {
    const get = HTMLCanvasElement.prototype.getContext
    HTMLCanvasElement.prototype.getContext = function (this: HTMLCanvasElement, type: string, ...args: unknown[]) {
      if (type === 'webgl2') return null
      if (type === 'webgl') this.dataset.requestedWebgl1 = ''
      return get.call(this, type as '2d', ...args)
    } as typeof HTMLCanvasElement.prototype.getContext
  })
  await page.goto(gift)
  await expect(page.getByText(/need WebGL 2 to bloom/)).toBeVisible()
  expect(await page.locator('canvas[data-requested-webgl1]').count()).toBe(0)
  await expect(page.getByRole('button', { name: 'Open your flowers', exact: true })).not.toBeVisible()
  await expect(page.getByRole('button', { name: 'Send flowers', exact: true })).toBeEnabled()
})
})
