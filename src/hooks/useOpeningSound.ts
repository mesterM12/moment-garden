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
    if (readPreference()) player.prepare()
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
    else sound.current?.prepare()
    try { localStorage.setItem(preferenceKey, next ? 'on' : 'off') }
    catch { /* Storage may be disabled in private or restricted browsing. */ }
  }, [])

  const play = useCallback((mode: 'opening' | 'opening-and-bloom' | 'bloom') => {
    if (enabled && !document.hidden) sound.current?.play(mode)
  }, [enabled])
  const sync = useCallback((progress: number) => sound.current?.sync(progress), [])
  const stop = useCallback(() => sound.current?.stop(), [])

  return { enabled, changeEnabled, play, sync, stop }
}
