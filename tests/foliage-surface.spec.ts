import { build } from 'esbuild'
import { beforeAll, describe, expect } from 'vitest'
import { browserProjects, createBrowserTest } from './browser.fixtures'
import type { probeLeaf } from './foliage-surface.fixtures'

let bundle: string
beforeAll(async () => {
  const { outputFiles } = await build({
    entryPoints: ['tests/foliage-surface.fixtures.ts'],
    bundle: true, write: false, platform: 'browser', format: 'iife', globalName: 'leafProbe',
  })
  bundle = outputFiles[0].text
})

describe.each(browserProjects)('$name foliage tissue', ({ options, isMobile }) => {
  const test = createBrowserTest(options, isMobile)

  test('vascular tissue absorbs light and the stem does not transmit it', async ({ page }) => {
    await page.addScriptTag({ content: bundle })
    const result = await page.evaluate(() => (globalThis as unknown as { leafProbe: { probeLeaf: typeof probeLeaf } }).leafProbe.probeLeaf())
    const { backlit, backlitStalk, unlit, upper, reverse, swatches, programs } = result
    expect(unlit).toEqual([0, 0, 0, 255])
    expect(backlitStalk).toEqual(unlit)
    expect(backlit.tip[1]).toBeGreaterThan(backlit.root[1] + 12)
    expect(backlit.margin[1]).toBeGreaterThan(backlit.rib[1] + 9)
    expect(backlit.tip[1]).toBeLessThan(upper[1])
    expect(reverse[2] / reverse[1]).toBeGreaterThan(upper[2] / upper[1] + .02)
    expect(swatches[0]).toEqual(swatches[3])
    expect(new Set(swatches.map(samples => JSON.stringify(samples))).size).toBe(3)
    expect(programs).toBe(1)
  })
})
