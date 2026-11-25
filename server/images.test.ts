import { afterEach, describe, expect, it, vi } from 'vitest'
import { mkdtemp, readdir, rm, utimes, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { createImageStore, RenderBusyError, type ImageStore } from './images'

const VERSION = '0123456789abcdef'
const directories: string[] = []
const stores: ImageStore[] = []
async function directory(): Promise<string> {
  const result = await mkdtemp(path.join(os.tmpdir(), 'flowers-og-'))
  directories.push(result)
  return result
}
function track(options: Parameters<typeof createImageStore>[0]): ImageStore {
  const store = createImageStore(options)
  stores.push(store)
  return store
}
function deferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>(done => { resolve = done })
  return { promise, resolve }
}
afterEach(async () => {
  vi.restoreAllMocks()
  await Promise.all(stores.splice(0).map(store => store.close().catch(() => {})))
  await Promise.all(directories.splice(0).map(root => rm(root, { recursive: true, force: true })))
})

describe('persistent image cache', () => {
  it('deduplicates concurrent requests and survives a new process owner', async () => {
    const root = await directory()
    const render = vi.fn(async (token: string) => Buffer.from(`PNG:${token}`))
    const store = track({ directory: root, render })
    const images = await Promise.all(Array.from({ length: 8 }, () => store.get(VERSION, '1970260fcfb')))
    expect(images.every(bytes => bytes.toString() === 'PNG:1970260fcfb')).toBe(true)
    expect(render).toHaveBeenCalledTimes(1)
    await store.close()
    const otherRender = vi.fn(async () => Buffer.from('unexpected'))
    const other = track({ directory: root, render: otherRender })
    expect((await other.get(VERSION, '1970260fcfb')).toString()).toBe('PNG:1970260fcfb')
    expect(otherRender).not.toHaveBeenCalled()
    expect(await readdir(root)).toEqual([`${VERSION}-1970260fcfb.png`])
  })

  it('bounds pending keys, but duplicates do not use extra queue slots', async () => {
    const started = deferred<void>()
    const release = deferred<Buffer>()
    const render = vi.fn(() => { started.resolve(); return release.promise })
    const store = track({ directory: await directory(), maxPending: 1, render })
    const first = store.get(VERSION, '1')
    await started.promise
    const duplicate = store.get(VERSION, '1')
    try {
      await expect(store.get(VERSION, '2')).rejects.toBeInstanceOf(RenderBusyError)
    } finally { release.resolve(Buffer.from('ok')) }
    await expect(first).resolves.toEqual(Buffer.from('ok'))
    await expect(duplicate).resolves.toEqual(Buffer.from('ok'))
    expect(render).toHaveBeenCalledTimes(1)
  })

  it('serializes renders, retries failures and charges failed admissions against the minute budget', async () => {
    let attempts = 0
    const now = vi.spyOn(Date, 'now').mockReturnValue(1_000)
    const render = vi.fn(async () => {
      if (++attempts === 1) throw new Error('failed render')
      return Buffer.from('ok')
    })
    const store = track({ directory: await directory(), rendersPerMinute: 2, render })
    await expect(store.get(VERSION, '2')).rejects.toThrow('failed render')
    expect((await store.get(VERSION, '2')).toString()).toBe('ok')
    await expect(store.get(VERSION, '3')).rejects.toBeInstanceOf(RenderBusyError)
    // Cache hits are still available when the budget is exhausted.
    expect((await store.get(VERSION, '2')).toString()).toBe('ok')
    now.mockReturnValue(61_001)
    await expect(store.get(VERSION, '3')).resolves.toEqual(Buffer.from('ok'))
  })

  it('prunes oldest entries on startup and after writes, leaving unrelated files alone', async () => {
    const root = await directory()
    for (const [index, token] of ['1', '2', '3'].entries()) {
      const filename = path.join(root, `${VERSION}-${token}.png`)
      await writeFile(filename, token)
      await utimes(filename, index + 1, index + 1)
    }
    await writeFile(path.join(root, 'keep.txt'), 'unrelated')
    const store = track({ directory: root, maxEntries: 2, render: async token => Buffer.from(token) })
    await store.ready
    expect(await readdir(root)).toEqual([`${VERSION}-2.png`, `${VERSION}-3.png`, 'keep.txt'])
    await store.get(VERSION, '4')
    expect(await readdir(root)).toEqual([`${VERSION}-3.png`, `${VERSION}-4.png`, 'keep.txt'])
  })

  it('cleans only owned orphan writes and rejects an unusable cache directory', async () => {
    const root = await directory()
    const orphan = `${VERSION}-1.png.12345678-1234-1234-1234-123456789abc.tmp`
    await writeFile(path.join(root, orphan), 'partial')
    await writeFile(path.join(root, 'keep.tmp'), 'unrelated')
    const store = track({ directory: root, render: async () => Buffer.from('ok') })
    await store.ready
    expect(await readdir(root)).toEqual(['keep.tmp'])
    const broken = track({ directory: path.join(root, 'keep.tmp'), render: async () => Buffer.from('ok') })
    await expect(broken.ready).rejects.toMatchObject({ code: 'EEXIST' })
  })

  it('rejects invalid cache keys and configuration before rendering', async () => {
    const render = vi.fn(async () => Buffer.from('unused'))
    const root = await directory()
    const store = track({ directory: root, render })
    for (const [version, token] of [['../bad', '1'], [VERSION, '../1'], [VERSION, 'ABC']]) {
      await expect(store.get(version, token)).rejects.toThrow('Invalid image cache key')
    }
    for (const maxEntries of [0, -1, 1.1, NaN]) {
      expect(() => createImageStore({ directory: root, render, maxEntries })).toThrow('Invalid cache size')
    }
    expect(render).not.toHaveBeenCalled()
  })

  it('shutdown cancels queued work and settles its promises without starting another render', async () => {
    const started = deferred<void>()
    const release = deferred<Buffer>()
    const render = vi.fn(() => { started.resolve(); return release.promise })
    const store = track({ directory: await directory(), render })
    const first = store.get(VERSION, '1')
    await started.promise
    const second = store.get(VERSION, '2')
    // Let the asynchronous cache lookup finish and admit the second key to the queue.
    await new Promise<void>(resolve => setImmediate(resolve))
    const rejected = expect(second).rejects.toBeInstanceOf(RenderBusyError)
    const stopped = store.close()
    release.resolve(Buffer.from('ok'))
    await Promise.all([first, rejected, stopped])
    expect(render).toHaveBeenCalledTimes(1)
    await expect(store.get(VERSION, '3')).rejects.toBeInstanceOf(RenderBusyError)
  })
})
