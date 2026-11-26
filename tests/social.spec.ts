import { createHash } from 'node:crypto'
import { describe, expect } from 'vitest'
import { baseURL, browserProjects, createBrowserTest } from './browser.fixtures'

describe.each(browserProjects)('$name', ({ options, isMobile }) => {
const test = createBrowserTest(options, isMobile)

const tokens = ['1970260fcfb', 'v3-1970260fcfb']

for (const token of tokens) {
  test(`shared bouquet ${token} has dynamic metadata without JavaScript`, async ({ page, request }) => {
    await page.route('**/*.{js,mjs}', route => route.abort())
    await page.goto(`/?bouquet=${token}`)
    const content = (property: string) => page.locator(`meta[property="${property}"]`).getAttribute('content')
    const twitter = (name: string) => page.locator(`meta[name="twitter:${name}"]`).getAttribute('content')
    expect(await content('og:type')).toBe('website')
    expect(await content('og:title')).toBe('Flowers for You')
    expect(await content('og:site_name')).toBe('Flowers for You')
    expect(await content('og:description')).toBeTruthy()
    const image = (await content('og:image'))!
    expect(image).toMatch(new RegExp(`^http://127\\.0\\.0\\.1:4189/og/[a-f0-9]{16}/${token}\\.png$`))
    expect(await content('og:image:secure_url')).toBe(image)
    expect(await content('og:image:type')).toBe('image/png')
    expect(await content('og:image:width')).toBe('1200')
    expect(await content('og:image:height')).toBe('630')
    expect(await content('og:image:alt')).toBeTruthy()
    expect(await twitter('card')).toBe('summary_large_image')
    expect(await twitter('image')).toBe(image)
    expect(await twitter('image:alt')).toBe(await content('og:image:alt'))
    const response = await request.get(image, { timeout: 60_000 })
    expect(response.ok()).toBe(true)
    expect(response.headers()['content-type']).toBe('image/png')
    expect(response.headers()['cache-control']).toContain('immutable')
    const bytes = await response.body()
    expect(bytes.subarray(0, 8).toString('hex')).toBe('89504e470d0a1a0a')
    expect(bytes.readUInt32BE(16)).toBe(1200)
    expect(bytes.readUInt32BE(20)).toBe(630)
    expect((await request.get(image)).headers().etag).toBe(response.headers().etag)
    expect(await page.locator('meta[property="og:url"]').count()).toBe(0)
  })
}

test('capture uses the exact shared seed, engine version, bouquet name and local fonts', async ({ page }) => {
  const external: string[] = []
  page.on('request', request => { if (!request.url().startsWith('http://127.0.0.1:4189/')) external.push(request.url()) })
  await page.goto(`/__og?bouquet=${tokens[0]}`)
  await expect(page.locator('html')).toHaveAttribute('data-og-status', 'ready', { timeout: 30_000 })
  const capture = await page.locator('canvas').evaluate(element => ({ ...element.dataset }))
  await expect(page.locator('main')).toHaveAttribute('data-og-seed', '1748091600123')
  await expect(page.locator('h2')).toHaveText('The Last Light')
  expect(external).toEqual([])
  expect(await page.evaluate(() => document.fonts.check('italic 64px "Instrument Serif"'))).toBe(true)
  await page.goto(`/?bouquet=${tokens[0]}`)
  await page.getByRole('button', { name: 'Open your flowers', exact: true }).focus()
  await page.keyboard.press('Enter')
  const canvas = page.locator('canvas')
  await expect(canvas).toHaveAttribute('data-seed', capture.seed!)
  await expect(canvas).toHaveAttribute('data-version', capture.version!)
  await expect(canvas).toHaveAttribute('data-species', capture.species!)
  await expect(canvas).toHaveAttribute('data-flower-count', capture.flowerCount!)
  await expect(page.locator('h2').first()).toHaveText('The Last Light')
})

test('metadata is complete in initial HTML for arbitrary user agents with JavaScript disabled', async ({ browser }) => {
  for (const userAgent of ['Flowers-integration/1.0', 'Twitterbot/1.0', options.userAgent ?? 'Mozilla/5.0']) {
    const context = await browser.newContext({ ...options, baseURL, javaScriptEnabled: false, userAgent })
    try {
      const page = await context.newPage()
      const response = await page.goto(`/?bouquet=${tokens[0]}`)
      expect(response?.ok()).toBe(true)
      expect(await page.locator('meta[property="og:image"]').getAttribute('content')).toMatch(new RegExp(`/og/[a-f0-9]{16}/${tokens[0]}\\.png$`))
      expect(await page.locator('meta[name="twitter:card"]').getAttribute('content')).toBe('summary_large_image')
      expect(await page.locator('meta[property="og:title"]').getAttribute('content')).toBe('Flowers for You')
    } finally {
      await context.close()
    }
  }
})

test('the same timestamp in legacy and florist links produces distinct PNGs', async ({ request }) => {
  const digests: string[] = []
  for (const token of tokens) {
    const html = await (await request.get(`/?bouquet=${token}`)).text()
    const image = html.match(/property="og:image" content="([^"]+)"/)![1]
    const response = await request.get(image, { timeout: 60_000 })
    expect(response.ok()).toBe(true)
    digests.push(createHash('sha256').update(await response.body()).digest('hex'))
  }
  expect(digests[0]).not.toBe(digests[1])
})
})
