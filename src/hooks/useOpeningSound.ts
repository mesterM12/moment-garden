import { useCallback, useEffect, useRef, useState } from 'react'
import { createBloomSound } from '../lib/bloom-sound'

const preferenceKey = 'flowers-opening-sound'

function readPreference() {
  try { return localStorage.getItem(preferenceKey) !== 'off' }
  catch { return true }
}

export function useOpeningSound() {
  const [enabled, setEnabled] = useState(readPreference)
  const sound = useRef<ReturnType<typeof createBloomSound> | null>(null)

  useEffect(() => {
    const player = createBloomSound()
    sound.current = player
    const stop = () => { if (document.hidden) player.stop() }
    const onPageHide = () => player.stop()
    document.addEventListener('visibilitychange', stop)
    window.addEventListener('pagehide', onPageHide)
    return () => {
      document.removeEventListener('visibilitychange', stop)
      window.removeEventListener('pagehide', onPageHide)
      player.dispose()
      sound.current = null
    }
  }, [])

  const changeEnabled = useCallback((next: boolean) => {
    setEnabled(next)
    if (!next) sound.current?.stop()
    try { localStorage.setItem(preferenceKey, next ? 'on' : 'off') }
    catch { /* Storage may be disabled in private or restricted browsing. */ }
  }, [])

  const play = useCallback(() => {
    if (enabled && !document.hidden) sound.current?.play()
  }, [enabled])

  return { enabled, changeEnabled, play }
}
