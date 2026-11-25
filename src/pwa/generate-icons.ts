import { execFileSync } from 'node:child_process'
import { mkdirSync, readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

const root = new URL('../../', import.meta.url)
const directory = new URL('public/icons/', root)
mkdirSync(directory, { recursive: true })
const flower = readFileSync(new URL('public/flowers.svg', root), 'utf8')
  .replace(/<svg[^>]*>/, '').replace('</svg>', '')

for (const [name, size, scale] of [
  ['icon-192.png', 192, 11],
  ['icon-512.png', 512, 11],
  ['icon-maskable-512.png', 512, 8],
  ['apple-touch-icon.png', 180, 11],
] as const) {
  const inset = (512 - 32 * scale) / 2
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" width="512" height="512"><rect width="512" height="512" fill="#fff9f2"/><g transform="translate(${inset} ${inset}) scale(${scale})">${flower}</g></svg>`
  execFileSync('magick', [
    'svg:-', '-resize', `${size}x${size}`, '-strip',
    '-define', 'png:exclude-chunks=date,time',
    `PNG24:${fileURLToPath(new URL(name, directory))}`,
  ], { input: svg })
}
