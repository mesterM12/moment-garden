import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), 'VITE_')
  const site = new URL(env.VITE_SITE_URL || 'https://mesterm12.github.io/moment-garden/')
  if (site.protocol !== 'https:' || site.username || site.password || site.search || site.hash) {
    throw new Error('VITE_SITE_URL must be a public HTTPS app URL without credentials, query, or fragment.')
  }
  if (!site.pathname.endsWith('/')) site.pathname += '/'
  const image = new URL('og/flowers-for-you.jpg', site).href.replaceAll('&', '&amp;').replaceAll('"', '&quot;')

  return {
  base: './',
  plugins: [{
    name: 'flowers-social-metadata',
    transformIndexHtml: {
      order: 'pre',
      handler: html => html.replaceAll('%VITE_SITE_URL%og/flowers-for-you.jpg', image),
    },
  }, react(), tailwindcss(), VitePWA({
    strategies: 'injectManifest',
    srcDir: 'src/pwa',
    filename: 'sw.ts',
    injectRegister: false,
    registerType: 'prompt',
    includeAssets: ['flowers.svg', 'icons/*.png'],
    manifest: {
      id: './',
      name: 'Flowers for You',
      short_name: 'Flowers',
      description: 'A little bouquet to open, watch bloom, and keep.',
      start_url: './',
      scope: './',
      display: 'standalone',
      theme_color: '#f5e9e2',
      background_color: '#fff9f2',
      icons: [
        { src: 'icons/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
        { src: 'icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
        { src: 'icons/icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
      ],
    },
    injectManifest: {
      globPatterns: ['**/*.{js,css,html,svg,png,webmanifest}'],
      globIgnores: ['docs/**'],
      maximumFileSizeToCacheInBytes: 4 * 1024 * 1024,
    },
    devOptions: { enabled: false },
  })],
  resolve: {
    alias: { '@': new URL('./src', import.meta.url).pathname },
  },
  build: {
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes('/node_modules/three/')) return 'three'
        },
      },
    },
  },
  }
})
