import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  resolve: { alias: { '@': new URL('./src', import.meta.url).pathname } },
  test: {
    projects: [
      {
        extends: true,
        test: {
          name: 'unit',
          environment: 'node',
          include: ['src/garden/**/*.test.ts', 'src/lib/**/*.test.ts'],
        },
      },
      {
        extends: true,
        test: {
          name: 'react',
          environment: 'jsdom',
          include: ['src/test/**/*.test.tsx'],
          setupFiles: ['./src/test/setup.ts'],
          css: false,
        },
      },
    ],
  },
})
