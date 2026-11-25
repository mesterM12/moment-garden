import { StrictMode } from 'react'
import { act, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, expect, it, vi } from 'vitest'
import SocialCapture from '../social/SocialCapture'
import type { GardenEngineOptions } from '../garden/types'

const mocks = vi.hoisted(() => {
  const dispose = vi.fn()
  const engines: {
    show: ReturnType<typeof vi.fn>
    bloom: ReturnType<typeof vi.fn>
    resetView: ReturnType<typeof vi.fn>
    setReducedMotion: ReturnType<typeof vi.fn>
    dispose: ReturnType<typeof vi.fn>
  }[] = []
  const createGarden = vi.fn((canvas: HTMLCanvasElement, options: GardenEngineOptions) => {
    const engine = {
      show: vi.fn((timestamp: number) => {
        canvas.dataset.seed = String(timestamp)
        canvas.dataset.version = '2'
        return { timestamp, name: 'Here With You', kinds: ['rose'], flowerCount: 8 }
      }),
      bloom: vi.fn(() => options.onBloomProgress?.(1)),
      resetView: vi.fn(), setReducedMotion: vi.fn(), dispose,
    }
    engines.push(engine)
    return engine
  })
  return { createGarden, dispose, engines }
})
vi.mock('../garden/engine', () => ({ createGarden: mocks.createGarden }))

const load = vi.fn()
const check = vi.fn()
beforeEach(() => {
  vi.clearAllMocks()
  mocks.engines.length = 0
  load.mockResolvedValue([{ status: 'loaded' }])
  check.mockReturnValue(true)
  Object.defineProperty(document, 'fonts', {
    configurable: true,
    value: { load, check, ready: Promise.resolve() },
  })
  vi.spyOn(HTMLCanvasElement.prototype, 'getBoundingClientRect').mockReturnValue({ width: 600, height: 554 } as DOMRect)
  delete document.documentElement.dataset.ogStatus
})

it('renders the canonical seed with the shared engine, instant front view and no controls', async () => {
  render(<SocialCapture search="?bouquet=1970260fcfb" />)
  expect(document.documentElement.dataset.ogStatus).toBe('loading')
  await waitFor(() => expect(document.documentElement.dataset.ogStatus).toBe('ready'))
  expect(document.querySelector('main')?.dataset.ogSeed).toBe('1748091600123')
  expect(screen.getByRole('heading', { name: 'Here With You' })).toBeTruthy()
  expect(screen.queryAllByRole('button')).toHaveLength(0)
  expect(document.querySelector('canvas')?.getAttribute('tabindex')).toBeNull()
  const engine = mocks.engines[0]
  expect(engine.show).toHaveBeenCalledWith(1748091600123)
  expect(engine.setReducedMotion).toHaveBeenCalledWith(true)
  expect(engine.bloom).toHaveBeenCalledWith({ instant: true })
  expect(engine.resetView).toHaveBeenCalledWith({ instant: true })
  expect(load).toHaveBeenCalledTimes(3)
  expect(check).toHaveBeenCalledTimes(3)
})

it.each(['', '?bouquet=no', '?bouquet=01', '?bouquet=ABC', '?bouquet=1&bouquet=2'])(
  'rejects absent or noncanonical tokens without generating a fallback: %s', async search => {
    render(<SocialCapture search={search} />)
    await waitFor(() => expect(document.documentElement.dataset.ogStatus).toBe('error'))
    expect(mocks.createGarden).not.toHaveBeenCalled()
    expect(document.querySelector('main')?.hasAttribute('data-og-seed')).toBe(false)
  },
)

it('supports zero as a canonical seed', async () => {
  render(<SocialCapture search="?bouquet=0" />)
  await waitFor(() => expect(document.documentElement.dataset.ogStatus).toBe('ready'))
  expect(mocks.engines[0].show).toHaveBeenCalledWith(0)
})

it('waits for explicit font loading and does not mistake fallback fonts for success', async () => {
  let resolve!: (value: { status: string }[]) => void
  load.mockReturnValue(new Promise<{ status: string }[]>(done => { resolve = done }))
  render(<SocialCapture search="?bouquet=1" />)
  await act(async () => { await Promise.resolve() })
  expect(document.documentElement.dataset.ogStatus).toBe('loading')
  expect(mocks.createGarden).not.toHaveBeenCalled()
  await act(async () => { resolve([]) })
  await waitFor(() => expect(document.documentElement.dataset.ogStatus).toBe('error'))
  expect(mocks.createGarden).not.toHaveBeenCalled()
})

it('reports rejected font loads as errors', async () => {
  load.mockRejectedValue(new Error('Font download failed'))
  render(<SocialCapture search="?bouquet=1" />)
  await waitFor(() => expect(document.documentElement.dataset.ogStatus).toBe('error'))
})

it('does not signal ready when the stage has zero size', async () => {
  vi.spyOn(HTMLCanvasElement.prototype, 'getBoundingClientRect').mockReturnValue({ width: 0, height: 0 } as DOMRect)
  render(<SocialCapture search="?bouquet=1" />)
  await waitFor(() => expect(document.documentElement.dataset.ogStatus).toBe('error'))
})

it('turns renderer and context failures into a terminal error', async () => {
  render(<SocialCapture search="?bouquet=1" />)
  await waitFor(() => expect(document.documentElement.dataset.ogStatus).toBe('ready'))
  const options = mocks.createGarden.mock.calls[0][1]
  act(() => options.onContextChange?.(true))
  expect(document.documentElement.dataset.ogStatus).toBe('error')
  act(() => options.onError?.(null))
  expect(document.documentElement.dataset.ogStatus).toBe('error')
})

it('disposes its StrictMode owner and ignores callbacks after unmount', async () => {
  const view = render(<StrictMode><SocialCapture search="?bouquet=1" /></StrictMode>)
  await waitFor(() => expect(document.documentElement.dataset.ogStatus).toBe('ready'))
  const options = mocks.createGarden.mock.calls.at(-1)![1]
  view.unmount()
  expect(mocks.dispose).toHaveBeenCalledTimes(mocks.createGarden.mock.calls.length)
  act(() => options.onError?.('A late failure'))
  expect(document.documentElement.dataset.ogStatus).toBeUndefined()
})

it('ignores a pending async initialization after unmount', async () => {
  let resolve!: (value: { status: string }[]) => void
  load.mockReturnValue(new Promise<{ status: string }[]>(done => { resolve = done }))
  const view = render(<SocialCapture search="?bouquet=1" />)
  view.unmount()
  await act(async () => { resolve([{ status: 'loaded' }]) })
  expect(mocks.createGarden).not.toHaveBeenCalled()
  expect(document.documentElement.dataset.ogStatus).toBeUndefined()
})
