import { chromium, type Browser } from 'playwright'
import { mkdir, readFile, readdir, rename, stat, unlink, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { parseToken } from '../src/lib/bouquet-link'
import { randomUUID } from 'node:crypto'

export class RenderBusyError extends Error {
  readonly code = 'FLOWERS_RENDER_BUSY'
}

export function isRenderBusyError(error: unknown): boolean {
  return typeof error === 'object' && error !== null && 'code' in error && error.code === 'FLOWERS_RENDER_BUSY'
}

export interface ImageStoreOptions {
  directory: string
  maxEntries?: number
  render: (token: string) => Promise<Buffer>
  maxPending?: number
  rendersPerMinute?: number
}

function positiveInteger(value: number, name: string): void {
  if (!Number.isSafeInteger(value) || value < 1) throw new Error(`Invalid ${name}`)
}

export function createImageStore({ directory, maxEntries = 256, render, maxPending = 4, rendersPerMinute = 30 }: ImageStoreOptions) {
  positiveInteger(maxEntries, 'cache size')
  positiveInteger(maxPending, 'queue size')
  positiveInteger(rendersPerMinute, 'render budget')
  const pending = new Map<string, Promise<Buffer>>()
  let tail: Promise<unknown> = Promise.resolve()
  let starts: number[] = []
  let closed = false
  async function prune() {
    const files = (await readdir(directory)).filter(name => /^[a-f0-9]{16}-(?:v3-)?[a-f0-9]{1,14}\.png$/.test(name))
    const entries = await Promise.all(files.map(async name => ({ name, modified: (await stat(path.join(directory, name))).mtimeMs })))
    entries.sort((a, b) => a.modified - b.modified || a.name.localeCompare(b.name))
    await Promise.all(entries.slice(0, Math.max(0, entries.length - maxEntries)).map(({ name }) => unlink(path.join(directory, name))))
  }
  const ready = mkdir(directory, { recursive: true }).then(async () => {
    // The cache directory has one process owner; remove only its interrupted writes.
    const files = await readdir(directory)
    await Promise.all(files.filter(name => /^[a-f0-9]{16}-(?:v3-)?[a-f0-9]{1,14}\.png\.[0-9a-f-]{36}\.tmp$/.test(name)).map(name => unlink(path.join(directory, name))))
    await prune()
  })
  return {
    ready,
    async get(version: string, token: string): Promise<Buffer> {
      if (!/^[a-f0-9]{16}$/.test(version) || !parseToken(token)) throw new Error('Invalid image cache key')
      await ready
      const key = `${version}-${token}`
      const filename = path.join(directory, `${key}.png`)
      try { return await readFile(filename) } catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error }
      const existing = pending.get(key)
      if (existing) return existing
      const now = Date.now()
      starts = starts.filter(start => now - start < 60_000)
      if (closed || pending.size >= maxPending || starts.length >= rendersPerMinute) throw new RenderBusyError('Image renderer is busy')
      // Charge admissions, including failed renders, rather than completed renders.
      starts.push(now)
      const job = tail.then(async () => {
        if (closed) throw new RenderBusyError('Image renderer is shutting down')
        const bytes = await render(token)
        const temporary = `${filename}.${randomUUID()}.tmp`
        try {
          await writeFile(temporary, bytes)
          await rename(temporary, filename)
          await prune()
        } finally { await unlink(temporary).catch(() => {}) }
        return bytes
      })
      pending.set(key, job)
      tail = job.catch(() => {})
      try { return await job } finally { pending.delete(key) }
    },
    async close(): Promise<void> { closed = true; await ready; await tail },
  }
}

export type ImageStore = ReturnType<typeof createImageStore>

export interface ScreenshotRendererOptions {
  origin: string
  basePath?: string
  executablePath?: string
  timeout?: number
}

export function createScreenshotRenderer({ origin, basePath = '', executablePath, timeout = 20_000 }: ScreenshotRendererOptions) {
  const internal = new URL(origin)
  if (internal.protocol !== 'http:' || internal.hostname !== '127.0.0.1' || internal.username || internal.password || internal.pathname !== '/' || internal.search || internal.hash) {
    throw new Error('Capture origin must be an internal loopback HTTP origin')
  }
  if (basePath && (!basePath.startsWith('/') || basePath.endsWith('/') || /[?#\\]/.test(basePath))) throw new Error('Invalid capture base path')
  positiveInteger(timeout, 'capture timeout')
  let browserPromise: Promise<Browser> | undefined
  let closed = false
  async function browser(): Promise<Browser> {
    if (closed) throw new Error('Renderer is closed')
    if (!browserPromise) {
      browserPromise = chromium.launch({
        executablePath,
        headless: true,
        // Software WebGL keeps the container independent of a host GPU.
        args: ['--enable-webgl', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--disable-dev-shm-usage'],
      }).then(instance => {
        instance.on('disconnected', () => { browserPromise = undefined })
        return instance
      }).catch((error: unknown) => { browserPromise = undefined; throw error })
    }
    return browserPromise
  }
  return {
    async render(token: string): Promise<Buffer> {
      const gift = parseToken(token)
      if (!gift) throw new Error('Invalid capture token')
      const instance = await browser()
      const context = await instance.newContext({ viewport: { width: 1200, height: 630 }, deviceScaleFactor: 1, reducedMotion: 'reduce', locale: 'en-US', timezoneId: 'UTC', serviceWorkers: 'block' })
      let timer: ReturnType<typeof setTimeout> | undefined
      try {
        const capture = async () => {
          await context.route('**/*', route => {
            const url = new URL(route.request().url())
            return url.origin === internal.origin ? route.continue() : route.abort()
          })
          await context.routeWebSocket('**/*', socket => socket.close())
          const page = await context.newPage()
          page.setDefaultTimeout(timeout)
          await page.goto(`${internal.origin}${basePath}/__og?bouquet=${token}`, { waitUntil: 'load', timeout })
          await page.waitForFunction(() => ['ready', 'error'].includes(document.documentElement.dataset.ogStatus || ''))
          const state = await page.evaluate(() => {
            const data = document.querySelector('canvas')?.dataset
            return { status: document.documentElement.dataset.ogStatus, seed: data?.seed, version: data?.version }
          })
          if (state.status !== 'ready' || state.seed !== String(gift.timestamp) || state.version !== String(gift.version)) throw new Error('Bouquet capture failed readiness validation')
          return page.screenshot({ type: 'png', animations: 'disabled', timeout })
        }
        return await Promise.race([
          capture(),
          new Promise<never>((_, reject) => { timer = setTimeout(() => reject(new Error('Bouquet capture timed out')), timeout) }),
        ])
      } finally {
        clearTimeout(timer)
        await context.close()
      }
    },
    async close(): Promise<void> { closed = true; if (browserPromise) await (await browserPromise).close() },
  }
}
