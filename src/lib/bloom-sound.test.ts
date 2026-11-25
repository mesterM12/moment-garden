import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createBloomSound } from './bloom-sound'

class MockParam {
  setValueAtTime = vi.fn<(value: number, time: number) => void>()
  exponentialRampToValueAtTime = vi.fn<(value: number, time: number) => void>()
}

class MockOscillator {
  type: OscillatorType = 'sine'
  frequency = new MockParam()
  connect = vi.fn()
  disconnect = vi.fn()
  start = vi.fn()
  stop = vi.fn()
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
  oscillators: MockOscillator[] = []
  gains: MockGain[] = []
  resume = vi.fn(() => Promise.resolve())
  close = vi.fn(() => Promise.resolve())
  createOscillator = vi.fn(() => {
    const oscillator = new MockOscillator()
    this.oscillators.push(oscillator)
    return oscillator
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

describe('bloom opening sound', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    MockAudioContext.instances = []
    MockAudioContext.configure = () => {}
    vi.stubGlobal('AudioContext', MockAudioContext)
  })

  afterEach(() => {
    vi.clearAllTimers()
    vi.useRealTimers()
    vi.unstubAllGlobals()
  })

  it('plays a quiet sine chime with a soft attack and releases resources after it ends', async () => {
    const sound = createBloomSound()
    sound.play()
    const context = MockAudioContext.instances[0]!
    expect(context.resume).toHaveBeenCalledOnce()
    expect(context.oscillators).toHaveLength(0)
    await Promise.resolve()

    expect(context.oscillators).toHaveLength(3)
    expect(context.gains).toHaveLength(3)
    for (const [index, oscillator] of context.oscillators.entries()) {
      const gain = context.gains[index]!
      expect(oscillator.type).toBe('sine')
      expect(oscillator.connect).toHaveBeenCalledWith(gain)
      expect(gain.connect).toHaveBeenCalledWith(context.destination)
      expect(oscillator.start).toHaveBeenCalledWith(12)
      expect(oscillator.stop).toHaveBeenCalledWith(12.7)
      expect(gain.gain.setValueAtTime).toHaveBeenCalledWith(0.00001, 12)
      expect(gain.gain.exponentialRampToValueAtTime).toHaveBeenCalledWith(expect.any(Number), 12.025)
      const peak = gain.gain.exponentialRampToValueAtTime.mock.calls[0]![0]
      expect(peak).toBeGreaterThan(0)
      expect(peak).toBeLessThanOrEqual(0.035)
      expect(gain.gain.exponentialRampToValueAtTime).toHaveBeenCalledWith(0.00001, 12.68)
      expect(gain.gain.setValueAtTime).toHaveBeenCalledWith(0, 12.7)
    }
    expect(context.oscillators.map((oscillator) => oscillator.frequency.setValueAtTime.mock.calls[0]?.[0]))
      .toEqual([523.25, 1046.5, 1569.75])

    for (const oscillator of context.oscillators) oscillator.onended?.()
    expect(context.close).toHaveBeenCalledOnce()
    for (const node of [...context.oscillators, ...context.gains]) {
      expect(node.disconnect).toHaveBeenCalledOnce()
    }
    sound.dispose()
  })

  it('treats unsupported or throwing audio construction as a silent no-op', () => {
    const sound = createBloomSound()
    vi.stubGlobal('AudioContext', undefined)
    expect(() => sound.play()).not.toThrow()
    vi.stubGlobal('AudioContext', class {
      constructor() { throw new Error('Unavailable') }
    })
    expect(() => sound.play()).not.toThrow()
    expect(() => sound.dispose()).not.toThrow()
    expect(MockAudioContext.instances).toHaveLength(0)
  })

  it('cancels pending resumes on stop and still allows a later play', async () => {
    let resume: (() => void) | undefined
    MockAudioContext.configure = (context) => {
      context.resume.mockImplementation(() => new Promise<void>((resolve) => { resume = resolve }))
    }
    const sound = createBloomSound()
    sound.play()
    const first = MockAudioContext.instances[0]!
    expect(first.resume).toHaveBeenCalledOnce()
    sound.stop()
    expect(first.close).toHaveBeenCalledOnce()
    resume?.()
    await Promise.resolve()
    expect(first.oscillators).toHaveLength(0)

    MockAudioContext.configure = () => {}
    sound.play()
    await Promise.resolve()
    expect(MockAudioContext.instances[1]!.oscillators).toHaveLength(3)
    sound.dispose()
  })

  it('permanently cancels a pending resume on dispose', async () => {
    let resume: (() => void) | undefined
    MockAudioContext.configure = (context) => {
      context.resume.mockImplementation(() => new Promise<void>((resolve) => { resume = resolve }))
    }
    const sound = createBloomSound()
    sound.play()
    const context = MockAudioContext.instances[0]!
    sound.dispose()
    sound.dispose()
    resume?.()
    await Promise.resolve()
    sound.play()
    expect(context.oscillators).toHaveLength(0)
    expect(context.close).toHaveBeenCalledOnce()
    expect(MockAudioContext.instances).toHaveLength(1)
  })

  it.each(['throw', 'reject'] as const)('contains a resume %s and closes its context', async (failure) => {
    MockAudioContext.configure = (context) => {
      context.resume.mockImplementation(() => {
        if (failure === 'throw') throw new Error('Resume unavailable')
        return Promise.reject(new Error('Resume denied'))
      })
    }
    const sound = createBloomSound()
    expect(() => sound.play()).not.toThrow()
    await Promise.resolve()
    await Promise.resolve()
    const context = MockAudioContext.instances[0]!
    expect(context.oscillators).toHaveLength(0)
    expect(context.close).toHaveBeenCalledOnce()
    sound.dispose()
  })

  it('releases a context whose resume resolves without becoming running', async () => {
    MockAudioContext.configure = (context) => { context.state = 'suspended' }
    const sound = createBloomSound()
    sound.play()
    await Promise.resolve()
    const context = MockAudioContext.instances[0]!
    expect(context.oscillators).toHaveLength(0)
    expect(context.close).toHaveBeenCalledOnce()
    sound.dispose()
  })

  it('expires a pending resume instead of playing unexpectedly later', async () => {
    let resume: (() => void) | undefined
    MockAudioContext.configure = (context) => {
      context.resume.mockImplementation(() => new Promise<void>((resolve) => { resume = resolve }))
    }
    const sound = createBloomSound()
    sound.play()
    const context = MockAudioContext.instances[0]!
    vi.advanceTimersByTime(250)
    expect(context.close).toHaveBeenCalledOnce()
    resume?.()
    await Promise.resolve()
    expect(context.oscillators).toHaveLength(0)
    sound.dispose()
  })

  it('rejects a late resume even when its timeout callback has not run', async () => {
    let resume: (() => void) | undefined
    MockAudioContext.configure = (context) => {
      context.resume.mockImplementation(() => new Promise<void>((resolve) => { resume = resolve }))
    }
    const clock = vi.spyOn(performance, 'now')
    clock.mockReturnValue(0)
    const sound = createBloomSound()
    sound.play()
    clock.mockReturnValue(300)
    resume?.()
    await Promise.resolve()
    expect(MockAudioContext.instances[0]!.oscillators).toHaveLength(0)
    expect(MockAudioContext.instances[0]!.close).toHaveBeenCalledOnce()
    clock.mockRestore()
    sound.dispose()
  })

  it('does not start audio while hidden, including a resume that resolves after hiding', async () => {
    const page = { visibilityState: 'hidden' }
    vi.stubGlobal('document', page)
    const sound = createBloomSound()
    sound.play()
    expect(MockAudioContext.instances).toHaveLength(0)
    page.visibilityState = 'visible'
    sound.play()
    page.visibilityState = 'hidden'
    await Promise.resolve()
    expect(MockAudioContext.instances[0]!.oscillators).toHaveLength(0)
    expect(MockAudioContext.instances[0]!.close).toHaveBeenCalledOnce()
    sound.dispose()
  })

  it('replaces active playback and releases every set of resources', async () => {
    const sound = createBloomSound()
    sound.play()
    await Promise.resolve()
    const first = MockAudioContext.instances[0]!
    sound.play()
    expect(first.close).toHaveBeenCalledOnce()
    for (const node of [...first.oscillators, ...first.gains]) {
      expect(node.disconnect).toHaveBeenCalledOnce()
    }
    await Promise.resolve()
    const second = MockAudioContext.instances[1]!
    expect(second.oscillators).toHaveLength(3)
    vi.advanceTimersByTime(700)
    expect(second.close).toHaveBeenCalledOnce()
    for (const node of [...second.oscillators, ...second.gains]) {
      expect(node.disconnect).toHaveBeenCalledOnce()
    }
    for (const oscillator of second.oscillators) expect(oscillator.onended).toBeNull()
    sound.play()
    await Promise.resolve()
    const third = MockAudioContext.instances[2]!
    sound.stop()
    sound.stop()
    sound.dispose()
    expect(third.close).toHaveBeenCalledOnce()
    for (const oscillator of third.oscillators) {
      expect(oscillator.stop).toHaveBeenLastCalledWith()
      expect(oscillator.disconnect).toHaveBeenCalledOnce()
    }
  })

  it('does not let an older resume cancel a newer play', async () => {
    let resumeFirst: (() => void) | undefined
    MockAudioContext.configure = (context) => {
      context.resume.mockImplementation(() => new Promise<void>((resolve) => { resumeFirst = resolve }))
    }
    const sound = createBloomSound()
    sound.play()
    MockAudioContext.configure = () => {}
    sound.play()
    await Promise.resolve()
    resumeFirst?.()
    await Promise.resolve()
    expect(MockAudioContext.instances[0]!.oscillators).toHaveLength(0)
    expect(MockAudioContext.instances[1]!.oscillators).toHaveLength(3)
    expect(MockAudioContext.instances[1]!.close).not.toHaveBeenCalled()
    sound.dispose()
  })

  it.each(['create', 'start'] as const)('cleans up a partial sound when node %s fails', async (failure) => {
    MockAudioContext.configure = (context) => {
      if (failure === 'create') {
        context.createGain.mockImplementation(() => { throw new Error('No audio resources') })
      } else {
        context.createOscillator.mockImplementation(() => {
          const oscillator = new MockOscillator()
          context.oscillators.push(oscillator)
          oscillator.start.mockImplementation(() => { throw new Error('Start denied') })
          return oscillator
        })
      }
    }
    const sound = createBloomSound()
    expect(() => sound.play()).not.toThrow()
    await Promise.resolve()
    const context = MockAudioContext.instances[0]!
    expect(context.close).toHaveBeenCalledOnce()
    for (const node of [...context.oscillators, ...context.gains]) {
      expect(node.disconnect).toHaveBeenCalledOnce()
    }
    sound.dispose()
  })

  it.each(['throw', 'reject'] as const)('contains context close %s failures', async (failure) => {
    MockAudioContext.configure = (context) => {
      context.close.mockImplementation(() => {
        if (failure === 'throw') throw new Error('Close failed')
        return Promise.reject(new Error('Close failed'))
      })
    }
    const sound = createBloomSound()
    sound.play()
    await Promise.resolve()
    expect(() => sound.stop()).not.toThrow()
    await Promise.resolve()
    sound.play()
    await Promise.resolve()
    expect(MockAudioContext.instances).toHaveLength(2)
    expect(() => sound.dispose()).not.toThrow()
    await Promise.resolve()
  })

  it('does not create an audio context before an explicit play', () => {
    const sound = createBloomSound()
    expect(MockAudioContext.instances).toHaveLength(0)
    sound.stop()
    sound.dispose()
    sound.play()
    expect(MockAudioContext.instances).toHaveLength(0)
  })
})
