import { build } from 'esbuild'
import { beforeAll, describe, expect } from 'vitest'
import { browserProjects, createBrowserTest } from './browser.fixtures'
import type { probeBouquetStudio } from './bouquet-studio.fixtures'

let bundle: string
beforeAll(async () => {
  const { outputFiles } = await build({
    entryPoints: ['tests/bouquet-studio.fixtures.ts'],
    bundle: true, write: false, platform: 'browser', format: 'iife', globalName: 'studioProbe',
  })
  bundle = outputFiles[0].text
})

describe.each(browserProjects)('$name bouquet shadows', ({ options, isMobile }) => {
  const test = createBrowserTest(options, isMobile)

  test('casts moving contact shadows and reuses depth on camera and turntable changes', async ({ page }) => {
    await page.addScriptTag({ content: bundle })
    const result = await page.evaluate(() => (globalThis as unknown as { studioProbe: { probeBouquetStudio: typeof probeBouquetStudio } }).studioProbe.probeBouquetStudio())
    const { first, cached, turned, morph, again, rewind, isolated, fallback, texturesBeforeDispose, texturesAfterDispose } = result
    expect(first.calls - cached.calls).toBe(4) // sheet, two independent blades, one instanced anther draw
    expect(cached.patches).toEqual(first.patches)
    expect(turned.calls).toBe(cached.calls)
    first.patches.forEach((value, i) => expect(Math.abs(value - turned.patches[i])).toBeLessThan(5))
    expect(morph.calls).toBe(first.calls)
    expect(morph.patches[0] - turned.patches[0]).toBeGreaterThan(32)
    expect(morph.patches.slice(1)).toEqual(turned.patches.slice(1))
    expect(again).toEqual({ ...morph, calls: cached.calls })
    expect(rewind).toEqual(first)
    isolated.patches.forEach((value, i) => expect(value - first.patches[i]).toBeGreaterThan(32))
    expect(fallback.calls).toBe(cached.calls)
    expect(fallback.patches).toEqual(isolated.patches)
    expect(texturesBeforeDispose - texturesAfterDispose).toBe(2)
  })
})
