import { beforeEach, describe, expect, it, vi } from 'vitest'
import { GET, HEAD } from '../src/app/og/[version]/[image]/route'
import { RenderBusyError } from './images'

const runtime = vi.hoisted(() => ({ get: vi.fn(), initialize: vi.fn(), version: vi.fn() }))
vi.mock('./social', () => ({
  getRenderVersion: runtime.version,
  getSocialRuntime: runtime.initialize,
}))
const VERSION = '0123456789abcdef'
const request = new Request('https://untrusted-host.example/og')
const context = (image = '1970260fcfb.png', version = VERSION) => ({ params: Promise.resolve({ image, version }) })
beforeEach(() => {
  vi.clearAllMocks()
  runtime.version.mockResolvedValue(VERSION)
  runtime.get.mockResolvedValue(Buffer.from('89504e470d0a1a0a', 'hex'))
  runtime.initialize.mockResolvedValue({ images: { get: runtime.get } })
})

describe('Next image route', () => {
  it('returns PNG bytes with immutable headers and the exact canonical cache key', async () => {
    const response = await GET(request, context())
    expect(response.status).toBe(200)
    expect(response.headers.get('content-type')).toBe('image/png')
    expect(response.headers.get('content-length')).toBe('8')
    expect(response.headers.get('cache-control')).toBe('public, max-age=31536000, immutable')
    expect(response.headers.get('etag')).toBe(`"${VERSION}-1970260fcfb"`)
    expect(Buffer.from(await response.arrayBuffer()).toString('hex')).toBe('89504e470d0a1a0a')
    expect(runtime.get).toHaveBeenCalledExactlyOnceWith(VERSION, '1970260fcfb')
  })

  it.each(['0', 'v3-0', 'v3-1970260fcfb', (8640000000000000).toString(16)])('accepts canonical boundary seed %s', async token => {
    expect((await GET(request, context(`${token}.png`))).status).toBe(200)
    expect(runtime.get).toHaveBeenCalledExactlyOnceWith(VERSION, token)
  })

  it('HEAD never initializes the image store or renderer', async () => {
    const response = await HEAD(request, context())
    expect(response.status).toBe(200)
    expect(response.headers.get('content-type')).toBe('image/png')
    expect(await response.text()).toBe('')
    expect(runtime.initialize).not.toHaveBeenCalled()
    expect(runtime.get).not.toHaveBeenCalled()
  })

  it.each(['v4-1.png', 'v3-01.png', '01.png', 'ABC.png', 'ffffffffffffff.png', `${(8640000000000001).toString(16)}.png`, 'xyz.png', '.png', '1.jpg', '../1.png', '1.png\n'])('rejects noncanonical or invalid image %s before rendering', async image => {
    const response = await GET(request, context(image))
    expect(response.status).toBe(404)
    expect(response.headers.get('cache-control')).toBe('no-store')
    expect(runtime.initialize).not.toHaveBeenCalled()
  })

  it.each(['0000000000000000', 'ABC', '../x', '0123456789abcdef\n'])('rejects wrong or malformed version %s', async version => {
    expect((await GET(request, context('1.png', version))).status).toBe(404)
    expect(runtime.initialize).not.toHaveBeenCalled()
  })

  it.each([['busy', 429], ['failed', 503]] as const)('marks %s responses retryable and never cacheable', async (kind, status) => {
    const log = vi.spyOn(console, 'error').mockImplementation(() => {})
    runtime.get.mockRejectedValueOnce(kind === 'busy' ? new RenderBusyError('busy') : new Error('browser failed'))
    const response = await GET(request, context())
    expect(response.status).toBe(status)
    expect(response.headers.get('cache-control')).toBe('no-store')
    expect(response.headers.get('retry-after')).toBe('10')
    log.mockRestore()
  })

  it('recognizes a busy error from an independently bundled instrumentation entry', async () => {
    const error = Object.assign(new Error('busy from another module instance'), { code: 'FLOWERS_RENDER_BUSY' })
    expect(error).not.toBeInstanceOf(RenderBusyError)
    runtime.get.mockRejectedValueOnce(error)
    expect((await GET(request, context())).status).toBe(429)
  })

  it('configuration failures on HEAD also return a retryable empty response', async () => {
    const log = vi.spyOn(console, 'error').mockImplementation(() => {})
    runtime.version.mockRejectedValueOnce(new Error('missing build'))
    const response = await HEAD(request, context())
    expect(response.status).toBe(503)
    expect(response.headers.get('retry-after')).toBe('10')
    expect(await response.text()).toBe('')
    log.mockRestore()
  })
})
