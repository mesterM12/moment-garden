import { StrictMode } from 'react'
import { act, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { createAgent } from '@ui-sdk/react/agent'
import { beforeEach, expect, it, vi } from 'vitest'
import App from '../App'
import type { GardenEngineOptions } from '../garden/types'

const mocks = vi.hoisted(() => {
  const engine = {
    show: vi.fn((timestamp: number) => ({ timestamp, name: 'Here With You', kinds: ['rose', 'daisy', 'tulip'], flowerCount: 8 })),
    bloom: vi.fn(), resetView: vi.fn(), setCloseView: vi.fn(), setReducedMotion: vi.fn(),
    exportPng: vi.fn(async () => new Blob(['postcard'], { type: 'image/png' })), dispose: vi.fn(),
  }
  const sound = { prepare: vi.fn(), play: vi.fn(), sync: vi.fn(), stop: vi.fn(), dispose: vi.fn() }
  return { engine, sound, createGarden: vi.fn((_canvas: HTMLCanvasElement, _options: GardenEngineOptions) => engine) }
})
vi.mock('../garden/engine', () => ({ createGarden: mocks.createGarden }))
vi.mock('../lib/bloom-sound', () => ({ createBloomSound: () => mocks.sound }))
const agent = createAgent()

beforeEach(() => {
  vi.clearAllMocks()
  localStorage.clear()
  history.replaceState(null, '', '/?bouquet=1970260fcfb')
})

it('opens the shared bouquet with keyboard, exposes named actions, and preserves the seed on replay', async () => {
  const user = userEvent.setup()
  render(<App />)
  const open = await screen.findByRole('button', { name: 'Open your flowers' })
  await waitFor(() => expect((open as HTMLButtonElement).disabled).toBe(false))
  expect(mocks.engine.show).toHaveBeenCalledWith(1748091600123, 2)
  open.focus()
  await user.keyboard('{Enter}')
  expect(mocks.engine.bloom).toHaveBeenCalledWith({ instant: true })
  expect(mocks.sound.play).toHaveBeenCalledWith('opening')
  expect(document.querySelector('.flower-garden')?.hasAttribute('data-pointer-opened')).toBe(false)
  await waitFor(() => expect(screen.queryByRole('button', { name: 'Open your flowers' })).toBeNull())
  const components = agent.snapshot().filter(entry => !entry.offPage && entry.component !== 'more')
  for (const entry of components) expect(entry.label, `${entry.component} must have an accessible name`).toBeTruthy()
  const labels = components.map(entry => entry.label)
  for (const label of ['Send flowers', 'Grow another', 'Replay bloom', 'Reset view', 'Sound']) {
    expect(labels).toContain(label)
  }
  expect(labels.some(label => label?.includes('Save'))).toBe(true)
  await act(async () => {
    const result = await agent.act({ steps: [{ ref: 'Replay bloom', action: 'press' }] })
    expect(result.ok, result.error?.message).toBe(true)
  })
  expect(mocks.engine.bloom).toHaveBeenCalled()
  expect(mocks.sound.play).toHaveBeenLastCalledWith('bloom')
  expect(mocks.engine.show).toHaveBeenCalledTimes(1)
  await user.click(screen.getByRole('button', { name: 'Reset view' }))
  expect(mocks.engine.resetView).toHaveBeenCalled()
  const sharedAction = await agent.act({ steps: [{ ref: 'Send flowers', action: 'press' }] })
  expect(sharedAction.ok).toBe(false)
  await user.click(screen.getByRole('button', { name: 'Grow another' }))
  expect(mocks.engine.show).toHaveBeenCalledTimes(2)
  expect(mocks.engine.show.mock.calls[1][0]).not.toBe(1748091600123)
  expect(new URL(window.location.href).searchParams.has('bouquet')).toBe(false)
})

it('replays and re-shares a restored florist gift without drawing another recipe', async () => {
  const user = userEvent.setup()
  history.replaceState(null, '', '/?bouquet=v3-1970260fcfb')
  render(<App />)
  const open = screen.getByRole('button', { name: 'Open your flowers' })
  await waitFor(() => expect(mocks.engine.show).toHaveBeenCalledWith(1748091600123, 3))
  open.focus()
  await user.keyboard('{Enter}')
  await user.click(screen.getByRole('button', { name: 'Replay bloom' }))
  expect(mocks.engine.bloom).toHaveBeenLastCalledWith()
  expect(mocks.engine.show).toHaveBeenCalledTimes(1)
  await user.click(screen.getByRole('button', { name: 'Send flowers' }))
  expect(await navigator.clipboard.readText()).toMatch(/\?bouquet=v3-1970260fcfb$/)
})

it('uses new-version seeds on a fresh visit and advances them even if the clock stalls', async () => {
  const user = userEvent.setup()
  const now = vi.spyOn(Date, 'now').mockReturnValue(1000)
  history.replaceState(null, '', '/?utm=test#paper')
  try {
    render(<App />)
    const opener = screen.getByRole('button', { name: 'Open your flowers' })
    await waitFor(() => expect(mocks.engine.show).toHaveBeenCalledWith(1000, 3))
    await user.click(opener)
    for (let i = 1; i <= 2; i++) {
      await user.click(screen.getByRole('button', { name: 'Grow another' }))
      expect(mocks.engine.show).toHaveBeenLastCalledWith(1000 + i, 3)
    }
    await user.click(screen.getByRole('button', { name: 'Send flowers' }))
    expect(await navigator.clipboard.readText()).toMatch(/\?bouquet=v3-3ea$/)
    expect(location.search + location.hash).toBe('?utm=test#paper')
  } finally { now.mockRestore() }
})

it('can inspect the petals with the keyboard without generating a different gift', async () => {
  const user = userEvent.setup()
  render(<App />)
  const open = await screen.findByRole('button', { name: 'Open your flowers' })
  await waitFor(() => expect((open as HTMLButtonElement).disabled).toBe(false))
  open.focus()
  await user.keyboard('{Enter}')
  const detail = screen.getByRole('button', { name: 'Look closer' })
  detail.focus()
  await user.keyboard(' ')
  expect(mocks.engine.setCloseView).toHaveBeenCalledWith(true, { instant: true })
  const callbacks = mocks.createGarden.mock.calls.at(-1)![1]
  act(() => callbacks.onCloseViewChange?.(true))
  expect(detail.getAttribute('aria-pressed')).toBe('true')
  act(() => callbacks.onCloseViewChange?.(false))
  expect(detail.getAttribute('aria-pressed')).toBe('false')
  expect(mocks.engine.show).toHaveBeenCalledTimes(1)
})

it('marks only pointer opening for the action reveal and keeps the group interactive', async () => {
  const user = userEvent.setup()
  render(<App />)
  const open = await screen.findByRole('button', { name: 'Open your flowers' })
  await waitFor(() => expect((open as HTMLButtonElement).disabled).toBe(false))
  await user.click(open)
  const actions = document.querySelector('.flower-garden')!
  expect(actions.hasAttribute('data-pointer-opened')).toBe(true)
  expect(actions.hasAttribute('data-sealed')).toBe(false)
  expect(actions.hasAttribute('inert')).toBe(false)
  expect(mocks.engine.bloom).toHaveBeenCalledWith({ instant: false })
  expect(mocks.sound.play).toHaveBeenCalledWith('opening-and-bloom')
  const callbacks = mocks.createGarden.mock.calls[0]![1]
  act(() => callbacks.onBloomProgress?.(.35))
  expect(mocks.sound.sync).toHaveBeenCalledWith(.35)
  act(() => callbacks.onBloomPause?.())
  expect(mocks.sound.stop).toHaveBeenCalledTimes(1)
  await user.click(screen.getByRole('button', { name: 'Grow another' }))
  expect(actions.hasAttribute('data-pointer-opened')).toBe(true)
  expect(mocks.engine.show).toHaveBeenCalledTimes(2)
})

it('lets people mute both layers before opening, remembers the choice, and keeps replay silent', async () => {
  const user = userEvent.setup()
  const view = render(<App />)
  const sound = screen.getByRole('button', { name: 'Sound' })
  expect(sound.getAttribute('aria-pressed')).toBe('true')
  sound.focus()
  await user.keyboard(' ')
  expect(sound.getAttribute('aria-pressed')).toBe('false')
  expect(localStorage.getItem('flowers-opening-sound')).toBe('off')
  const open = await screen.findByRole('button', { name: 'Open your flowers' })
  await waitFor(() => expect((open as HTMLButtonElement).disabled).toBe(false))
  open.focus()
  await user.keyboard('{Enter}')
  await user.click(screen.getByRole('button', { name: 'Replay bloom' }))
  expect(mocks.sound.play).not.toHaveBeenCalled()
  expect(mocks.sound.stop).toHaveBeenCalled()
  view.unmount()
  render(<App />)
  expect(screen.getByRole('button', { name: 'Sound' }).getAttribute('aria-pressed')).toBe('false')
})

it('stops the opening sound when the page is hidden', async () => {
  render(<App />)
  Object.defineProperty(document, 'hidden', { configurable: true, value: true })
  try {
    act(() => document.dispatchEvent(new Event('visibilitychange')))
    expect(mocks.sound.stop).toHaveBeenCalledTimes(1)
  } finally {
    Reflect.deleteProperty(document, 'hidden')
  }
})

it('disposes the renderer when its React owner unmounts', async () => {
  const view = render(<StrictMode><App /></StrictMode>)
  await waitFor(() => expect(mocks.createGarden).toHaveBeenCalled())
  view.unmount()
  expect(mocks.engine.dispose).toHaveBeenCalled()
  expect(mocks.sound.dispose).toHaveBeenCalledTimes(2)
})
