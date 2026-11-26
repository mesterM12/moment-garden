#!/usr/bin/env node
// See realism-proof.md for the baseline/candidate workflow and measurement limits.
import { execFileSync } from 'node:child_process'
import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises'
import { arch, cpus, platform, release, totalmem } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { build } from 'esbuild'
import { chromium } from 'playwright'

const [address, destination, baseline] = process.argv.slice(2)
if (!address || !destination || process.argv.length > 5) {
  throw new Error('Usage: node tools/realism-proof.mjs <local postcard URL> <new output dir> [baseline dir for matched crops]')
}
const app = new URL(address)
if (!['127.0.0.1', 'localhost', '[::1]'].includes(app.hostname) || !['http:', 'https:'].includes(app.protocol)) {
  throw new Error('Use a loopback postcard URL from the same checkout that is running this script.')
}
const repo = fileURLToPath(new URL('../', import.meta.url))
const output = resolve(destination)
const infoFile = 'proof.json'
const before = baseline && JSON.parse(await readFile(resolve(baseline, infoFile), 'utf8'))
const dimensions = { width: 390, height: 480 } // Isolated production draw workload, not a CSS stage measurement.
const viewport = { width: 390, height: 844 }
const base = 1748091600123
const token = offset => `v3-${(base + offset).toString(16)}`
const views = ['half', 'front', 'angle']
const viewTitles = ['Half · same lens', 'Mature · face', 'Mature · oblique']
const families = {
  '01-ray-disks': [['daisy', 29, 3], ['sunflower', 91, 0], ['cosmos', 30, 3]],
  '02-open-bowls': [['poppy', 21, 1], ['anemone', 1, 1]],
  '03-layered-cups': [['rose', 6, 0], ['ranunculus', 45, 0]],
  '04-dahlia': [['dahlia', 46, 0]],
  '05-tulip-and-lily': [['tulip', 33, 0, [57, 72]], ['lily', 32, 1]],
  '06-calla-orchid-iris': [['calla', 1, 0, [75, 88]], ['orchid', 71, 0], ['iris', 11, 0]],
  '07-clusters': [['hydrangea', 28, 0], ['billyButton', 23, 3]],
}
const representative = [1, 6, 28, 46, 91].map(token)
const browserArgs = process.env.REALISM_ANGLE_BACKEND ? [`--use-angle=${process.env.REALISM_ANGLE_BACKEND}`]
  : ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader']

await mkdir(output, { recursive: true })
if ((await readdir(output)).length) throw new Error(`Output must be an empty directory: ${output}`)
const { outputFiles: [bundle] } = await build({
  entryPoints: [join(repo, 'tools/realism-garden.ts')], bundle: true, platform: 'browser', write: false,
})
const git = (...args) => execFileSync('git', args, { cwd: repo, encoding: 'utf8' }).trimEnd()

const escape = string => String(string).replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char])
const img = async (root, path) => `<img src="data:image/png;base64,${(await readFile(join(root, path))).toString('base64')}" alt="">`
const chartStyle = `<style>
*{box-sizing:border-box}body{margin:0;color:#573b3d;background:#f5e9e2;font:14px system-ui,sans-serif}
main{display:table;padding:12px}h1{font:24px Georgia,serif;margin:0 0 4px}p{margin:0 0 12px}
article{display:table;margin-top:8px;background:#fff9f2;border:1px solid #e7d3ce;padding:8px}
h2{margin:0 0 6px;font-size:15px}small{margin-left:10px;font-weight:normal}strong{color:#9a4d5c}
.row{display:flex;gap:6px}figure{margin:0}figcaption{display:block;margin:4px 0;font-size:12px}
img{display:block;background:#fff9f2}.whole img{width:288px;height:377px;object-fit:contain}
</style>`

