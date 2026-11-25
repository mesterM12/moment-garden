import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createBloomSound } from './bloom-sound'

function deferred<T>() {
  let resolve: (value: T) => void = () => {}
  let reject: (reason: Error) => void = () => {}
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no })
  return { promise, resolve, reject }
}

function audioBuffer(duration: number): AudioBuffer {
  return { duration } as AudioBuffer
}

class MockParam {
  setValueAtTime = vi.fn<(value: number, time: number) => void>()
  linearRampToValueAtTime = vi.fn<(value: number, time: number) => void>()
  cancelScheduledValues = vi.fn<(time: number) => void>()
}

class MockSource {
  buffer: AudioBuffer | null = null
  connect = vi.fn()
  disconnect = vi.fn()
  start = vi.fn<(when: number, offset: number) => void>()
  stop = vi.fn<(when?: number) => void>()
  onended: (() => void) | null = null
}

class MockGain {
  gain = new MockParam()
  connect = vi.fn()
  disconnect = vi.fn()
}

class MockAudioContext {
  static instances: MockAudioContext[] = []
  static configure: (context: MockAudioContext) => void = () => {}
  currentTime = 12
  state: AudioContextState = 'running'
  destination = {}
  sources: MockSource[] = []
  gains: MockGain[] = []
  resume = vi.fn(() => Promise.resolve())
  close = vi.fn(() => Promise.resolve())
  decodeAudioData = vi.fn((bytes: ArrayBuffer) => Promise.resolve(audioBuffer(new Uint8Array(bytes)[0] === 1 ? 0.28 : 3.8)))
  createBufferSource = vi.fn(() => {
    const source = new MockSource()
    this.sources.push(source)
    return source
  })
  createGain = vi.fn(() => {
    const gain = new MockGain()
    this.gains.push(gain)
    return gain
  })

  constructor() {
    MockAudioContext.instances.push(this)
    MockAudioContext.configure(this)
  }
}

const fetched: ArrayBuffer[] = []
const fetchMock = vi.fn<(url: string, init: RequestInit) => Promise<Response>>()

async function flush() {
  // Fetch, response bytes, decode and resume intentionally form independent promise chains.
  for (let i = 0; i < 12; i += 1) await Promise.resolve()
}

function context(index = 0) {
  return MockAudioContext.instances[index]!
}

