import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    name: 'browser',
    environment: 'node',
    include: ['tests/**/*.spec.ts'],
    globalSetup: ['./tests/browser.global-setup.ts'],
    setupFiles: ['./tests/browser.setup.ts'],
    pool: 'forks',
    maxWorkers: 1,
    fileParallelism: false,
    testTimeout: 90_000,
    hookTimeout: 60_000,
    expect: { poll: { timeout: 10_000, interval: 50 } },
  },
})
