import type { NextConfig } from 'next'

const basePath = process.env.NEXT_PUBLIC_BASE_PATH || ''
if (basePath && (!/^\/(?:[a-zA-Z0-9_-]+\/?)+$/.test(basePath) || basePath.endsWith('/'))) {
  throw new Error('NEXT_PUBLIC_BASE_PATH must be an app path such as /moment-garden, without a trailing slash')
}

const config: NextConfig = {
  output: 'standalone',
  basePath,
  skipTrailingSlashRedirect: true,
  serverExternalPackages: ['playwright', 'playwright-core'],
  htmlLimitedBots: /.*/,
  async headers() {
    return [
      { source: '/:path*', headers: [{ key: 'X-Content-Type-Options', value: 'nosniff' }, { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' }] },
      { source: '/sw.js', headers: [{ key: 'Cache-Control', value: 'no-cache' }, { key: 'Service-Worker-Allowed', value: `${basePath}/` }] },
    ]
  },
}
export default config
