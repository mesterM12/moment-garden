import { expect, test } from '@playwright/test'

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
  expect(styles.canvas).toContain('pan-y')
  expect(styles.canvas).toContain('pinch-zoom')
  expect(styles.button).toBe('manipulation')
  expect(styles.selection).not.toBe('none')
  expect(styles.overscroll).toBe('none')
  await expect(page.getByRole('button', { name: 'Sound', exact: true })).toHaveAttribute('aria-pressed', 'true')
  await page.getByRole('button', { name: 'Sound', exact: true }).click()
  await page.reload()
  await expect(page.getByRole('button', { name: 'Sound', exact: true })).toHaveAttribute('aria-pressed', 'false')
})

test('a vertical touch swipe on the bouquet can scroll the page', async ({ page, isMobile }) => {
  test.skip(!isMobile, 'Touch gesture is exercised by the mobile Chromium project.')
  await page.goto('/?bouquet=1970260fcfb')
  const opener = page.getByRole('button', { name: 'Open your flowers', exact: true })
  await expect(opener).toBeEnabled()
  await opener.focus()
  await page.keyboard.press('Enter')
  await page.evaluate(() => scrollTo(0, 0))
  const canvas = (await page.locator('canvas').boundingBox())!
  const session = await page.context().newCDPSession(page)
  await session.send('Input.synthesizeScrollGesture', {
    x: canvas.x + canvas.width / 2,
    y: canvas.y + Math.min(canvas.height * .7, 220),
    yDistance: -160,
    xDistance: 0,
    gestureSourceType: 'touch',
  })
  await expect.poll(() => page.evaluate(() => scrollY)).toBeGreaterThan(40)
  await session.detach()
})
