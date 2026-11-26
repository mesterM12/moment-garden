import { spawn } from 'node:child_process'
import { access, rm } from 'node:fs/promises'
import { resolve } from 'node:path'
import { setTimeout as delay } from 'node:timers/promises'

const origin = 'http://127.0.0.1:4189'
const cache = resolve('.cache/og-e2e')

export default async function setup() {
  await access(resolve('.next/BUILD_ID')).catch(() => {
    throw new Error('Browser tests require a production Next build. Run pnpm build first.')
  })
  try {
    await fetch(`${origin}/healthz`, { signal: AbortSignal.timeout(1_000) })
    throw new Error(`Browser test port is already in use: ${origin}. Stop the existing server first.`)
  } catch (error) {
    if (error instanceof Error && error.message.startsWith('Browser test port')) throw error
  }
  await rm(cache, { recursive: true, force: true })
  let output = ''
  const server = spawn(process.execPath, [resolve('node_modules/next/dist/bin/next'), 'start', '--hostname', '127.0.0.1', '--port', '4189'], {
    cwd: process.cwd(),
    env: { ...process.env, NODE_ENV: 'production', PORT: '4189', PUBLIC_URL: `${origin}/`, OG_CACHE_DIR: cache },
    stdio: ['ignore', 'pipe', 'pipe'],
    detached: process.platform !== 'win32',
  })
  let spawnError: Error | undefined
  server.on('error', error => { spawnError = error })
  for (const stream of [server.stdout, server.stderr]) stream.on('data', chunk => { output = (output + chunk).slice(-30_000) })
  let exited = false
  server.on('exit', () => { exited = true })
  const signal = (name: NodeJS.Signals) => {
    if (!server.pid) return
    try {
      if (process.platform === 'win32') server.kill(name)
      else process.kill(-server.pid, name)
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ESRCH') throw error
    }
  }
  const cleanup = async () => {
    signal('SIGTERM')
    const deadline = Date.now() + 10_000
    while (!exited && Date.now() < deadline) await delay(100)
    signal('SIGKILL')
    await rm(cache, { recursive: true, force: true })
  }
  try {
    const deadline = Date.now() + 60_000
    while (Date.now() < deadline) {
      if (spawnError || exited) throw new Error(`Next production server exited before readiness: ${spawnError?.message ?? server.exitCode}\n${output}`)
      try {
        const response = await fetch(`${origin}/healthz`, { signal: AbortSignal.timeout(1_000) })
        if (response.ok) return cleanup
      } catch { /* Next has not started listening yet. */ }
      await delay(100)
    }
    throw new Error(`Next production server did not become healthy at ${origin}/healthz\n${output}`)
  } catch (error) {
    await cleanup()
    throw error
  }
}
