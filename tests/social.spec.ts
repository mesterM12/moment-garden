import { expect, test } from '@playwright/test'

for (const path of ['/', '/?bouquet=1970260fcfb']) {
  test(`social preview metadata is present without JavaScript at ${path}`, async ({ page, request }) => {
    await page.route('**/*.{js,mjs}', route => route.abort())
    await page.goto(path)
    const content = (property: string) => page.locator(`meta[property="${property}"]`).getAttribute('content')
    const twitter = (name: string) => page.locator(`meta[name="twitter:${name}"]`).getAttribute('content')
    expect(await content('og:type')).toBe('website')
    expect(await content('og:site_name')).toBe('Flowers for You')
    expect(await content('og:title')).toBe('Flowers for You')
    expect(await content('og:description')).toBeTruthy()
    const image = (await content('og:image'))!
    expect(image).toMatch(/^https:\/\/[^\s]+\/og\/flowers-for-you\.jpg$/)
    expect(image).not.toContain('%')
    expect(await content('og:image:secure_url')).toBe(image)
    expect(await content('og:image:type')).toBe('image/jpeg')
    expect(await content('og:image:width')).toBe('1200')
    expect(await content('og:image:height')).toBe('630')
    expect(await content('og:image:alt')).toBeTruthy()
    expect(await twitter('card')).toBe('summary_large_image')
    expect(await twitter('image')).toBe(image)
    expect(await twitter('image:alt')).toBe(await content('og:image:alt'))
    const response = await request.get('/og/flowers-for-you.jpg')
    expect(response.ok()).toBe(true)
    expect(response.headers()['content-type']).toContain('image/jpeg')
    const bytes = await response.body()
    expect(bytes.subarray(0, 3).toString('hex')).toBe('ffd8ff')
    const dimensions = await page.evaluate(async () => {
      const image = new Image()
      image.src = new URL('og/flowers-for-you.jpg', location.href).href
      await image.decode()
      return [image.naturalWidth, image.naturalHeight]
    })
    expect(dimensions).toEqual([1200, 630])
    // A static og:url would collapse distinct bouquet links into the site's home identity.
    expect(await page.locator('meta[property="og:url"]').count()).toBe(0)
  })
}
