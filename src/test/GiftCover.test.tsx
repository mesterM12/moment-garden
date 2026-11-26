import { act, fireEvent, render, screen } from '@testing-library/react'
import { StrictMode } from 'react'
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

it.each([-1, 1])('arms only when the %i tail feeds outward, and disarms on reversal', side => {
  vi.useFakeTimers()
  try {
    const { ribbon, pointer, props, container } = parcel(true)
    const hint = container.querySelector('.parcel-hint')!
    const tag = container.querySelector<HTMLElement>('.parcel-label')!
    const x = side < 0 ? 64 : 314
    const move = (d: number) => {
      fireEvent.pointerMove(document, pointer(x + side * d))
      act(() => vi.advanceTimersByTime(20))
    }
    fireEvent.pointerDown(ribbon, pointer(x))
    move(68)
    expect(hint.hasAttribute('data-armed')).toBe(true)
    expect(Math.sign(parseFloat(tag.style.rotate))).toBe(-side)
    move(20)
    expect(hint.hasAttribute('data-armed')).toBe(false)
    move(-70)
    fireEvent.pointerUp(document, pointer(x - side * 70))
    fireEvent.click(ribbon, { detail: 1 })
    expect(props.onOpen).not.toHaveBeenCalled()
    expect(parseFloat(tag.style.rotate)).toBe(0)
  } finally { vi.useRealTimers() }
})

it.each(['pinch', 'capture loss', 'Escape', 'window blur'])('abandons an armed pull on %s, including the following pointer click', reason => {
  vi.useFakeTimers()
  try {
    const { ribbon, pointer, props, shape } = parcel(true)
    const rest = shape('right-tail')
    fireEvent.pointerDown(ribbon, pointer(310))
    fireEvent.pointerMove(ribbon, pointer(382))
    act(() => vi.advanceTimersByTime(32))
    expect(shape('right-tail')).not.toBe(rest)
    if (reason === 'pinch') fireEvent.pointerDown(document.body, { ...pointer(210), pointerId: 8, isPrimary: false })
    else if (reason === 'capture loss') fireEvent.lostPointerCapture(ribbon, pointer(382))
    else if (reason === 'Escape') fireEvent.keyDown(document, { key: 'Escape' })
    else fireEvent(window, new Event('blur'))
    fireEvent.pointerUp(ribbon, pointer(390))
    fireEvent.click(ribbon, { detail: 1 })
    expect(shape('right-tail')).toBe(rest)
    expect(props.onOpen).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole('button', { name: 'Open your flowers' }), { detail: 0 })
    expect(props.onOpen).toHaveBeenCalledExactlyOnceWith(true)
  } finally { vi.useRealTimers() }
})

it('keeps pulling when implicit touch capture transfers from a silk path to the button', () => {
  const { ribbon, pointer, props } = parcel()
  const path = ribbon.querySelector('path')!
  fireEvent.pointerDown(path, { ...pointer(64), pointerType: 'touch' })
  fireEvent.pointerMove(path, { ...pointer(30), pointerType: 'touch' })
  fireEvent.lostPointerCapture(path, { ...pointer(30), pointerType: 'touch' })
  fireEvent.pointerUp(ribbon, { ...pointer(6), pointerType: 'touch' })
  expect(props.onOpen).toHaveBeenCalledExactlyOnceWith(false)
  expect(ribbon.closest('.parcel')!.hasAttribute('data-pulled-left')).toBe(true)
})

it('clears the held pose when reduced motion changes, without removing direct control', () => {
  vi.useFakeTimers()
  try {
    const { ribbon, props, pointer, shape, rerender } = parcel()
    const rest = shape('right-tail')
    fireEvent.pointerDown(ribbon, pointer(315))
    fireEvent.pointerMove(ribbon, pointer(375))
    act(() => vi.advanceTimersByTime(20))
    expect(shape('right-tail')).not.toBe(rest)
    rerender(<GiftCover {...props} reducedMotion />)
    fireEvent.pointerUp(document, pointer(375))
    expect(shape('right-tail')).toBe(rest)
    expect(props.onOpen).not.toHaveBeenCalled()
    fireEvent.pointerDown(ribbon, pointer(315))
    fireEvent.pointerUp(ribbon, pointer(375))
    const end = shape('right-tail')
    act(() => vi.advanceTimersByTime(200))
    expect(shape('right-tail')).toBe(end)
    expect(props.onOpen).toHaveBeenCalledExactlyOnceWith(false)
  } finally { vi.useRealTimers() }
})

it('yields vertical swipes to scrolling without warping or opening the parcel', () => {
  vi.useFakeTimers()
  try {
    const { ribbon, pointer, props, shape } = parcel()
    const rest = shape('right-tail')
    fireEvent.pointerDown(ribbon, { ...pointer(305), pointerType: 'touch' })
    fireEvent.pointerMove(ribbon, { ...pointer(312), clientY: 122, pointerType: 'touch' })
    act(() => vi.advanceTimersByTime(32))
    fireEvent.pointerUp(ribbon, { ...pointer(390), clientY: 133, pointerType: 'touch' })
    fireEvent.click(ribbon, { detail: 1 })
    expect(shape('right-tail')).toBe(rest)
    expect(props.onOpen).not.toHaveBeenCalled()
  } finally { vi.useRealTimers() }
})

it('demonstrates the touched side on tap without counting contact jitter as a pull', () => {
  const { ribbon, pointer, container, props } = parcel()
  fireEvent.pointerDown(ribbon, { ...pointer(63), pointerType: 'touch' })
  fireEvent.pointerMove(ribbon, { ...pointer(66), pointerType: 'touch' })
  fireEvent.pointerUp(ribbon, { ...pointer(66), pointerType: 'touch' })
  fireEvent.click(ribbon, { detail: 1 })
  expect(props.onOpen).toHaveBeenCalledExactlyOnceWith(false)
  expect(container.querySelector('.parcel')!.hasAttribute('data-pulled-left')).toBe(true)
})

it('does not carry an in-progress pointer across a Strict Mode remount', () => {
  const props = { ready: true, exiting: false, reducedMotion: true, onOpen: vi.fn(), onExit: vi.fn() }
  const view = render(<StrictMode><GiftCover {...props} key="old" /></StrictMode>)
  const point = { pointerId: 7, isPrimary: true, button: 0, clientX: 310, clientY: 90 }
  fireEvent.pointerDown(screen.getByRole('button', { name: 'Pull the ribbon' }), point)
  view.rerender(<StrictMode><GiftCover {...props} key="new" /></StrictMode>)
  fireEvent.pointerUp(document, { ...point, clientX: 390 })
  expect(props.onOpen).not.toHaveBeenCalled()
  fireEvent.click(screen.getByRole('button', { name: 'Pull the ribbon' }), { detail: 0 })
  expect(props.onOpen).toHaveBeenCalledExactlyOnceWith(true)
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
