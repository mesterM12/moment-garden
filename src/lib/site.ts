// This module is safe to import in client components. Next replaces this value at build time.
export const BASE_PATH = process.env.NEXT_PUBLIC_BASE_PATH || ''

export function publicPath(relative: string): string {
  return `${BASE_PATH}/${relative.replace(/^\/+/, '')}`
}

/** PUBLIC_URL is runtime configuration, never a source for browser capture requests. */
export function getPublicSite(): URL {
  const site = new URL(process.env.PUBLIC_URL || `http://localhost:3000${BASE_PATH}/`)
  if (!['http:', 'https:'].includes(site.protocol) || site.username || site.password || site.search || site.hash) {
    throw new Error('PUBLIC_URL must be an HTTP(S) app URL without credentials, query, or fragment')
  }
  site.pathname = `${site.pathname.replace(/\/+$/, '')}/`
  if (site.pathname !== `${BASE_PATH}/`) {
    throw new Error('PUBLIC_URL pathname must match the build-time NEXT_PUBLIC_BASE_PATH')
  }
  return site
}
