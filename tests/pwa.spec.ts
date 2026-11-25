import { expect, test, type Page } from '@playwright/test'
import { createServer } from 'node:http'
import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { createBouquet } from '../src/garden/botany'

const sharedToken = '1970260fcfb'
const sharedSeed = 1748091600123

async function ready(page: Page, path = '/') {
  await page.goto(`${path}?bouquet=${sharedToken}`)
  await expect(page.getByRole('button', { name: 'Open your flowers', exact: true })).toBeEnabled()
  return page.evaluate(async () => {
    const registration = await navigator.serviceWorker.ready
    if (registration.active?.state !== 'activated') {
      await new Promise<void>(resolve => registration.active?.addEventListener('statechange', () => {
        if (registration.active?.state === 'activated') resolve()
      }))
    }
    return { scope: registration.scope, script: registration.active?.scriptURL }
  })
}

async function open(page: Page, seed: number) {
  const opener = page.getByRole('button', { name: 'Open your flowers', exact: true })
  await expect(opener).toBeEnabled()
  await opener.focus()
  await page.keyboard.press('Enter')
  await expect(page.locator('canvas')).toHaveAttribute('data-seed', String(seed))
  await expect(page.getByRole('heading', { name: createBouquet(seed).name, exact: true })).toBeVisible()
}

test('manifest has stable app identity and real branded install icons', async ({ page, request }) => {
  await page.goto(`/?bouquet=${sharedToken}`)
  const manifestURL = await page.locator('link[rel="manifest"]').evaluate((element: HTMLLinkElement) => element.href)
  const response = await request.get(manifestURL)
  expect(response.ok()).toBe(true)
  const manifest = await response.json()
  expect(manifest).toMatchObject({
    id: './', start_url: './', scope: './', name: 'Flowers for You', display: 'standalone',
    theme_color: '#f5e9e2', background_color: '#fff9f2',
  })
  expect(manifest.icons).toEqual(expect.arrayContaining([
    expect.objectContaining({ sizes: '192x192', purpose: 'any' }),
    expect.objectContaining({ sizes: '512x512', purpose: 'any' }),
    expect.objectContaining({ sizes: '512x512', purpose: 'maskable' }),
  ]))
  const apple = await page.locator('link[rel="apple-touch-icon"]').evaluate((element: HTMLLinkElement) => element.href)
  for (const icon of [...manifest.icons, { src: apple, sizes: '180x180' }]) {
    const image = await request.get(new URL(icon.src, manifestURL).href)
    expect(image.ok()).toBe(true)
    const bytes = await image.body()
    expect(bytes.subarray(0, 8).toString('hex')).toBe('89504e470d0a1a0a')
    const [width, height] = icon.sizes.split('x').map(Number)
    expect(bytes.readUInt32BE(16)).toBe(width)
    expect(bytes.readUInt32BE(20)).toBe(height)
  }
})

test('production worker caches lazy engine and Three, reloads offline and opens unseen query seeds', async ({ page, context }) => {
  const registration = await ready(page)
  expect(registration.script).toMatch(/\/sw\.js$/)
  const cached = await page.evaluate(async () => {
    const names = (await caches.keys()).filter(name => name.startsWith('flowers-for-you-'))
    return (await Promise.all(names.map(async name => (await (await caches.open(name)).keys()).map(request => request.url)))).flat()
  })
  expect(cached.some(url => /\/engine-[^/]+\.js/.test(url))).toBe(true)
  expect(cached.some(url => /\/three-[^/]+\.js/.test(url))).toBe(true)
  expect(cached.some(url => /\/audio\/gift-open\.wav/.test(url))).toBe(true)
  expect(cached.some(url => /\/audio\/bloom\.wav/.test(url))).toBe(true)
  await context.setOffline(true)
  await page.reload()
  await open(page, sharedSeed)
  const unseenSeed = sharedSeed + 1234567
  await page.goto(`/?bouquet=${unseenSeed.toString(16)}`)
  await open(page, unseenSeed)
  await page.reload()
  await open(page, unseenSeed)
})

test('installation remains browser-owned without an in-page install control or prompt interception', async ({ page }) => {
  await page.goto('/')
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Install app', exact: true })).toHaveCount(0)
  await expect(page.locator('.flower-install-help')).toHaveCount(0)
  expect(await page.evaluate(() => {
    const event = new Event('beforeinstallprompt', { cancelable: true })
    window.dispatchEvent(event)
    return event.defaultPrevented
  })).toBe(false)
})

test('same production artifact works at a static subpath and updates wait without replacing a gift', async ({ page, context }) => {
  let update = false
  const mount = '/moment-garden/'
  const types: Record<string, string> = { js: 'text/javascript', css: 'text/css', html: 'text/html', webmanifest: 'application/manifest+json', png: 'image/png', svg: 'image/svg+xml', wav: 'audio/wav' }
  const server = createServer(async (request, response) => {
    const pathname = new URL(request.url!, 'http://localhost').pathname
    if (!pathname.startsWith(mount) || pathname.includes('..')) { response.writeHead(404).end(); return }
    const path = pathname.slice(mount.length) || 'index.html'
    try {
      let body = await readFile(resolve('dist', path))
      if (path === 'sw.js' && update) body = Buffer.concat([body, Buffer.from('\n/* release two */')])
      response.writeHead(200, { 'Content-Type': types[path.split('.').at(-1)!] ?? 'application/octet-stream', 'Cache-Control': 'no-cache' }).end(body)
    } catch { response.writeHead(404).end() }
  })
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve))
  const address = server.address()
  if (!address || typeof address === 'string') throw new Error('Missing test server address')
  const url = `http://127.0.0.1:${address.port}${mount}`
  try {
    expect((await ready(page, url)).scope).toBe(url)
    const manifest = await page.locator('link[rel="manifest"]').evaluate(async (element: HTMLLinkElement) => (await fetch(element.href)).json())
    expect(new URL(manifest.start_url, `${url}manifest.webmanifest`).href).toBe(url)
    await page.reload()
    await open(page, sharedSeed)
    await page.evaluate(async () => { await caches.open('unrelated-app-cache') })
    update = true
    await page.evaluate(async () => { await (await navigator.serviceWorker.ready).update() })
    await expect.poll(() => page.evaluate(async () => Boolean((await navigator.serviceWorker.ready).waiting))).toBe(true)
    await expect(page.locator('canvas')).toHaveAttribute('data-seed', String(sharedSeed))
    await expect(page.getByRole('button', { name: 'Open your flowers', exact: true })).toHaveCount(0)
    expect(await page.evaluate(() => caches.has('unrelated-app-cache'))).toBe(true)
    await context.setOffline(true)
    const seed = sharedSeed + 7654321
    await page.goto(`${url}?bouquet=${seed.toString(16)}`)
    await open(page, seed)
  } finally {
    await context.setOffline(false)
    await page.goto('about:blank')
    await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()))
  }
})
