import { build } from 'esbuild'
import { beforeAll, describe, expect } from 'vitest'
import { browserProjects, createBrowserTest } from './browser.fixtures'
import type { probePetal } from './petal-surface.fixtures'

let bundle: string
beforeAll(async () => {
  const { outputFiles } = await build({
    entryPoints: ['tests/petal-surface.fixtures.ts'],
    bundle: true, write: false, platform: 'browser', format: 'iife', globalName: 'petalProbe',
  })
  bundle = outputFiles[0].text
})

describe.each(browserProjects)('$name petal tissue', ({ options, isMobile }) => {
  const test = createBrowserTest(options, isMobile)

  test('transmits through lit thin tissue, not the socket, veins or attached solids', async ({ page }) => {
    await page.addScriptTag({ content: bundle })
    const result = await page.evaluate(() => (globalThis as unknown as { petalProbe: { probePetal: typeof probePetal } }).petalProbe.probePetal())
    const { unlit, backlit, reordered, single, grazing, front, reverse, detail, solid, solidWithField, families, distant, shadowed, bypass, noShadow, bounceOnly } = result
    const [root, body, tip, vein] = backlit.map(rgba => rgba[1])
    expect(unlit).toEqual([0, 0, 0, 255])
    expect(detail).toEqual(unlit)
    expect(solid).not.toEqual(unlit)
    expect(solidWithField).toEqual(solid)
    expect(root + 15).toBeLessThan(body)
    expect(body + 15).toBeLessThan(tip)
    expect(vein + 20).toBeLessThan(tip)
    expect(grazing[1] + 30).toBeLessThan(tip)
    expect(reordered).toEqual(backlit[2])
    expect(single).toEqual(backlit[2])
    expect(reverse[1]).toBeLessThan(front[1])
    expect(families[0]).toEqual(families.at(-1))
    expect(new Set(families.map(samples => JSON.stringify(samples))).size).toBe(4)
    expect(families.every(samples => samples.every(rgba => rgba[1] > 0 && rgba[3] === 255))).toBe(true)
    expect(distant.every(({ mean, max }) => mean < 3 && max < 12)).toBe(true)
    expect(shadowed[0]).toEqual(bounceOnly[0])
    expect(shadowed[1]).toEqual(noShadow[1])
    expect(bypass).toEqual(noShadow)
    expect(shadowed[0][1] + 30).toBeLessThan(noShadow[0][1])
    expect(shadowed[0][1]).toBeGreaterThan(0)
  })
})
