const START_BUDGET_MS = 240
const FETCH_TIMEOUT_MS = 4_000
const BLOOM_SECONDS = 4.6
const DRIFT_SECONDS = 0.12
const FADE_SECONDS = 0.008

type Mode = 'opening' | 'opening-and-bloom' | 'bloom'
type Part = 'opening' | 'bloom'

interface Asset {
  path: string
  bytes?: ArrayBuffer
  buffer?: AudioBuffer
  pending?: Promise<ArrayBuffer | undefined>
  cancel?: () => void
}

interface Voice {
  source: AudioBufferSourceNode
  gain: GainNode
  part: Part
  offset: number
  startedAt: number
  fadeIn: boolean
  timer?: ReturnType<typeof setTimeout>
  retired: boolean
}

interface Playback {
  context: AudioContext
  restoreAudioSession: () => void
  requestedAt: number
  resumed: boolean
  released: boolean
  accepting: boolean
  mode: Mode
  openingPending: boolean
  bloomPending: boolean
  openingBuffer?: AudioBuffer
  bloomBuffer?: AudioBuffer
  progress?: number
  bloomVoice?: Voice
  voices: Set<Voice>
  timer?: ReturnType<typeof setTimeout>
}

/** Asset-only audio. Creation/prefetch never unlock audio; play must run in a user gesture. */
export function createBloomSound(): {
  prepare(): void
  play(mode: Mode): void
  sync(progress: number): void
  stop(): void
  dispose(): void
} {
  const assets: Record<Part, Asset> = {
    opening: { path: 'audio/gift-open.wav' },
    bloom: { path: 'audio/bloom.wav' },
  }
  let disposed = false
  let active: Playback | undefined

  function hidden() {
    return typeof document !== 'undefined' && document.visibilityState === 'hidden'
  }

  function fetchAsset(asset: Asset): Promise<ArrayBuffer | undefined> {
    if (asset.bytes) return Promise.resolve(asset.bytes)
    if (asset.pending) return asset.pending
    if (disposed || typeof fetch === 'undefined') return Promise.resolve(undefined)
    const controller = new AbortController()
    let finish: (bytes?: ArrayBuffer) => void = () => {}
    const pending = new Promise<ArrayBuffer | undefined>((resolve) => { finish = resolve })
    asset.pending = pending
    let settled = false
    const settle = (bytes?: ArrayBuffer) => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      asset.pending = undefined
      asset.cancel = undefined
      if (bytes && !disposed) asset.bytes = bytes
      finish(bytes)
    }
    const cancel = () => {
      controller.abort()
      settle()
    }
    const timer = setTimeout(cancel, FETCH_TIMEOUT_MS)
    asset.cancel = cancel
    try {
      const documentURL = typeof document !== 'undefined' ? document.baseURI : undefined
      const fallback = typeof location !== 'undefined' ? location.href : 'http://localhost/'
      const base = `${process.env.NEXT_PUBLIC_BASE_PATH || ''}/`
      const url = new URL(asset.path, new URL(base.endsWith('/') ? base : `${base}/`, documentURL || fallback))
      void fetch(url.href, { signal: controller.signal }).then(async (response) => {
        if (!response.ok) { settle(); return }
        settle(await response.arrayBuffer())
      }).catch(() => settle())
    } catch {
      settle()
    }
    return pending
  }

  function enterPlaybackSession() {
    const navigatorWithAudio = typeof navigator === 'undefined' ? undefined : navigator as Navigator & {
      audioSession?: { type: string }
    }
    try {
      const session = navigatorWithAudio?.audioSession
      if (session && session.type !== 'playback') {
        const previous = session.type
        // Safari's default Web Audio session can be silenced by the iPhone ringer setting.
        session.type = 'playback'
        return () => {
          try { if (session.type === 'playback') session.type = previous } catch { /* Session already gone. */ }
        }
      }
    } catch { /* Audio Session is optional; Web Audio can still run. */ }
    return () => {}
  }

  function close(context: AudioContext) {
    try { void context.close().catch(() => {}) } catch { /* Unsupported/already closed. */ }
  }

  function removeVoice(playback: Playback, voice: Voice) {
    if (!playback.voices.delete(voice)) return
    clearTimeout(voice.timer)
    voice.source.onended = null
    try { voice.source.stop() } catch { /* Already ended or not started. */ }
    try { voice.source.disconnect() } catch { /* Best effort. */ }
    try { voice.gain.disconnect() } catch { /* Best effort. */ }
    if (playback.bloomVoice === voice) playback.bloomVoice = undefined
  }

  function release(playback: Playback) {
    if (playback.released) return
    playback.released = true
    if (active === playback) active = undefined
    clearTimeout(playback.timer)
    for (const voice of playback.voices) removeVoice(playback, voice)
    close(playback.context)
    playback.restoreAudioSession()
  }

  function finishIfIdle(playback: Playback) {
    if (!playback.openingPending && !playback.bloomPending && playback.voices.size === 0) release(playback)
  }

  function valid(playback: Playback) {
    if (playback.released || active !== playback) return false
    if (disposed || hidden()) { release(playback); return false }
    return true
  }

  function retire(playback: Playback, voice: Voice) {
    if (voice.retired) return
    voice.retired = true
    if (playback.bloomVoice === voice) playback.bloomVoice = undefined
    try {
      const now = playback.context.currentTime
      voice.gain.gain.cancelScheduledValues(now)
      // A second seek (or export) can interrupt the first 8ms ramp.
      const level = voice.fadeIn ? Math.min(1, Math.max(0, (now - voice.startedAt) / FADE_SECONDS)) : 1
      voice.gain.gain.setValueAtTime(level, now)
      voice.gain.gain.linearRampToValueAtTime(0, now + FADE_SECONDS)
      voice.source.stop(now + FADE_SECONDS)
      clearTimeout(voice.timer)
      // A wall-clock fallback also cleans up a context that stopped advancing.
      voice.timer = setTimeout(() => {
        removeVoice(playback, voice)
        finishIfIdle(playback)
      }, FADE_SECONDS * 1000 + 20)
    } catch {
      removeVoice(playback, voice)
      finishIfIdle(playback)
    }
  }

  function startVoice(playback: Playback, part: Part, buffer: AudioBuffer, offset: number, fade = offset > 0) {
    if (!valid(playback)) return
    let source: AudioBufferSourceNode | undefined
    let gain: GainNode | undefined
    let registered = false
    try {
      source = playback.context.createBufferSource()
      gain = playback.context.createGain()
      const now = playback.context.currentTime
      source.buffer = buffer
      source.connect(gain)
      gain.connect(playback.context.destination)
      gain.gain.setValueAtTime(fade ? 0 : 1, now)
      if (fade) gain.gain.linearRampToValueAtTime(1, now + FADE_SECONDS)
      const voice: Voice = { source, gain, part, offset, startedAt: now, fadeIn: fade, retired: false }
      playback.voices.add(voice)
      registered = true
      if (part === 'bloom') playback.bloomVoice = voice
      source.onended = () => {
        removeVoice(playback, voice)
        finishIfIdle(playback)
      }
      source.start(now, offset)
      voice.timer = setTimeout(() => {
        removeVoice(playback, voice)
        finishIfIdle(playback)
      }, (buffer.duration - offset) * 1000 + 100)
    } catch {
      // Registered voices are released below; also cover partial node construction.
      if (!registered) {
        try { source?.disconnect() } catch { /* Best effort. */ }
        try { gain?.disconnect() } catch { /* Best effort. */ }
      }
      release(playback)
    }
  }

  function expire(playback: Playback) {
    playback.accepting = false
    playback.openingPending = false
    playback.bloomPending = false
    clearTimeout(playback.timer)
    finishIfIdle(playback)
  }

  function attempt(playback: Playback) {
    if (!valid(playback)) return
    if (!playback.accepting || performance.now() - playback.requestedAt >= START_BUDGET_MS) {
      expire(playback)
      return
    }
    if (!playback.resumed) return
    if (playback.context.state !== 'running') { release(playback); return }
    if (playback.openingPending && playback.openingBuffer) {
      playback.openingPending = false
      // A late paper decode must not slide the tissue release over the first
      // pluck. Instant opening has no running clock and keeps the whole cue.
      const progress = playback.progress ?? 0
      const offset = playback.mode === 'opening-and-bloom' && progress < 1 ? progress * BLOOM_SECONDS : 0
      if (offset < playback.openingBuffer.duration) startVoice(playback, 'opening', playback.openingBuffer, offset)
    }
    if (!valid(playback)) return
    if (playback.bloomPending && playback.bloomBuffer && playback.progress !== undefined) {
      playback.bloomPending = false
      const offset = playback.progress * BLOOM_SECONDS
      if (offset < playback.bloomBuffer.duration && playback.progress < 1) {
        startVoice(playback, 'bloom', playback.bloomBuffer, offset)
      }
    }
    finishIfIdle(playback)
  }

  async function load(playback: Playback, part: Part) {
    const asset = assets[part]
    try {
      let buffer = asset.buffer
      if (!buffer) {
        const bytes = await fetchAsset(asset)
        if (!valid(playback) || !playback.accepting) return
        if (!bytes) throw new Error('Audio asset unavailable')
        // decodeAudioData may detach its input. Preserve the prefetched bytes for retries.
        buffer = await playback.context.decodeAudioData(bytes.slice(0))
        if (!disposed) asset.buffer = buffer
      }
      if (!valid(playback)) return
      if (part === 'opening') playback.openingBuffer = buffer
      else playback.bloomBuffer = buffer
      attempt(playback)
    } catch {
      if (!valid(playback)) return
      if (part === 'opening') playback.openingPending = false
      else playback.bloomPending = false
      finishIfIdle(playback)
    }
  }

  function stop() {
    if (active) release(active)
    for (const asset of Object.values(assets)) asset.cancel?.()
  }

  return {
    prepare() {
      if (disposed) return
      for (const asset of Object.values(assets)) void fetchAsset(asset)
    },
    play(mode) {
      if (active) release(active)
      if (disposed || hidden() || typeof AudioContext === 'undefined') return
      const restoreAudioSession = enterPlaybackSession()
      let context: AudioContext
      try { context = new AudioContext() } catch { restoreAudioSession(); return }
      const playback: Playback = {
        mode, context, restoreAudioSession, requestedAt: performance.now(), resumed: false, released: false, accepting: true,
        openingPending: mode !== 'bloom', bloomPending: mode !== 'opening', voices: new Set(),
      }
      active = playback
      playback.timer = setTimeout(() => expire(playback), START_BUDGET_MS)
      try {
        // This call must remain synchronous inside the explicit user activation.
        const resumed = context.resume()
        void resumed.then(() => {
          if (!valid(playback)) return
          playback.resumed = true
          attempt(playback)
        }).catch(() => release(playback))
      } catch { release(playback); return }
      if (playback.openingPending) void load(playback, 'opening')
      if (playback.bloomPending) void load(playback, 'bloom')
    },
    sync(progress) {
      const playback = active
      if (!playback || !valid(playback) || !Number.isFinite(progress)) return
      if (playback.resumed && playback.context.state !== 'running') { release(playback); return }
      playback.progress = Math.max(0, Math.min(1, progress))
      const offset = playback.progress * BLOOM_SECONDS
      if (playback.progress === 1 || (playback.bloomBuffer && offset >= playback.bloomBuffer.duration)) {
        playback.bloomPending = false
        if (playback.bloomVoice) retire(playback, playback.bloomVoice)
        // In particular, instant keyboard opening must not truncate the opening cue.
        finishIfIdle(playback)
        return
      }
      const voice = playback.bloomVoice
      if (voice && playback.bloomBuffer) {
        const audibleOffset = voice.offset + playback.context.currentTime - voice.startedAt
        if (Math.abs(offset - audibleOffset) > DRIFT_SECONDS) {
          // Register the replacement first so retiring the old voice cannot close the context.
          startVoice(playback, 'bloom', playback.bloomBuffer, offset, true)
          retire(playback, voice)
        }
      } else {
        attempt(playback)
      }
    },
    stop,
    dispose() {
      disposed = true
      stop()
      for (const asset of Object.values(assets)) {
        asset.bytes = undefined
        asset.buffer = undefined
      }
    },
  }
}
