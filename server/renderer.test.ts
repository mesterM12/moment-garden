import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createScreenshotRenderer } from './images'

const browser = vi.hoisted(() => ({
  launch: vi.fn(), newContext: vi.fn(), close: vi.fn(), on: vi.fn(),
  route: vi.fn(), routeWebSocket: vi.fn(), contextClose: vi.fn(), newPage: vi.fn(),
  goto: vi.fn(), wait: vi.fn(), evaluate: vi.fn(), screenshot: vi.fn(), timeout: vi.fn(),
}))
vi.mock('playwright', () => ({ chromium: { launch: browser.launch } }))
beforeEach(() => {
  vi.resetAllMocks()
  browser.launch.mockResolvedValue({ newContext: browser.newContext, close: browser.close, on: browser.on })
  browser.newContext.mockResolvedValue({ route: browser.route, routeWebSocket: browser.routeWebSocket, close: browser.contextClose, newPage: browser.newPage })
  browser.newPage.mockResolvedValue({ goto: browser.goto, waitForFunction: browser.wait, evaluate: browser.evaluate, screenshot: browser.screenshot, setDefaultTimeout: browser.timeout })
  browser.evaluate.mockResolvedValue({ status: 'ready', seed: String(Number.parseInt('1970260fcfb', 16)) })
  browser.screenshot.mockResolvedValue(Buffer.from('png'))
})
afterEach(() => { vi.useRealTimers() })

describe('loopback screenshot renderer', () => {
  it.each(['https://flowers.example', 'http://localhost:3000', 'http://127.0.0.1:3000/private', 'http://name@127.0.0.1:3000', 'http://127.0.0.1:3000/?q=1'])('rejects non-internal origins %s before browser launch', origin => {
    expect(() => createScreenshotRenderer({ origin })).toThrow('Capture origin')
    expect(browser.launch).not.toHaveBeenCalled()
  })

  it('captures the build-time path, validates readiness and seed, and blocks off-origin requests and sockets', async () => {
    const renderer = createScreenshotRenderer({ origin: 'http://127.0.0.1:3000', basePath: '/garden' })
    expect(await renderer.render('1970260fcfb')).toEqual(Buffer.from('png'))
    expect(browser.goto).toHaveBeenCalledWith('http://127.0.0.1:3000/garden/__og?bouquet=1970260fcfb', { waitUntil: 'load', timeout: 20_000 })
    expect(browser.newContext).toHaveBeenCalledWith(expect.objectContaining({ serviceWorkers: 'block', reducedMotion: 'reduce', viewport: { width: 1200, height: 630 } }))
    const route = browser.route.mock.calls[0][1] as (request: { request: () => { url: () => string }; continue: () => void; abort: () => void }) => void
    for (const [url, allowed] of [['http://127.0.0.1:3000/fonts/local.woff2', true], ['https://evil.example/secret', false], ['http://169.254.169.254/', false], ['http://127.0.0.1:4000/', false]] as const) {
      const proceed = vi.fn()
      const abort = vi.fn()
      route({ request: () => ({ url: () => url }), continue: proceed, abort })
      expect(proceed).toHaveBeenCalledTimes(allowed ? 1 : 0)
      expect(abort).toHaveBeenCalledTimes(allowed ? 0 : 1)
    }
    const socket = { close: vi.fn() }
    browser.routeWebSocket.mock.calls[0][1](socket)
    expect(socket.close).toHaveBeenCalledTimes(1)
    expect(browser.contextClose).toHaveBeenCalledTimes(1)
    await renderer.close()
    expect(browser.close).toHaveBeenCalledTimes(1)
    await expect(renderer.render('1970260fcfb')).rejects.toThrow('Renderer is closed')
  })

  it.each([{ status: 'error', seed: '1748094745851' }, { status: 'ready', seed: '1' }])('does not screenshot a failed or wrong-seed page', async state => {
    browser.evaluate.mockResolvedValue(state)
    const renderer = createScreenshotRenderer({ origin: 'http://127.0.0.1:3000' })
    await expect(renderer.render('1970260fcfb')).rejects.toThrow('readiness validation')
    expect(browser.screenshot).not.toHaveBeenCalled()
    expect(browser.contextClose).toHaveBeenCalledTimes(1)
    await renderer.close()
  })

  it('reuses a browser but creates and closes a fresh context for each capture', async () => {
    const renderer = createScreenshotRenderer({ origin: 'http://127.0.0.1:3000' })
    await renderer.render('1970260fcfb')
    await renderer.render('1970260fcfb')
    expect(browser.launch).toHaveBeenCalledTimes(1)
    expect(browser.newContext).toHaveBeenCalledTimes(2)
    expect(browser.contextClose).toHaveBeenCalledTimes(2)
    await renderer.close()
  })

  it('recovers from launch failures', async () => {
    browser.launch.mockRejectedValueOnce(new Error('launch failed'))
    const renderer = createScreenshotRenderer({ origin: 'http://127.0.0.1:3000' })
    await expect(renderer.render('1970260fcfb')).rejects.toThrow('launch failed')
    await expect(renderer.render('1970260fcfb')).resolves.toEqual(Buffer.from('png'))
    expect(browser.launch).toHaveBeenCalledTimes(2)
    await renderer.close()
  })

  it('bounds total capture time and closes the context on timeout', async () => {
    vi.useFakeTimers()
    browser.goto.mockReturnValue(new Promise(() => {}))
    const renderer = createScreenshotRenderer({ origin: 'http://127.0.0.1:3000', timeout: 50 })
    const capture = renderer.render('1970260fcfb')
    const rejected = expect(capture).rejects.toThrow('Bouquet capture timed out')
    await vi.advanceTimersByTimeAsync(51)
    await rejected
    expect(browser.contextClose).toHaveBeenCalledTimes(1)
    await renderer.close()
  })
})
