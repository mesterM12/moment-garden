import { expect, it } from 'vitest'
import { gripRibbon, resting, silkFeed, type Side } from '../components/ribbon-cloth'

it('reverses across the knot without changing a tail grip, and takes up slack on an opposite-tail regrab', () => {
  const center = gripRibbon(resting, 0)
  expect(center.at(-60, 0).side).toBe(-1)
  expect(center.at(50, 0).side).toBe(1)
  const right = gripRibbon(resting, 135)
  expect(right.at(-55, 0).side).toBe(1)
  const from = right.at(15, 0)
  const left = gripRibbon(from, -125)
  expect(left.at(0, 0)).toEqual(from)
  expect(left.at(-7, 0).dx).toBe(8)
  expect(left.at(-15, 0).dx).toBe(0)
  expect(left.at(-65, 0)).toMatchObject({ side: -1, dx: -50, grip: 125 })
  expect(left.at(-7, 0).dx).toBe(8)
  expect(left.tap.side).toBe(-1)
})

it.each([-1, 1] as const)('keeps a %i pull direct through commitment and limits excess travel without a hard stop', (side: Side) => {
  const feed = (distance: number, dy = 0) => silkFeed({ ...resting, side, dx: side * distance, dy })
  for (const distance of [0, 8, 37, 52, 99, 114]) {
    const { dx, dy } = feed(distance, -21)
    expect(dx).toBe(side * distance)
    expect(dy).toBe(-21)
  }
  expect(feed(114).tension).toBe(1)
  expect(Math.abs(feed(114.01).dx) - 114).toBeCloseTo(.01, 4)
  expect(Math.abs(feed(300).dx)).toBeGreaterThan(Math.abs(feed(150).dx))
  expect(Math.abs(feed(1e8).dx)).toBeLessThan(156)
  expect(Math.abs(feed(0, 1e8).dy)).toBeLessThan(90)
  expect(feed(-60).tension).toBe(0)
  expect(Math.abs(feed(-60).dx)).toBeLessThan(41)
})
