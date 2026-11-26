import { act, fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { createAgent } from '@ui-sdk/react/agent'
import { expect, it, vi } from 'vitest'
import { COVER_EXIT_MS, GiftCover } from '../components/GiftCover'

it('keeps the ribbon and tap alternative disabled together until the flowers are ready', async () => {
  const props = { ready: false, reducedMotion: false, exiting: false, onOpen: vi.fn(), onExit: vi.fn() }
  const view = render(<GiftCover {...props} />)
  const ribbon = screen.getByRole('button', { name: 'Pull the ribbon' }) as HTMLButtonElement
  const tap = screen.getByRole('button', { name: 'Open your flowers' }) as HTMLButtonElement
  expect(ribbon.disabled && tap.disabled).toBe(true)
  expect(screen.getByRole('status').textContent).toMatch(/Getting your flowers ready/)
  view.rerender(<GiftCover {...props} ready />)
  expect(document.activeElement).toBe(tap)
  expect(ribbon.disabled || tap.disabled).toBe(false)
  const user = userEvent.setup()
  ribbon.focus()
  await user.keyboard(' ')
  expect(props.onOpen).toHaveBeenCalledWith(true)
})

it('exposes the same instant opener to non-pointer agents without requiring a pull', async () => {
  const agent = createAgent()
  const onOpen = vi.fn()
  render(<GiftCover ready exiting={false} reducedMotion={false} onOpen={onOpen} onExit={vi.fn()} />)
  const result = await agent.act({ steps: [{ ref: 'Open your flowers', action: 'press' }] })
  expect(result.ok).toBe(true)
  expect(onOpen).toHaveBeenCalledExactlyOnceWith(true)
})

function parcel(reducedMotion = false) {
  const props = { ready: true, exiting: false, reducedMotion, onOpen: vi.fn(), onExit: vi.fn() }
  const view = render(<GiftCover {...props} />)
  const ribbon = screen.getByRole('button', { name: 'Pull the ribbon' })
  const pointer = (x: number) => ({ pointerId: 7, isPrimary: true, button: 0, clientX: x, clientY: 90 })
  const shape = (name: string) => view.container.querySelector(`#parcel-${name}-shape`)?.getAttribute('d')
  return { ...view, props, ribbon, pointer, shape }
}

it.each([-1, 1])('scrubs reversibly and ignores the compatibility click after a short %i pull', side => {
  vi.useFakeTimers()
  try {
    const { props, ribbon, pointer, shape } = parcel(true)
    const name = side > 0 ? 'right-loop' : 'left-loop'
    const x = side > 0 ? 323 : 50
    const rest = shape(name)
    fireEvent.pointerDown(ribbon, pointer(x))
    const move = (distance: number) => {
      fireEvent.pointerMove(ribbon, pointer(x + side * distance))
      act(() => vi.advanceTimersByTime(20))
    }
    move(12)
    const first = shape(name)
    expect(first).not.toBe(rest)
    move(32)
    expect(shape(name)).not.toBe(first)
    move(12)
    expect(shape(name)).toBe(first)
    fireEvent.pointerUp(ribbon, pointer(x + side * 12))
    fireEvent.click(ribbon, { detail: 1 })
    expect(shape(name)).toBe(rest)
    expect(props.onOpen).not.toHaveBeenCalled()
  } finally { vi.useRealTimers() }
})

it('catches a settling tail without jumping and ignores a canceled second press', () => {
  vi.useFakeTimers()
  try {
    const { ribbon, pointer, shape, props } = parcel()
    const rest = shape('left-tail')
    fireEvent.pointerDown(ribbon, pointer(60))
    fireEvent.pointerMove(ribbon, pointer(37))
    fireEvent.pointerUp(ribbon, pointer(37))
    act(() => vi.advanceTimersByTime(64))
    const caught = shape('left-tail')
    expect(caught).not.toBe(rest)
    fireEvent.pointerDown(ribbon, pointer(43))
    act(() => vi.advanceTimersByTime(64))
    expect(shape('left-tail')).toBe(caught)
    fireEvent.pointerCancel(ribbon, pointer(43))
    fireEvent.click(ribbon, { detail: 1 })
    act(() => vi.advanceTimersByTime(200))
    expect(shape('left-tail')).toBe(rest)
    expect(props.onOpen).not.toHaveBeenCalled()
  } finally { vi.useRealTimers() }
})

it('commits on release, starts opening immediately and stops painting on unmount', () => {
  vi.useFakeTimers()
  try {
    const { props, ribbon, pointer, shape, unmount } = parcel()
    fireEvent.pointerDown(ribbon, pointer(315))
    fireEvent.pointerUp(ribbon, pointer(380))
    expect(props.onOpen).toHaveBeenCalledExactlyOnceWith(false)
    const before = shape('right-tail')
    act(() => vi.advanceTimersByTime(120))
    expect(shape('right-tail')).not.toBe(before)
    const path = document.getElementById('parcel-right-tail-shape')!
    const last = path.getAttribute('d')
    unmount()
    act(() => vi.advanceTimersByTime(1000))
    expect(path.getAttribute('d')).toBe(last)
  } finally { vi.useRealTimers() }
})

it('demonstrates the knot draw on tap and bounds removal even without transition events', () => {
  vi.useFakeTimers()
  try {
    const { props, rerender, shape } = parcel()
    const before = shape('right-loop')
    fireEvent.click(screen.getByRole('button', { name: 'Open your flowers' }), { detail: 1 })
    expect(props.onOpen).toHaveBeenCalledExactlyOnceWith(false)
    rerender(<GiftCover {...props} exiting />)
    act(() => vi.advanceTimersByTime(120))
    expect(shape('right-loop')).not.toBe(before)
    expect(props.onExit).not.toHaveBeenCalled()
    act(() => vi.advanceTimersByTime(COVER_EXIT_MS))
    expect(props.onExit).toHaveBeenCalledTimes(1)
  } finally { vi.useRealTimers() }
})
