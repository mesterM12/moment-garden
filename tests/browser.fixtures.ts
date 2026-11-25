import { test as base } from 'vitest'
import { chromium, devices, type BrowserContextOptions } from 'playwright'

export const baseURL = 'http://127.0.0.1:4189'
export const browserProjects = [
  { name: 'desktop', isMobile: false, options: { ...devices['Desktop Chrome'], viewport: { width: 1440, height: 1000 } } },
  { name: 'mobile', isMobile: true, options: { ...devices['iPhone 13'], defaultBrowserType: 'chromium' } },
]

const browserTest = base.extend('browser', { scope: 'file' }, async ({}, { onCleanup }) => {
  const browser = await chromium.launch({ args: ['--enable-webgl', '--use-gl=angle', '--use-angle=swiftshader'] })
  onCleanup(() => browser.close())
  return browser
})

export function createBrowserTest(options: BrowserContextOptions, isMobile: boolean) {
  return browserTest
    .extend('isMobile', isMobile)
    .extend('context', async ({ browser }, { onCleanup }) => {
      const context = await browser.newContext({ ...options, baseURL })
      context.setDefaultTimeout(10_000)
      context.setDefaultNavigationTimeout(30_000)
      onCleanup(() => context.close())
      return context
    })
    .extend('page', async ({ context }) => context.newPage())
    .extend('request', async ({ context }) => context.request)
}
