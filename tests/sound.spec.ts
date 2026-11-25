import { expect, test } from '@playwright/test'

test('opening and bloom assets are local PCM audio and decode in the browser', async ({ page, request }) => {
  await page.goto('/')
  for (const [file, expected] of [['gift-open.wav', .28], ['bloom.wav', 3.8]] as const) {
    const response = await request.get(`/audio/${file}`)
    expect(response.ok()).toBe(true)
    const bytes = await response.body()
    expect(bytes.subarray(0, 4).toString()).toBe('RIFF')
    expect(bytes.subarray(8, 12).toString()).toBe('WAVE')
    const duration = await page.evaluate(async file => {
      const context = new AudioContext()
      try {
        const data = await (await fetch(`./audio/${file}`)).arrayBuffer()
        return (await context.decodeAudioData(data)).duration
      } finally { await context.close() }
    }, file)
    expect(duration).toBeCloseTo(expected, 1)
  }
})

test('a zero-sized bouquet cancels new bloom audio instead of playing without animation', async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem('flowers-opening-sound', 'off')
    const counts = { sources: 0, closed: 0 }
    Object.assign(window, { soundCounts: counts })
    const createSource = AudioContext.prototype.createBufferSource
    AudioContext.prototype.createBufferSource = function () {
      counts.sources += 1
      return createSource.call(this)
    }
    const close = AudioContext.prototype.close
    AudioContext.prototype.close = function () {
      counts.closed += 1
      return close.call(this)
    }
  })
  await page.goto('/?bouquet=1970260fcfb')
  const open = page.getByRole('button', { name: 'Open your flowers', exact: true })
  await expect(open).toBeEnabled()
  await open.focus()
  await page.keyboard.press('Enter')
  const openingAsset = page.waitForResponse(response => response.url().endsWith('/audio/gift-open.wav'))
  const bloomAsset = page.waitForResponse(response => response.url().endsWith('/audio/bloom.wav'))
  await page.getByRole('button', { name: 'Sound', exact: true }).click()
  await Promise.all([openingAsset, bloomAsset])
  await page.addStyleTag({ content: '.flower-stage { display: none; }' })
  await page.evaluate(() => new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))))
  await page.getByRole('button', { name: 'Replay bloom', exact: true }).click()
  const counts = () => page.evaluate(() => (window as unknown as { soundCounts: { sources: number; closed: number } }).soundCounts)
  await expect.poll(async () => (await counts()).closed).toBe(1)
  expect((await counts()).sources).toBe(0)
})

test('sound can be muted before opening and a failed audio download never blocks the bouquet', async ({ page }) => {
  await page.route('**/audio/*.wav', route => route.abort())
  const errors: string[] = []
  page.on('pageerror', error => errors.push(error.message))
  await page.goto('/?bouquet=1970260fcfb')
  const sound = page.getByRole('button', { name: 'Sound', exact: true })
  await expect(sound).toHaveAttribute('aria-pressed', 'true')
  const open = page.getByRole('button', { name: 'Open your flowers', exact: true })
  await expect(open).toBeEnabled()
  await open.click()
  await expect(page.locator('canvas')).toHaveAttribute('data-seed', '1748091600123')
  await page.getByRole('button', { name: 'Replay bloom', exact: true }).click()
  await sound.click()
  await expect(sound).toHaveAttribute('aria-pressed', 'false')
  expect(errors).toEqual([])
})
