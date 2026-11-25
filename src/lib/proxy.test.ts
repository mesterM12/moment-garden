import { afterEach, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'

afterEach(() => { vi.unstubAllEnvs(); vi.resetModules() })

it('canonicalizes only the bare app base path, preserving gift queries without a slash loop', async () => {
  vi.stubEnv('NEXT_PUBLIC_BASE_PATH', '/moment-garden')
  vi.resetModules()
  const { proxy } = await import('../proxy')
  const bare = proxy(new NextRequest('https://flowers.example/moment-garden?bouquet=1970260fcfb'))
  expect(bare.status).toBe(308)
  expect(bare.headers.get('location')).toBe('https://flowers.example/moment-garden/?bouquet=1970260fcfb')
  for (const pathname of ['/moment-garden/', '/moment-garden/__og', '/moment-garden/og/1/1.png']) {
    expect(proxy(new NextRequest(`https://flowers.example${pathname}`)).headers.get('location')).toBeNull()
  }
})

it('leaves domain-root app URLs unchanged', async () => {
  vi.stubEnv('NEXT_PUBLIC_BASE_PATH', '')
  vi.resetModules()
  const { proxy } = await import('../proxy')
  expect(proxy(new NextRequest('https://flowers.example/?bouquet=1')).headers.get('location')).toBeNull()
})
