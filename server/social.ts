import { createHash } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { formatToken, read as readBouquet } from '../src/lib/bouquet-link'
import { BASE_PATH, getPublicSite } from '../src/lib/site'
import { createImageStore, createScreenshotRenderer } from './images'

export const DEFAULT_BOUQUET = '1970260fcfb'

interface SocialRuntime {
  images: ReturnType<typeof createImageStore>
  renderer: ReturnType<typeof createScreenshotRenderer>
}
interface SocialState {
  version?: Promise<string>
  runtime?: Promise<SocialRuntime>
  stopping?: Promise<void>
  shutdownRegistered?: boolean
  closed?: boolean
}

declare global {
  // Next development reloads and independently bundled routes share one process owner.
  var __flowersSocial: SocialState | undefined
}
const state = globalThis.__flowersSocial ??= {}

/** Every production build has a distinct immutable image namespace. */
export async function getRenderVersion(): Promise<string> {
  state.version ??= (async () => {
    try {
      const buildId = (await readFile(path.resolve('.next/BUILD_ID'), 'utf8')).trim()
      if (!buildId) throw new Error('Empty Next BUILD_ID')
      return createHash('sha256').update(buildId).digest('hex').slice(0, 16)
    } catch (error) {
      if (process.env.NODE_ENV === 'production' || (error as NodeJS.ErrnoException).code !== 'ENOENT') throw error
      // Development has no immutable build artifact; isolate its namespace per process.
      return createHash('sha256').update(`development:${process.pid}:${Date.now()}`).digest('hex').slice(0, 16)
    }
  })().catch((error: unknown) => { state.version = undefined; throw error })
  return state.version
}

export async function getSocialImageUrl(search: URLSearchParams): Promise<string> {
  const bouquet = readBouquet(search.toString())
  const token = bouquet.status === 'valid' ? formatToken(bouquet) : DEFAULT_BOUQUET
  return new URL(`og/${await getRenderVersion()}/${token}.png`, getPublicSite()).href
}

function configuredInteger(name: string, fallback: number, maximum = Number.MAX_SAFE_INTEGER): number {
  const value = Number(process.env[name] ?? fallback)
  if (!Number.isSafeInteger(value) || value < 1 || value > maximum) throw new Error(`Invalid ${name}`)
  return value
}

export async function getSocialRuntime(): Promise<SocialRuntime> {
  if (state.closed) throw new Error('Image renderer is shutting down')
  state.runtime ??= (async () => {
    const renderer = createScreenshotRenderer({
      // Never trust PUBLIC_URL or Host: browser navigation is exclusively loopback.
      origin: `http://127.0.0.1:${configuredInteger('PORT', 3000, 65535)}`,
      basePath: BASE_PATH,
      executablePath: process.env.CHROMIUM_EXECUTABLE_PATH,
    })
    const images = createImageStore({
      directory: process.env.OG_CACHE_DIR || '.cache/og',
      maxEntries: configuredInteger('OG_CACHE_ENTRIES', 256),
      maxPending: configuredInteger('OG_MAX_PENDING', 4),
      rendersPerMinute: configuredInteger('OG_RENDERS_PER_MINUTE', 30),
      render: token => renderer.render(token),
    })
    try {
      await images.ready
      return { images, renderer }
    } catch (error) {
      await renderer.close()
      throw error
    }
  })().catch((error: unknown) => { state.runtime = undefined; throw error })
  return state.runtime
}

/** Start cache validation before accepting render work, without launching Chromium. */
export async function initializeSocialRenderer(): Promise<void> {
  await getSocialRuntime()
}

export async function closeSocialRenderer(): Promise<void> {
  state.closed = true
  state.stopping ??= (async () => {
    if (!state.runtime) return
    const { images, renderer } = await state.runtime
    const pending = images.close() // Mark closed synchronously so queued jobs cannot start.
    try { await renderer.close() } finally { await pending }
  })()
  await state.stopping
}

export function registerSocialShutdown(): void {
  if (state.shutdownRegistered) return
  state.shutdownRegistered = true
  // Additive only: Next remains responsible for server shutdown and process exit.
  for (const signal of ['SIGTERM', 'SIGINT'] as const) {
    process.once(signal, () => { void closeSocialRenderer().catch(error => console.error('Social renderer cleanup failed:', error)) })
  }
}
