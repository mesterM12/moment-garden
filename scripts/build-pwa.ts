import { build } from 'esbuild'
import { createHash } from 'node:crypto'
import { readFile, readdir, writeFile } from 'node:fs/promises'
import path from 'node:path'

const base = process.env.NEXT_PUBLIC_BASE_PATH || ''
const buildId = (await readFile('.next/BUILD_ID', 'utf8')).trim()
const version = createHash('sha256').update(buildId).digest('hex').slice(0, 16)
async function files(directory: string): Promise<string[]> {
  const entries = await readdir(directory, { withFileTypes: true })
  return (await Promise.all(entries.map(async entry => entry.isDirectory() ? files(path.join(directory, entry.name)) : [path.join(directory, entry.name)]))).flat()
}
const staticFiles = await files('.next/static')
const publicFiles = (await Promise.all(['audio', 'fonts', 'icons'].map(folder => files(`public/${folder}`)))).flat()
const urls = [
  `${base}/`, `${base}/flowers.svg`, `${base}/manifest.webmanifest`,
  ...staticFiles.filter(file => /\.(?:js|css|woff2)$/.test(file)).map(file => `${base}/_next/${file.slice('.next/'.length)}`),
  ...publicFiles.filter(file => /\.(?:wav|woff2|png)$/.test(file)).map(file => `${base}/${file.slice('public/'.length)}`),
]
await build({
  entryPoints: ['src/pwa/sw.ts'], outfile: 'public/sw.js', bundle: true, minify: true, target: 'es2022',
  define: { __PRECACHE_URLS__: JSON.stringify(urls), __CACHE_VERSION__: JSON.stringify(version) },
})
await writeFile('public/manifest.webmanifest', JSON.stringify({
  id: './', name: 'Flowers for You', short_name: 'Flowers',
  description: 'A little bouquet to open, watch bloom, and keep.', start_url: './', scope: './', display: 'standalone',
  theme_color: '#f5e9e2', background_color: '#fff9f2',
  icons: [
    { src: 'icons/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
    { src: 'icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
    { src: 'icons/icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
  ],
}, null, 2))
console.log(`PWA precache: ${urls.length} URLs (${version})`)
