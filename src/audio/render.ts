/** Original, offline sound synthesis. No browser, files, or bouquet RNG involved. */
export const SAMPLE_RATE = 44_100
export const SOUND_DURATIONS = { 'gift-open': 0.28, bloom: 3.8 } as const
export type SoundName = keyof typeof SOUND_DURATIONS

const TAU = Math.PI * 2

function noiseSource(seed: number): () => number {
  let state = seed >>> 0
  return () => {
    state ^= state << 13
    state ^= state >>> 17
    state ^= state << 5
    return (state >>> 0) / 0x8000_0000 - 1
  }
}

function lowPass(cutoff: number): (input: number) => number {
  const coefficient = 1 - Math.exp(-TAU * cutoff / SAMPLE_RATE)
  let previous = 0
  return (input) => {
    previous += coefficient * (input - previous)
    return previous
  }
}

function smoothStep(value: number): number {
  const bounded = Math.max(0, Math.min(1, value))
  return bounded * bounded * (3 - 2 * bounded)
}

function bump(time: number, center: number, width: number): number {
  return Math.exp(-0.5 * ((time - center) / width) ** 2)
}

/** Remove DC, then taper both ends; no limiter, compression, or normalization. */
function finish(samples: Float64Array, attack: number, release: number): Float64Array {
  let total = 0
  for (const sample of samples) total += sample
  const mean = total / samples.length
  const end = (samples.length - 1) / SAMPLE_RATE
  for (let index = 0; index < samples.length; index++) {
    const time = index / SAMPLE_RATE
    samples[index] = (samples[index]! - mean)
      * smoothStep(time / attack)
      * smoothStep((end - time) / release)
  }
  return samples
}

/** Short, irregular paper slip with a tiny muted contact, not a tear or whoosh. */
export function renderGiftOpen(): Float64Array {
  const samples = new Float64Array(Math.round(SOUND_DURATIONS['gift-open'] * SAMPLE_RATE))
  const noise = noiseSource(0x70617072)
  const paperLow = lowPass(1_450)
  const paperSoft = lowPass(1_900)
  const paperBody = lowPass(240)
  const irregularity = lowPass(43)
  const feltLow = lowPass(740)
  const feltBody = lowPass(190)
  for (let index = 0; index < samples.length; index++) {
    const time = index / SAMPLE_RATE
    const random = noise()
    const paper = paperSoft(paperLow(random))
    const texture = paper - paperBody(paper)
    const uneven = 0.78 + 0.22 * Math.tanh(irregularity(noise()) * 5)
    // Overlapping, unequal contacts rather than a continuous noise sweep.
    const contact = 0.78 * bump(time, 0.047, 0.016)
      + bump(time, 0.103, 0.026)
      + 0.48 * bump(time, 0.164, 0.019)
      + 0.18 * bump(time, 0.211, 0.018)
    const felt = feltLow(random)
    const feltTexture = felt - feltBody(felt)
    const age = Math.max(0, time - 0.019)
    const touchEnvelope = time < 0.019 ? 0 : smoothStep(age / 0.008) * Math.exp(-age / 0.024)
    const touch = (0.025 * Math.sin(TAU * 330 * age) + 0.055 * feltTexture) * touchEnvelope
    samples[index] = 0.34 * texture * contact * uneven + touch
  }
  return finish(samples, 0.012, 0.044)
}

/** Breath and three soft resonances, leaving the last 0.8s of geometry silent. */
export function renderBloom(): Float64Array {
  const samples = new Float64Array(Math.round(SOUND_DURATIONS.bloom * SAMPLE_RATE))
  const noise = noiseSource(0x626c6f6d)
  const airLow = lowPass(1_180)
  const airSoft = lowPass(1_550)
  const airBody = lowPass(280)
  const movement = lowPass(6)
  const touches = [
    { start: 0.65, frequency: 349.23, gain: 0.027 },
    { start: 1.55, frequency: 440, gain: 0.024 },
    { start: 2.5, frequency: 523.25, gain: 0.018 },
  ] as const
  for (let index = 0; index < samples.length; index++) {
    const time = index / SAMPLE_RATE
    const air = airSoft(airLow(noise()))
    const breath = air - airBody(air)
    const uneven = 0.88 + 0.12 * Math.tanh(movement(noise()) * 9)
    const swell = smoothStep(time / 0.62) * (0.73 + 0.27 * bump(time, 1.28, 0.62))
    let value = 0.115 * breath * swell * uneven
    for (const touch of touches) {
      const age = time - touch.start
      if (age < 0) continue
      // A round felt attack; quiet, slightly inharmonic upper modes suggest glass
      // without the bright impact or long high ringing of a bell.
      const envelope = smoothStep(age / 0.115) * Math.exp(-age / 0.39)
      const fundamental = Math.sin(TAU * touch.frequency * age)
      const second = 0.14 * Math.sin(TAU * touch.frequency * 2.006 * age) * Math.exp(-age / 0.21)
      const third = 0.035 * Math.sin(TAU * touch.frequency * 2.983 * age) * Math.exp(-age / 0.13)
      value += touch.gain * envelope * (fundamental + second + third)
    }
    samples[index] = value
  }
  return finish(samples, 0.045, 1.2)
}

export function renderSound(name: SoundName): Float64Array {
  return name === 'gift-open' ? renderGiftOpen() : renderBloom()
}

/** Canonical little-endian mono PCM16 WAV; rejects invalid or clipped input. */
export function encodeWav(samples: Float64Array): Uint8Array {
  const bytes = new Uint8Array(44 + samples.length * 2)
  const view = new DataView(bytes.buffer)
  const text = (offset: number, value: string) => {
    for (let index = 0; index < value.length; index++) {
      view.setUint8(offset + index, value.charCodeAt(index))
    }
  }
  text(0, 'RIFF')
  view.setUint32(4, bytes.length - 8, true)
  text(8, 'WAVE')
  text(12, 'fmt ')
  view.setUint32(16, 16, true)
  view.setUint16(20, 1, true)
  view.setUint16(22, 1, true)
  view.setUint32(24, SAMPLE_RATE, true)
  view.setUint32(28, SAMPLE_RATE * 2, true)
  view.setUint16(32, 2, true)
  view.setUint16(34, 16, true)
  text(36, 'data')
  view.setUint32(40, samples.length * 2, true)
  for (let index = 0; index < samples.length; index++) {
    const sample = samples[index]!
    if (!Number.isFinite(sample) || Math.abs(sample) > 1) {
      throw new RangeError(`Invalid audio sample at ${index}`)
    }
    view.setInt16(44 + index * 2, Math.round(sample * 32_767), true)
  }
  return bytes
}

export function measureSignal(samples: Float64Array): { peak: number; rms: number; mean: number } {
  let peak = 0
  let squares = 0
  let total = 0
  for (const sample of samples) {
    peak = Math.max(peak, Math.abs(sample))
    squares += sample * sample
    total += sample
  }
  return { peak, rms: Math.sqrt(squares / samples.length), mean: total / samples.length }
}