const browser = await chromium.launch({ args: browserArgs })
try {
  const isolated = await browser.newPage({ viewport, deviceScaleFactor: 1 })
  await isolated.goto('about:blank')
  await isolated.addScriptTag({ content: bundle.text })
  const diagnostic = await isolated.evaluate(() => {
    const { environment, keys, size } = window.realismProof
    return { environment, keys, size }
  })
  const subjects = Object.values(families).flat().map(([key]) => key).sort()
  if (JSON.stringify(subjects) !== JSON.stringify(diagnostic.keys)) throw new Error('Species list changed; update the diagnostic cases before comparing.')
  if (before && (before.specimenSize !== diagnostic.size || JSON.stringify(before.families) !== JSON.stringify(families))) {
    throw new Error('Baseline case list or image size does not match this tool.')
  }
  const { version: playwright } = JSON.parse(await readFile(new URL('../node_modules/playwright/package.json', import.meta.url), 'utf8'))
  const report = {
    revision: git('rev-parse', 'HEAD'), workingTree: git('status', '--porcelain'), address: app.href,
    environment: { platform: platform(), release: release(), arch: arch(), cpu: cpus()[0]?.model, logicalCpus: cpus().length,
      memoryBytes: totalmem(), node: process.version, playwright: `${browser.browserType().name()} ${playwright}`,
      browser: browser.version(), browserArgs, ...diagnostic.environment },
    specimenSize: diagnostic.size, representativeDimensions: dimensions, appViewport: viewport, dpr: 1,
    baselineRevision: before ? before.revision : undefined, families, specimens: {}, bouquets: [], postcards: [],
  }

  await mkdir(join(output, 'heads'))
  for (const key of representative) {
    const run = (token, run) => isolated.evaluate(({ token, width, height, run }) => window.realismProof.measure(token, width, height, run), { token, run, ...dimensions })
    const captures = []
    for (let n = 1; n <= 3; n++) captures.push(await run(key, n))
    report.bouquets.push(...captures)
    console.log('Measured bouquet', key)
  }
  for (const rows of Object.values(families)) for (const [key, offset, slot, elevations = [23, 62]] of rows) {
    const fixed = before?.specimens[key]?.lenses
    if (before && !fixed) throw new Error(`Baseline lenses missing for ${key}`)
    const capture = await isolated.evaluate(({ key, token, slot, elevations, fixed }) => window.realismProof.specimen(key, token, slot, elevations, fixed), {
      key, token: token(offset), slot, elevations, fixed,
    })
    const { frames, ...subject } = capture
    const files = {}
    for (const view of views) {
      const path = `heads/${key}-${view}.png`
      await writeFile(join(output, path), Buffer.from(frames[view].png.split(',')[1], 'base64'))
      files[view] = { path, coverage: frames[view].coverage }
      if (frames[view].coverage > 1) console.warn(`Outside fixed crop: ${key} ${view}; run a fresh output without baseline to inspect the whole head.`)
    }
    report.specimens[key] = { ...subject, files }
    console.log('Captured diagnostic head', key, subject.token, `slot ${slot}`)
  }
  await isolated.evaluate(() => window.realismProof.dispose())
  await isolated.close()

  const appPage = await browser.newPage({ viewport, deviceScaleFactor: 1, isMobile: true, hasTouch: true, serviceWorkers: 'block' })
  const canvas = appPage.locator('#flower[data-version="3"]')
  const stage = appPage.locator('.flower-stage')
  const open = appPage.getByRole('button', { name: 'Open your flowers', exact: true })
  const status = appPage.locator('.flower-postcard-details [role="status"]').first()
  await mkdir(join(output, 'postcards'))
  for (const key of representative) {
    const url = new URL(app)
    url.searchParams.set('bouquet', key)
    await appPage.goto(url.href)
    await canvas.waitFor({ state: 'attached' })
    const seed = Number.parseInt(key.slice(3), 16)
    if (Number(await canvas.getAttribute('data-seed')) !== seed) throw new Error(`Postcard did not restore ${key}`)
    await appPage.addStyleTag({ content: 'nextjs-portal { display: none }' })
    await appPage.evaluate(() => document.fonts.ready)
    await open.press('Enter') // The real accessible control opens directly to maturity.
    if (await status.textContent() !== 'In full bloom') await status.filter({ hasText: 'In full bloom' }).waitFor({ state: 'attached' })
    await canvas.blur()
    const front = `postcards/${key}-front.png`, angle = `postcards/${key}-angle.png`
    await stage.screenshot({ path: join(output, front) })
    for (let n = 0; n < 5; n++) await canvas.press('ArrowRight')
    await canvas.blur()
    await stage.screenshot({ path: join(output, angle) })
    const { width, height } = await stage.boundingBox()
    report.postcards.push({ token: key, files: { front, angle }, stage: { width, height } })
    console.log('Captured actual postcard stage', key)
  }
  await appPage.close()

  const chart = await browser.newPage({ viewport: { width: 2000, height: 900 }, deviceScaleFactor: 1 })
  async function sheet(file, title, note, rows, klass = '') {
    await chart.setContent(`${chartStyle}<main class="${klass}"><h1>${escape(title)}</h1><p>${escape(note)}</p>${rows.join('')}</main>`)
    await chart.locator('main').screenshot({ path: join(output, file), type: 'jpeg', quality: 92 })
  }
  const figure = (image, title) => `<figure>${image}<figcaption>${escape(title)}</figcaption></figure>`
  const row = (name, detail, figures) => `<article><h2>${escape(name)}<small>${escape(detail)}</small></h2><div class="row">${figures.join('')}</div></article>`
  const allHeads = []
  for (const [family, rows] of Object.entries(families)) {
    const familyHeads = []
    for (const [key] of rows) {
      const current = report.specimens[key]
      const old = before?.specimens[key]
      const right = await Promise.all(views.map(async (view, index) => figure(await img(output, current.files[view].path),
        `${before ? 'After · ' : ''}${viewTitles[index]}${current.files[view].coverage > 1 ? ' · outside crop' : ''}`)))
      const left = old ? await Promise.all(views.map(async (view, index) => figure(await img(resolve(baseline), old.files[view].path), `Before · ${viewTitles[index]}`))) : []
      const detail = `${current.token} · slot ${current.slot + 1} · ${current.name} (${current.pattern}) · half at p=${current.half.toFixed(3)}`
      allHeads.push(row(current.label, detail, right))
      familyHeads.push(row(current.label, detail, [...left, ...right]))
    }
    await sheet(`${family}.jpg`, `Diagnostic heads · ${family.slice(3).replaceAll('-', ' ')}`,
      before ? 'Before → after · production blooms isolated; baseline crop and angle locked' : 'Production blooms isolated · not actual postcards', familyHeads)
  }
  await sheet('all-species.jpg', 'Diagnostic heads · all 15 species', 'Production blooms isolated · not actual postcards', allHeads)
  const wholeRows = await Promise.all(report.postcards.map(async current => {
    const old = before?.postcards.find(p => p.token === current.token)
    const names = { front: 'Front', angle: 'Turned · five steps' }
    const figures = []
    const cards = old ? [[resolve(baseline), old, 'Before · '], [output, current, 'After · ']] : [[output, current, '']]
    for (const [dir, card, label] of cards) {
      for (const view of ['front', 'angle']) figures.push(figure(await img(dir, card.files[view]), `${label}${names[view]}`))
    }
    return row(report.bouquets.find(b => b.token === current.token).name, current.token, figures)
  }))
  await sheet('actual-postcards.jpg', 'Actual postcard stages', 'Real mobile-size app · mature via keyboard open · second view turned with ArrowRight', wholeRows, 'whole')
  await writeFile(join(output, infoFile), `${JSON.stringify(report, null, 2)}\n`)
  console.log(`Proof: ${output}`)
} finally { await browser.close() }
