import { expect } from 'vitest'
import type { Locator } from 'playwright'

type Options = { timeout?: number }
type Expected = string | RegExp

interface LocatorMatchers<R> {
  toBeVisible(options?: Options): R
  toBeEnabled(options?: Options): R
  toBeFocused(options?: Options): R
  toHaveAttribute(name: string, value: Expected, options?: Options): R
  toHaveCSS(name: string, value: Expected, options?: Options): R
  toHaveText(value: Expected, options?: Options): R
  toHaveValue(value: Expected, options?: Options): R
  toHaveCount(value: number, options?: Options): R
  toHaveClass(value: Expected, options?: Options): R
  toBeInViewport(options?: Options & { ratio?: number }): R
}

declare module 'vitest' {
  interface Assertion<R extends void | Promise<void> = void, T = unknown> extends LocatorMatchers<T extends Locator ? Promise<void> : R> {}
}

const matches = (actual: string | null, expected: Expected) => actual !== null && (
  typeof expected === 'string' ? actual === expected : new RegExp(expected.source, expected.flags).test(actual)
)

const checks = {
  toBeVisible: (locator: Locator) => locator.isVisible(),
  toBeEnabled: async (locator: Locator) => await locator.count() > 0 && locator.isEnabled(),
  toBeFocused: async (locator: Locator) => await locator.count() > 0 && locator.evaluate(element => element === document.activeElement),
  toHaveAttribute: async (locator: Locator, name: string, expected: Expected) => await locator.count() > 0 && matches(await locator.getAttribute(name), expected),
  toHaveCSS: async (locator: Locator, name: string, expected: Expected) => await locator.count() > 0 && matches(await locator.evaluate((element, name) => getComputedStyle(element).getPropertyValue(name), name), expected),
  toHaveText: async (locator: Locator, expected: Expected) => await locator.count() > 0 && matches((await locator.textContent())?.replace(/\s+/g, ' ').trim() ?? null, expected),
  toHaveValue: async (locator: Locator, expected: Expected) => await locator.count() > 0 && matches(await locator.inputValue(), expected),
  toHaveCount: async (locator: Locator, expected: number) => await locator.count() === expected,
  toHaveClass: async (locator: Locator, expected: Expected) => await locator.count() > 0 && matches(await locator.getAttribute('class'), expected),
  toBeInViewport: async (locator: Locator, options: { ratio?: number } = {}) => await locator.count() > 0 && locator.evaluate((element, ratio) => {
    const box = element.getBoundingClientRect()
    if (!box.width || !box.height || getComputedStyle(element).visibility === 'hidden') return false
    const width = Math.max(0, Math.min(box.right, innerWidth) - Math.max(box.left, 0))
    const height = Math.max(0, Math.min(box.bottom, innerHeight) - Math.max(box.top, 0))
    return width * height > 0 && width * height / (box.width * box.height) >= ratio - .000001
  }, options.ratio ?? 0),
}

for (const [name, check] of Object.entries(checks)) {
  expect.extend({
    async [name](locator: Locator, ...args: unknown[]) {
      const options = args.at(-1)
      const timeout = typeof options === 'object' && options !== null && 'timeout' in options ? Number(options.timeout) : 10_000
      await expect.poll(
        () => (check as (...args: any[]) => Promise<boolean>)(locator, ...args),
        { timeout, interval: 50, message: `${locator} ${this.isNot ? 'not ' : ''}${name}(${args.map(String).join(', ')})` },
      ).toBe(!this.isNot)
      return { pass: !this.isNot, message: () => `${locator} ${name}` }
    },
  })
}
