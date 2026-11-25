import { StrictMode } from 'react'
import { act, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { createAgent } from '@ui-sdk/react/agent'
import { beforeEach, expect, it, vi } from 'vitest'
import App from '../App'

const mocks = vi.hoisted(() => {
  const engine = {
    show: vi.fn((timestamp: number) => ({ timestamp, name: 'Here With You', kinds: ['rose', 'daisy', 'tulip'], flowerCount: 8 })),
    bloom: vi.fn(), resetView: vi.fn(), setReducedMotion: vi.fn(),
    exportPng: vi.fn(async () => new Blob(['postcard'], { type: 'image/png' })), dispose: vi.fn(),
  }
  return { engine, createGarden: vi.fn(() => engine) }
})
vi.mock('../garden/engine', () => ({ createGarden: mocks.createGarden }))
const agent = createAgent()

beforeEach(() => {
  vi.clearAllMocks()
  history.replaceState(null, '', '/?bouquet=1970260fcfb')
})

it('opens the shared bouquet with keyboard, exposes named actions, and preserves the seed on replay', async () => {
  const user = userEvent.setup()
  render(<App />)
  const open = await screen.findByRole('button', { name: 'Open your flowers', exact: true })
  await waitFor(() => expect((open as HTMLButtonElement).disabled).toBe(false))
  expect(mocks.engine.show).toHaveBeenCalledWith(1748091600123)
  await user.click(open)
  await waitFor(() => expect(screen.queryByRole('button', { name: 'Open your flowers', exact: true })).toBeNull())
  const components = agent.snapshot().filter(entry => !entry.offPage && entry.component !== 'more')
  for (const entry of components) expect(entry.label, `${entry.component} must have an accessible name`).toBeTruthy()
  const labels = components.map(entry => entry.label)
  for (const label of ['Send flowers', 'Grow another', 'Replay bloom', 'Reset view']) {
    expect(labels).toContain(label)
  }
  expect(labels.some(label => label?.includes('Save'))).toBe(true)
  await act(async () => {
    const result = await agent.act({ steps: [{ ref: 'Replay bloom', action: 'press' }] })
    expect(result.ok, result.error?.message).toBe(true)
  })
  expect(mocks.engine.bloom).toHaveBeenCalled()
  expect(mocks.engine.show).toHaveBeenCalledTimes(1)
  await user.click(screen.getByRole('button', { name: 'Reset view', exact: true }))
  expect(mocks.engine.resetView).toHaveBeenCalled()
})

it('disposes the renderer when its React owner unmounts', async () => {
  const view = render(<StrictMode><App /></StrictMode>)
  await waitFor(() => expect(mocks.createGarden).toHaveBeenCalled())
  view.unmount()
  expect(mocks.engine.dispose).toHaveBeenCalled()
})
