import { describe, expect } from 'vitest'
import { browserProjects, createBrowserTest } from './browser.fixtures'

describe.each(browserProjects)('$name', ({ options, isMobile }) => {
const test = createBrowserTest(options, isMobile)

test('mobile platform styles preserve zoom, scrolling and selectable content', async ({ page }) => {
  await page.goto('/?bouquet=1970260fcfb')
  await expect(page.getByRole('button', { name: 'Open your flowers', exact: true })).toBeEnabled()
  const viewport = await page.locator('meta[name="viewport"]').getAttribute('content')
  expect(viewport).toContain('viewport-fit=cover')
  expect(viewport).not.toMatch(/user-scalable\s*=\s*no|maximum-scale\s*=/)
  const styles = await page.evaluate(() => ({
    canvas: getComputedStyle(document.querySelector('canvas')!).touchAction,
    button: getComputedStyle(document.querySelector('.flower-open')!).touchAction,
    selection: getComputedStyle(document.querySelector('h1')!).userSelect,
    overscroll: getComputedStyle(document.documentElement).overscrollBehaviorY,
  }))
  expect(styles.canvas).toBe('pinch-zoom')
  expect(styles.button).toBe('manipulation')
  expect(styles.selection).not.toBe('none')
  expect(styles.overscroll).toBe('none')
  await expect(page.getByRole('button', { name: 'Sound', exact: true })).toHaveAttribute('aria-pressed', 'true')
  await page.getByRole('button', { name: 'Sound', exact: true }).click()
  await page.reload()
  await expect(page.getByRole('button', { name: 'Sound', exact: true })).toHaveAttribute('aria-pressed', 'false')
})

test('press feedback starts immediately, including around pending actions', async ({ page }) => {
  await page.goto('/?bouquet=1970260fcfb')
  const opener = page.getByRole('button', { name: 'Open your flowers', exact: true })
  await expect(opener).toBeEnabled()
  for (const pending of [false, true]) {
    await opener.evaluate((element, pending) => element.toggleAttribute('data-pending', pending), pending)
    const transition = await opener.evaluate(element => {
      const style = getComputedStyle(element)
      const properties = style.transitionProperty.split(', ')
      const delays = style.transitionDelay.split(', ')
      return { transformDelay: delays[properties.indexOf('transform') % delays.length], filterDelay: delays[properties.indexOf('filter') % delays.length] }
    })
    expect(transition.transformDelay).toBe('0s')
    expect(transition.filterDelay).toBe(pending ? '0.15s' : '0.3s')
  }
  await opener.evaluate(element => element.removeAttribute('data-pending'))
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await expect(opener).toHaveCSS('transition-property', 'none')
})

test('touch controls recover after a tap without suppressing content selection', async ({ page, isMobile, skip }) => {
  skip(!isMobile, 'Requires the touch-enabled project.')
  await page.goto('/?bouquet=1970260fcfb')
  const opener = page.getByRole('button', { name: 'Open your flowers', exact: true })
  await expect(opener).toBeEnabled()
  await opener.tap()
  const reset = page.getByRole('button', { name: 'Reset view', exact: true })
  await reset.tap()
  await expect(reset).toHaveCSS('background-color', 'rgba(0, 0, 0, 0)')
  await expect(reset).toHaveCSS('user-select', 'none')
  if (await page.evaluate(() => CSS.supports('-webkit-touch-callout', 'none'))) {
    await expect(reset).toHaveCSS('-webkit-touch-callout', 'none')
  }
  await expect(page.locator('canvas')).toHaveCSS('user-select', 'none')
  await expect(page.locator('h2').first()).not.toHaveCSS('user-select', 'none')
  const sound = page.getByRole('button', { name: 'Sound', exact: true })
  await sound.tap()
  await expect(sound).toHaveAttribute('aria-pressed', 'false')
  await expect(sound).toHaveCSS('background-color', 'rgba(0, 0, 0, 0)')
})

test('manual sharing stays readable, selectable and inside a narrow viewport', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 568 })
  await page.addInitScript(() => {
    Object.defineProperty(navigator, 'share', { configurable: true, value: undefined })
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText: async () => { throw new Error('Permission denied') } } })
  })
  await page.goto('/?bouquet=1970260fcfb')
  const opener = page.getByRole('button', { name: 'Open your flowers', exact: true })
  await expect(opener).toBeEnabled()
  await opener.focus()
  await page.keyboard.press('Enter')
  await page.getByRole('button', { name: 'Send flowers', exact: true }).click()
  const field = page.getByRole('textbox', { name: 'Bouquet link', exact: true })
  await expect(field).toBeFocused()
  const input = await field.evaluate((element: HTMLInputElement) => ({
    size: parseFloat(getComputedStyle(element).fontSize),
    selection: getComputedStyle(element).userSelect,
    selected: element.selectionStart === 0 && element.selectionEnd === element.value.length,
    readOnly: element.readOnly,
    inputMode: element.inputMode,
  }))
  expect(input.size).toBeGreaterThanOrEqual(16)
  expect(input.selection).not.toBe('none')
  expect(input.selected).toBe(true)
  expect(input.readOnly).toBe(true)
  expect(input.inputMode).toBe('none')
  expect(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)).toBe(false)
})

