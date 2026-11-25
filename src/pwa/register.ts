export async function registerOfflineApp() {
  if (!import.meta.env.PROD || !window.isSecureContext || !('serviceWorker' in navigator)) return
  try {
    const base = new URL(import.meta.env.BASE_URL, document.baseURI)
    await navigator.serviceWorker.register(new URL('sw.js', base), {
      scope: base.pathname,
      updateViaCache: 'none',
    })
  } catch {
    // Private browsing, storage policy, or a failed download must not block the gift.
  }
}
