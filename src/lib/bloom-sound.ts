const DURATION_SECONDS = 0.7
const RESUME_TIMEOUT_MS = 250
const FLOOR = 0.00001
const HARMONICS = [[523.25, 0.035], [1046.5, 0.012], [1569.75, 0.005]] as const

interface Playback {
  context: AudioContext
  oscillators: OscillatorNode[]
  gains: GainNode[]
  timer: ReturnType<typeof setTimeout> | undefined
  released: boolean
}

/** Silent until play() is called directly from a user gesture. Each play replaces the last. */
export function createBloomSound(): { play(): void; stop(): void; dispose(): void } {
  let disposed = false
  let active: Playback | undefined

  function release(playback: Playback) {
    if (playback.released) return
    playback.released = true
    if (active === playback) active = undefined
    clearTimeout(playback.timer)
    for (const oscillator of playback.oscillators) {
      oscillator.onended = null
      try { oscillator.stop() } catch { /* Already stopped or never started. */ }
      try { oscillator.disconnect() } catch { /* Best-effort cleanup. */ }
    }
    for (const gain of playback.gains) {
      try { gain.disconnect() } catch { /* Best-effort cleanup. */ }
    }
    try {
      void playback.context.close().catch(() => {})
    } catch { /* Audio may be unavailable or already closed. */ }
  }

  function stop() {
    if (active) release(active)
  }

  function hidden() {
    return typeof document !== 'undefined' && document.visibilityState === 'hidden'
  }

  return {
    play() {
      stop()
      if (disposed || hidden() || typeof AudioContext === 'undefined') return
      let context: AudioContext
      try {
        context = new AudioContext()
      } catch {
        return
      }
      const playback: Playback = { context, oscillators: [], gains: [], timer: undefined, released: false }
      active = playback
      // Never let a suspended context wait indefinitely, then surprise the listener.
      const requestedAt = performance.now()
      playback.timer = setTimeout(() => release(playback), RESUME_TIMEOUT_MS)
      try {
        // Invoke resume synchronously inside the caller's user activation, not in an effect/microtask.
        const resumed = context.resume()
        void resumed.then(() => {
          if (playback.released) return
          if (disposed || hidden() || context.state !== 'running' || performance.now() - requestedAt >= RESUME_TIMEOUT_MS) {
            release(playback)
            return
          }
          clearTimeout(playback.timer)
          try {
            const start = context.currentTime
            let ended = 0
            for (const [frequency, peak] of HARMONICS) {
              const oscillator = context.createOscillator()
              playback.oscillators.push(oscillator)
              const gain = context.createGain()
              playback.gains.push(gain)
              oscillator.type = 'sine'
              oscillator.frequency.setValueAtTime(frequency, start)
              gain.gain.setValueAtTime(FLOOR, start)
              gain.gain.exponentialRampToValueAtTime(peak, start + 0.025)
              gain.gain.exponentialRampToValueAtTime(FLOOR, start + 0.68)
              gain.gain.setValueAtTime(0, start + DURATION_SECONDS)
              oscillator.connect(gain)
              gain.connect(context.destination)
              oscillator.onended = () => {
                ended += 1
                if (ended === HARMONICS.length) release(playback)
              }
              oscillator.start(start)
              oscillator.stop(start + DURATION_SECONDS)
            }
            // Covers interrupted contexts or browsers that fail to deliver ended events.
            playback.timer = setTimeout(() => release(playback), DURATION_SECONDS * 1000)
          } catch {
            release(playback)
          }
        }).catch(() => release(playback))
      } catch {
        release(playback)
      }
    },
    stop,
    dispose() {
      disposed = true
      stop()
    },
  }
}