describe('asset bloom sound controller', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    MockAudioContext.instances = []
    MockAudioContext.configure = () => {}
    fetched.length = 0
    fetchMock.mockReset()
    fetchMock.mockImplementation(async (url) => {
      const bytes = new Uint8Array([url.endsWith('gift-open.wav') ? 1 : 2]).buffer
      fetched.push(bytes)
      return { ok: true, arrayBuffer: async () => bytes } as Response
    })
    vi.stubGlobal('fetch', fetchMock)
    vi.stubGlobal('AudioContext', MockAudioContext)
  })

  afterEach(() => {
    vi.restoreAllMocks()
    vi.clearAllTimers()
    vi.useRealTimers()
    vi.unstubAllGlobals()
    vi.unstubAllEnvs()
  })

  it('prefetches bytes without autoplay/context/decode and resolves the app base', async () => {
    const sound = createBloomSound()
    sound.prepare()
    sound.prepare()
    expect(MockAudioContext.instances).toHaveLength(0)
    await flush()
    expect(fetchMock.mock.calls.map(([url]) => url)).toEqual([
      'http://localhost/audio/gift-open.wav', 'http://localhost/audio/bloom.wav',
    ])
    sound.dispose()
    sound.prepare()
    sound.play('opening')
    expect(MockAudioContext.instances).toHaveLength(0)
    expect(vi.getTimerCount()).toBe(0)
  })

  it('preserves a non-root deployment base and document origin', async () => {
    vi.stubEnv('NEXT_PUBLIC_BASE_PATH', '/moment-garden')
    vi.stubGlobal('document', { baseURI: 'https://flowers.example/moment-garden/?seed=7', visibilityState: 'visible' })
    const sound = createBloomSound()
    sound.prepare()
    await flush()
    expect(fetchMock.mock.calls[0]?.[0]).toBe('https://flowers.example/moment-garden/audio/gift-open.wav')
    sound.dispose()
    vi.unstubAllEnvs()
  })

  it('resumes synchronously on activation, decodes copies, caches buffers across contexts', async () => {
    const sound = createBloomSound()
    sound.prepare()
    await flush()
    sound.play('opening')
    expect(context().resume).toHaveBeenCalledOnce()
    expect(context().sources).toHaveLength(0)
    await flush()
    expect(context().decodeAudioData).toHaveBeenCalledOnce()
    const decodedBytes = context().decodeAudioData.mock.calls[0]![0]
    expect(fetched).not.toContain(decodedBytes)
    expect(new Uint8Array(decodedBytes)).toEqual(new Uint8Array(fetched[0]!))
    expect(context().sources[0]!.start).toHaveBeenCalledWith(12, 0)
    context().sources[0]!.onended?.()
    expect(context().close).toHaveBeenCalledOnce()
    expect(vi.getTimerCount()).toBe(0)
    sound.play('opening')
    await flush()
    expect(context(1).decodeAudioData).not.toHaveBeenCalled()
    expect(context(1).sources[0]!.buffer).toBe(context().sources[0]!.buffer)
    expect(fetchMock).toHaveBeenCalledTimes(2)
    sound.dispose()
    expect(context(1).close).toHaveBeenCalledOnce()
    expect(vi.getTimerCount()).toBe(0)
  })

  it('sets Safari playback audio only on activation and restores the previous session', async () => {
    const audioSession = { type: 'auto' }
    vi.stubGlobal('navigator', { audioSession })
    MockAudioContext.configure = (audio) => {
      audio.resume.mockImplementation(() => audioSession.type === 'playback'
        ? Promise.resolve()
        : Promise.reject(new Error('Playback session not selected')))
    }
    const sound = createBloomSound()
    sound.prepare()
    await flush()
    expect(audioSession.type).toBe('auto')
    sound.play('opening')
    await flush()
    expect(context().sources).toHaveLength(1)
    expect(context().sources[0]!.start).toHaveBeenCalledWith(12, 0)
    expect(audioSession.type).toBe('playback')
    context().sources[0]!.onended?.()
    expect(audioSession.type).toBe('auto')
    sound.play('bloom')
    expect(audioSession.type).toBe('playback')
    sound.dispose()
    expect(audioSession.type).toBe('auto')
  })

  it('waits for first geometry sync and seeks to live progress when decoding finishes', async () => {
    const decode = deferred<AudioBuffer>()
    MockAudioContext.configure = (audio) => { audio.decodeAudioData.mockReturnValue(decode.promise) }
    const sound = createBloomSound()
    sound.play('bloom')
    sound.sync(0)
    await flush()
    sound.sync(0.25)
    decode.resolve(audioBuffer(3.8))
    await flush()
    expect(context().sources[0]!.start).toHaveBeenCalledWith(12, 1.15)
    sound.dispose()

    MockAudioContext.configure = () => {}
    const next = createBloomSound()
    next.play('bloom')
    await flush()
    expect(context(1).sources).toHaveLength(0)
    next.sync(0.5)
    expect(context(1).sources[0]!.start).toHaveBeenCalledWith(12, 2.3)
    next.dispose()
  })

  it('uses the latest progress at resume, not activation, and does not restart every frame', async () => {
    const resume = deferred<void>()
    MockAudioContext.configure = (audio) => { audio.resume.mockReturnValue(resume.promise) }
    const sound = createBloomSound()
    sound.play('bloom')
    sound.sync(0)
    await flush()
    sound.sync(0.2)
    resume.resolve()
    await flush()
    expect(context().sources[0]!.start).toHaveBeenCalledWith(12, 0.9199999999999999)
    context().currentTime = 12.046
    sound.sync(0.21)
    expect(context().sources).toHaveLength(1)
    sound.dispose()
  })

  it('crossfades/reseeks drift and cancels bloom at completion without cancelling the opening cue', async () => {
    const sound = createBloomSound()
    sound.play('opening-and-bloom')
    sound.sync(0)
    await flush()
    const opening = context().sources.find((source) => source.buffer?.duration === 0.28)!
    const bloom = context().sources.find((source) => source.buffer?.duration === 3.8)!
    sound.sync(0.4)
    expect(context().sources).toHaveLength(3)
    const replacement = context().sources[2]!
    expect(replacement.start).toHaveBeenCalledWith(12, 1.8399999999999999)
    expect(bloom.stop).toHaveBeenCalledWith(12.008)
    expect(context().gains[2]!.gain.linearRampToValueAtTime).toHaveBeenCalledWith(1, 12.008)
    sound.sync(1)
    expect(replacement.stop).toHaveBeenCalledWith(12.008)
    expect(opening.stop).not.toHaveBeenCalled()
    vi.advanceTimersByTime(29)
    expect(context().close).not.toHaveBeenCalled()
    opening.onended?.()
    expect(context().close).toHaveBeenCalledOnce()
    expect(vi.getTimerCount()).toBe(0)
    sound.dispose()
  })

  it.each(['opening', 'opening-and-bloom'] as const)('preserves instant keyboard opening in %s', async (mode) => {
    const sound = createBloomSound()
    sound.play(mode)
    sound.sync(1)
    await flush()
    expect(context().sources).toHaveLength(1)
    expect(context().sources[0]!.buffer?.duration).toBe(0.28)
    sound.dispose()
  })

  it('skips bloom if progress has passed its asset end or is complete before decoding', async () => {
    const sound = createBloomSound()
    sound.play('bloom')
    sound.sync(0.9)
    await flush()
    expect(context().sources).toHaveLength(0)
    expect(context().close).toHaveBeenCalledOnce()
    sound.play('bloom')
    sound.sync(1)
    await flush()
    expect(context(1).sources).toHaveLength(0)
    expect(context(1).close).toHaveBeenCalledOnce()
    sound.dispose()
  })

  it('does not restart naturally finished bloom while another cue is still active', async () => {
    const sound = createBloomSound()
    sound.play('opening-and-bloom')
    sound.sync(0)
    await flush()
    const bloom = context().sources.find((source) => source.buffer?.duration === 3.8)!
    bloom.onended?.()
    sound.sync(0.1)
    expect(context().sources).toHaveLength(2)
    sound.dispose()
  })

  it('expires a bloom with no first sync, rather than holding an unlocked context indefinitely', async () => {
    const sound = createBloomSound()
    sound.play('bloom')
    await flush()
    vi.advanceTimersByTime(240)
    sound.sync(0)
    expect(context().sources).toHaveLength(0)
    expect(context().close).toHaveBeenCalledOnce()
    expect(vi.getTimerCount()).toBe(0)
    sound.dispose()
  })

  it('releases a newly suspended context on geometry sync instead of starting stale notes', async () => {
    const sound = createBloomSound()
    sound.play('bloom')
    sound.sync(0)
    await flush()
    context().state = 'suspended'
    sound.sync(0.4)
    expect(context().sources).toHaveLength(1)
    expect(context().close).toHaveBeenCalledOnce()
    expect(vi.getTimerCount()).toBe(0)
    sound.dispose()
  })

  it('cleans up natural completion and stalled contexts with bounded wall-clock timers', async () => {
    const sound = createBloomSound()
    sound.play('bloom')
    sound.sync(0)
    await flush()
    vi.advanceTimersByTime(3_901)
    expect(context().close).toHaveBeenCalledOnce()
    expect(context().sources[0]!.onended).toBeNull()
    expect(context().sources[0]!.disconnect).toHaveBeenCalledOnce()
    expect(context().gains[0]!.disconnect).toHaveBeenCalledOnce()
    expect(vi.getTimerCount()).toBe(0)
    sound.dispose()
  })

  it.each(['resume', 'decode', 'fetch'] as const)('never plays a late %s completion', async (stage) => {
    const resume = deferred<void>()
    const decode = deferred<AudioBuffer>()
    const response = deferred<Response>()
    if (stage === 'fetch') fetchMock.mockReturnValue(response.promise)
    MockAudioContext.configure = (audio) => {
      if (stage === 'resume') audio.resume.mockReturnValue(resume.promise)
      if (stage === 'decode') audio.decodeAudioData.mockReturnValue(decode.promise)
    }
    const sound = createBloomSound()
    sound.play('opening')
    await flush()
    vi.advanceTimersByTime(240)
    expect(context().close).toHaveBeenCalledOnce()
    resume.resolve()
    decode.resolve(audioBuffer(0.28))
    response.resolve({ ok: true, arrayBuffer: async () => new ArrayBuffer(1) } as Response)
    await flush()
    expect(context().sources).toHaveLength(0)
    sound.dispose()
    expect(vi.getTimerCount()).toBe(0)
  })

  it('rejects late work even if the timeout callback has not run', async () => {
    const resume = deferred<void>()
    MockAudioContext.configure = (audio) => { audio.resume.mockReturnValue(resume.promise) }
    const clock = vi.spyOn(performance, 'now').mockReturnValue(0)
    const sound = createBloomSound()
    sound.play('opening')
    await flush()
    clock.mockReturnValue(300)
    resume.resolve()
    await flush()
    expect(context().sources).toHaveLength(0)
    expect(context().close).toHaveBeenCalledOnce()
    sound.dispose()
  })

  it('bounds and aborts prefetch even when fetch ignores AbortSignal, then retries explicitly', async () => {
    fetchMock.mockReturnValueOnce(new Promise<Response>(() => {}))
    const sound = createBloomSound()
    sound.prepare()
    const signal = fetchMock.mock.calls[0]![1].signal!
    await flush()
    vi.advanceTimersByTime(4_000)
    expect(signal.aborted).toBe(true)
    expect(vi.getTimerCount()).toBe(0)
    sound.play('opening')
    await flush()
    expect(context().sources).toHaveLength(1)
    expect(fetchMock).toHaveBeenCalledTimes(3)
    sound.dispose()
  })

  it.each(['stop', 'dispose', 'replace'] as const)('guards pending callbacks after %s', async (action) => {
    const decode = deferred<AudioBuffer>()
    MockAudioContext.configure = (audio) => { audio.decodeAudioData.mockReturnValue(decode.promise) }
    const sound = createBloomSound()
    sound.play('opening')
    await flush()
    if (action === 'stop') sound.stop()
    else if (action === 'dispose') sound.dispose()
    else {
      MockAudioContext.configure = () => {}
      sound.play('opening')
    }
    decode.resolve(audioBuffer(0.28))
    await flush()
    expect(context().close).toHaveBeenCalledOnce()
    expect(context().sources).toHaveLength(0)
    if (action === 'replace') {
      expect(context(1).sources).toHaveLength(1)
      expect(context(1).close).not.toHaveBeenCalled()
    }
    sound.dispose()
    expect(vi.getTimerCount()).toBe(0)
  })

  it('suppresses hidden starts and completions', async () => {
    const page = { visibilityState: 'hidden', baseURI: 'https://example.test/' }
    vi.stubGlobal('document', page)
    const sound = createBloomSound()
    sound.play('opening')
    expect(MockAudioContext.instances).toHaveLength(0)
    page.visibilityState = 'visible'
    sound.play('opening')
    page.visibilityState = 'hidden'
    await flush()
    expect(context().sources).toHaveLength(0)
    expect(context().close).toHaveBeenCalledOnce()
    sound.dispose()
  })

  it.each(['throw', 'reject', 'suspended'] as const)('contains resume %s and releases resources', async (failure) => {
    MockAudioContext.configure = (audio) => {
      if (failure === 'suspended') audio.state = 'suspended'
      else audio.resume.mockImplementation(() => {
        if (failure === 'throw') throw new Error('No resume')
        return Promise.reject(new Error('No resume'))
      })
    }
    const sound = createBloomSound()
    expect(() => sound.play('opening')).not.toThrow()
    await flush()
    expect(context().sources).toHaveLength(0)
    expect(context().close).toHaveBeenCalledOnce()
    sound.dispose()
    expect(vi.getTimerCount()).toBe(0)
  })

  it.each(['http', 'fetch', 'decode'] as const)('contains %s failures and permits the next activation to retry', async (failure) => {
    if (failure === 'http') fetchMock.mockResolvedValueOnce({ ok: false } as Response)
    if (failure === 'fetch') fetchMock.mockRejectedValueOnce(new Error('Offline'))
    if (failure === 'decode') MockAudioContext.configure = (audio) => {
      audio.decodeAudioData.mockRejectedValueOnce(new Error('Invalid audio'))
    }
    const sound = createBloomSound()
    sound.play('opening')
    await flush()
    expect(context().sources).toHaveLength(0)
    expect(context().close).toHaveBeenCalledOnce()
    MockAudioContext.configure = () => {}
    sound.play('opening')
    await flush()
    expect(context(1).sources).toHaveLength(1)
    sound.dispose()
  })

  it.each(['create', 'start'] as const)('releases partial resources when node %s fails', async (failure) => {
    MockAudioContext.configure = (audio) => {
      if (failure === 'create') audio.createGain.mockImplementation(() => { throw new Error('No nodes') })
      else audio.createBufferSource.mockImplementation(() => {
        const source = new MockSource()
        source.start.mockImplementation(() => { throw new Error('No start') })
        audio.sources.push(source)
        return source
      })
    }
    const sound = createBloomSound()
    sound.play('opening')
    await flush()
    expect(context().close).toHaveBeenCalledOnce()
    expect(context().sources[0]!.disconnect).toHaveBeenCalled()
    sound.dispose()
    expect(vi.getTimerCount()).toBe(0)
  })

  it('treats unsupported construction and throwing/rejecting close as silent no-ops', async () => {
    const sound = createBloomSound()
    vi.stubGlobal('AudioContext', undefined)
    expect(() => sound.play('opening')).not.toThrow()
    vi.stubGlobal('AudioContext', class { constructor() { throw new Error('No audio') } })
    expect(() => sound.play('opening')).not.toThrow()
    vi.stubGlobal('AudioContext', MockAudioContext)
    MockAudioContext.configure = (audio) => { audio.close.mockRejectedValue(new Error('Already closed')) }
    sound.play('opening')
    await flush()
    expect(() => sound.stop()).not.toThrow()
    await flush()
    MockAudioContext.configure = (audio) => { audio.close.mockImplementation(() => { throw new Error('Closed') }) }
    sound.play('opening')
    await flush()
    expect(() => sound.dispose()).not.toThrow()
    expect(vi.getTimerCount()).toBe(0)
  })
})
