import { StrictMode } from 'react'
import { act, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, expect, it, vi } from 'vitest'
import { SaveBloomGif } from '../components/SaveBloomGif'
import { exportBloomGif } from '../garden/bloom-gif'

vi.mock('../garden/bloom-gif', () => ({ exportBloomGif: vi.fn() }))
const exportGif = vi.mocked(exportBloomGif)
const gift = { timestamp: 1748091600123, version: 3 } as const

function suspendOnAbort(signal: AbortSignal) {
  return new Promise<Blob>((_, reject) => {
    signal.addEventListener('abort', () => reject(signal.reason), { once: true })
  })
}

afterEach(() => {
  vi.resetAllMocks()
  vi.restoreAllMocks()
})

it('passes the versioned gift through and starts an actual GIF download once', async () => {
  const user = userEvent.setup()
  const anchor = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (this: HTMLAnchorElement) {
    expect(this.download).toBe('flowers-for-you-v3-1970260fcfb.gif')
    expect(this.href).toMatch(/^blob:/)
  })
  let finish!: (gif: Blob) => void
  exportGif.mockImplementationOnce(() => new Promise(resolve => { finish = resolve }))
  render(<SaveBloomGif ready gift={gift} isCurrent={() => true} />)
  const save = screen.getByRole('button', { name: 'Save bloom GIF' })
  save.focus()
  await user.keyboard('{Enter}{Enter}')
  expect(save.getAttribute('aria-busy')).toBe('true')
  expect(exportGif).toHaveBeenCalledExactlyOnceWith(document, gift, expect.any(AbortSignal))
  await act(async () => finish(new Blob(['GIF89a'], { type: 'image/gif' })))
  expect(anchor).toHaveBeenCalledTimes(1)
  expect(screen.getByRole('status').textContent).toBe('Bloom GIF download started.')
  expect(document.activeElement).toBe(save)
})

it('cancels without downloading and returns keyboard focus to Save', async () => {
  const user = userEvent.setup()
  const anchor = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {})
  exportGif.mockImplementationOnce((_document, _gift, signal) => suspendOnAbort(signal))
  render(<SaveBloomGif ready gift={gift} isCurrent={() => true} />)
  const save = screen.getByRole('button', { name: 'Save bloom GIF' })
  save.focus()
  await user.keyboard('{Enter}{Tab}{Enter}')
  await waitFor(() => expect(screen.queryByRole('button', { name: 'Cancel GIF export' })).toBeNull())
  expect(exportGif.mock.calls[0][2].aborted).toBe(true)
  expect(anchor).not.toHaveBeenCalled()
  expect(screen.getByRole('status').textContent).toBe('GIF export canceled.')
  expect(document.activeElement).toBe(save)
})

it('aborts an owned export on unmount and never downloads stale results', async () => {
  const user = userEvent.setup()
  const anchor = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {})
  let finish!: (gif: Blob) => void
  exportGif.mockImplementationOnce(() => new Promise(resolve => { finish = resolve }))
  const view = render(<StrictMode><SaveBloomGif ready gift={gift} isCurrent={() => true} /></StrictMode>)
  await user.click(screen.getByRole('button', { name: 'Save bloom GIF' }))
  view.unmount()
  expect(exportGif.mock.calls[0][2].aborted).toBe(true)
  await act(async () => finish(new Blob(['GIF89a'], { type: 'image/gif' })))
  expect(anchor).not.toHaveBeenCalled()
})

it('offers a retry or postcard when the renderer or encoder fails', async () => {
  const user = userEvent.setup()
  exportGif.mockRejectedValueOnce(new Error('GL or Worker unavailable'))
  render(<SaveBloomGif ready gift={gift} isCurrent={() => true} />)
  const save = screen.getByRole('button', { name: 'Save bloom GIF' })
  await user.click(save)
  expect(screen.getByRole('status').textContent).toMatch(/try again.*postcard image/i)
  expect(save.getAttribute('aria-busy')).not.toBe('true')
})
