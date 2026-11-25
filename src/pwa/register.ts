import { publicPath } from '../lib/site'

export async function registerOfflineApp() {
  if (process.env.NODE_ENV !== 'production' || !window.isSecureContext || !('serviceWorker' in navigator)) return
  try {
    await navigator.serviceWorker.register(publicPath('sw.js'), {
      scope: publicPath(''),
      updateViaCache: 'none',
    })
  } catch {
    // Private browsing, storage policy, or a failed download must not block the gift.
  }
}