for (const viewport of [{ width: 320, height: 568 }, { width: 390, height: 664 }, { width: 844, height: 390 }]) {
  test(`the postcard and actions fit a ${viewport.width}×${viewport.height} touch viewport`, async ({ page, isMobile, skip }) => {
    skip(!isMobile, 'Requires the touch-enabled project.')
    await page.setViewportSize(viewport)
    await page.goto('/?bouquet=1970260fcfb')
    const opener = page.getByRole('button', { name: 'Open your flowers', exact: true })
    await expect(opener).toBeEnabled()
    await expect(opener).toBeInViewport({ ratio: 1 })
    await expect(page.getByRole('button', { name: 'Sound', exact: true })).toBeInViewport({ ratio: 1 })
    await opener.focus()
    await page.keyboard.press('Enter')
    await page.evaluate(() => document.fonts.ready)
    await expect(page.locator('.flower-stem-note')).toBeInViewport({ ratio: 1 })
    await expect(page.getByRole('button', { name: 'Send flowers', exact: true })).toBeInViewport({ ratio: 1 })
    expect(await page.evaluate(() => document.documentElement.scrollHeight - innerHeight)).toBeLessThanOrEqual(1)
  })
}

test('vertical and sideways drags turn the bouquet without scrolling the page', async ({ page, isMobile, skip }) => {
  skip(!isMobile, 'Touch gesture is exercised by the mobile Chromium project.')
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.setViewportSize({ width: 320, height: 470 })
  await page.goto('/?bouquet=1970260fcfb')
  const opener = page.getByRole('button', { name: 'Open your flowers', exact: true })
  await expect(opener).toBeEnabled()
  await opener.tap()
  const canvas = page.locator('canvas')
  await canvas.scrollIntoViewIfNeeded()
  const scroll = await page.evaluate(() => scrollY)
  expect(await page.evaluate(() => document.documentElement.scrollHeight - innerHeight)).toBeGreaterThan(scroll)
  const box = (await canvas.boundingBox())!
  const x = box.x + box.width * .35
  const y = box.y + box.height / 2
  const session = await page.context().newCDPSession(page)
  for (const [dx, dy] of [[0, -1], [1, 0]]) {
    const before = await canvas.screenshot()
    await session.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y }] })
    for (const distance of [15, 30, 50, 75]) {
      await session.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: x + dx * distance, y: y + dy * distance }] })
    }
    await session.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] })
    await expect(canvas).not.toHaveClass(/is-dragging/)
    expect((await canvas.screenshot()).equals(before)).toBe(false)
    expect(await page.evaluate(() => scrollY)).toBe(scroll)
  }
  await session.detach()
})

test('a short screen can still scroll from outside the bouquet', async ({ page, isMobile, skip }) => {
  skip(!isMobile, 'Touch gesture is exercised by the mobile Chromium project.')
  await page.setViewportSize({ width: 320, height: 400 })
  await page.goto('/?bouquet=1970260fcfb')
  const opener = page.getByRole('button', { name: 'Open your flowers', exact: true })
  await expect(opener).toBeEnabled()
  await opener.focus()
  await page.keyboard.press('Enter')
  await page.evaluate(() => scrollTo(0, 0))
  const canvas = (await page.locator('canvas').boundingBox())!
  const session = await page.context().newCDPSession(page)
  await session.send('Input.synthesizeScrollGesture', {
    x: canvas.x / 2,
    y: canvas.y + canvas.height / 2,
    yDistance: -160,
    xDistance: 0,
    gestureSourceType: 'touch',
  })
  await expect.poll(() => page.evaluate(() => scrollY)).toBeGreaterThan(40)
  await session.detach()
})
})
