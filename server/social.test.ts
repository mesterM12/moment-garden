import { createHash } from 'node:crypto'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const files = vi.hoisted(() => ({ read: vi.fn() }))
vi.mock('node:fs/promises', async importOriginal => ({ ...await importOriginal<typeof import('node:fs/promises')>(), readFile: files.read }))

beforeEach(() => {
  vi.resetModules()
  delete globalThis.__flowersSocial
  files.read.mockResolvedValue('next-build-a\n')
})
afterEach(() => { vi.unstubAllEnvs(); delete globalThis.__flowersSocial })

describe('social metadata and build version', () => {
  it('hashes Next BUILD_ID to a cached 16-hex immutable version', async () => {
    const { getRenderVersion } = await import('./social')
    const expected = createHash('sha256').update('next-build-a').digest('hex').slice(0, 16)
    expect(await getRenderVersion()).toBe(expected)
    expect(await getRenderVersion()).toBe(expected)
    expect(files.read).toHaveBeenCalledTimes(1)
    expect(String(files.read.mock.calls[0][0])).toMatch(/\.next\/BUILD_ID$/)
  })

  it('different builds invalidate image URLs', async () => {
    const a = await (await import('./social')).getRenderVersion()
    vi.resetModules()
    delete globalThis.__flowersSocial
    files.read.mockResolvedValue('next-build-b')
    expect(await (await import('./social')).getRenderVersion()).not.toBe(a)
  })

  it('runtime PUBLIC_URL sets the external origin and subpath; query data cannot change it', async () => {
    vi.stubEnv('PUBLIC_URL', 'https://flowers.example/moment-garden')
    vi.stubEnv('NEXT_PUBLIC_BASE_PATH', '/moment-garden')
    const { getSocialImageUrl, getRenderVersion } = await import('./social')
    const version = await getRenderVersion()
    expect(await getSocialImageUrl(new URLSearchParams('bouquet=1970260fcfb&host=evil.example')))
      .toBe(`https://flowers.example/moment-garden/og/${version}/1970260fcfb.png`)
  })

  it.each(['', 'bouquet=xyz', 'bouquet=01', 'bouquet=1&bouquet=2', 'bouquet=0&bouquet=0', 'bouquet=ffffffffffffff', `bouquet=${(8640000000000001).toString(16)}`])('uses a stable default image for absent or invalid query %s', async search => {
    vi.stubEnv('PUBLIC_URL', 'https://flowers.example/')
    const { getSocialImageUrl, getRenderVersion, DEFAULT_BOUQUET } = await import('./social')
    expect(await getSocialImageUrl(new URLSearchParams(search))).toBe(`https://flowers.example/og/${await getRenderVersion()}/${DEFAULT_BOUQUET}.png`)
  })

  it.each(['0', (8640000000000000).toString(16)])('preserves canonical boundary token %s in metadata', async token => {
    vi.stubEnv('PUBLIC_URL', 'https://flowers.example/')
    const { getSocialImageUrl } = await import('./social')
    expect(await getSocialImageUrl(new URLSearchParams(`bouquet=${token}`))).toMatch(new RegExp(`/${token}\\.png$`))
  })

  it('does not hide a missing production BUILD_ID and allows a later retry', async () => {
    vi.stubEnv('NODE_ENV', 'production')
    files.read.mockRejectedValueOnce(Object.assign(new Error('missing'), { code: 'ENOENT' }))
    const { getRenderVersion } = await import('./social')
    await expect(getRenderVersion()).rejects.toThrow('missing')
    await expect(getRenderVersion()).resolves.toMatch(/^[a-f0-9]{16}$/)
  })
})

describe('public site configuration', () => {
  it.each(['ftp://flowers.example/', 'https://name:pass@flowers.example/', 'https://flowers.example/?q=1', 'https://flowers.example/#fragment'])('rejects unsafe PUBLIC_URL %s', async value => {
    vi.stubEnv('PUBLIC_URL', value)
    const { getPublicSite } = await import('../src/lib/site')
    expect(() => getPublicSite()).toThrow('PUBLIC_URL')
  })

  it('normalizes the public path and requires it to match the build-time base path', async () => {
    vi.stubEnv('PUBLIC_URL', 'https://flowers.example/internal///')
    vi.stubEnv('NEXT_PUBLIC_BASE_PATH', '/internal')
    const { getPublicSite, publicPath, BASE_PATH } = await import('../src/lib/site')
    expect(getPublicSite().href).toBe('https://flowers.example/internal/')
    expect(BASE_PATH).toBe('/internal')
    expect(publicPath('/fonts/local.woff2')).toBe('/internal/fonts/local.woff2')
    expect(publicPath('')).toBe('/internal/')
    vi.stubEnv('PUBLIC_URL', 'https://flowers.example/external/')
    expect(() => getPublicSite()).toThrow('PUBLIC_URL pathname must match')
  })
})
