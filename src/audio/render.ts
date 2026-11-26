/** Original, offline sound synthesis. No browser, files, or bouquet RNG involved. */
export const SAMPLE_RATE = 44_100
export const SOUND_DURATIONS = { 'gift-open': 0.28, bloom: 6.1 } as const
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

// Mix only the span of a gesture. Between touches there is no noise bed.
function addGesture(mix: Float64Array, start: number, duration: number, sample: (age: number) => number) {
  const first = Math.round(start * SAMPLE_RATE)
  const count = Math.min(Math.round(duration * SAMPLE_RATE), mix.length - first)
  for (let i = 0; i < count; i++) {
    mix[first + i]! += sample(i / SAMPLE_RATE) * smoothStep((count - 1 - i) / (0.009 * SAMPLE_RATE))
  }
}

// A local contact excites a damped flexural mode of a fold / wooden soundboard.
function resonator(hz: number, decay: number) {
  const angle = TAU * hz / SAMPLE_RATE
  const radius = Math.exp(-1 / (SAMPLE_RATE * decay))
  const feedback = 2 * Math.cos(angle) * radius
  const feed = Math.sin(angle)
  let last = 0, previous = 0
  return (drive: number) => {
    const next = feed * drive + feedback * last - radius * radius * previous
    previous = last
    last = next
    return next
  }
}

/** A ribbon pulled through a pinch: accelerating weave contacts ride a soft friction stroke. */
function ribbonSlip(mix: Float64Array, start: number, length: number, level: number, noise: () => number) {
  const fibre = lowPass(3_250), soft = lowPass(2_400), bass = lowPass(360), pressure = lowPass(42)
  let phase = 0, tooth = 0
  addGesture(mix, start, length, (t) => {
    const x = t / length
    phase += (165 + 360 * smoothStep(x / 0.86) + 75 * noise()) / SAMPLE_RATE
    if (phase >= 1) { phase--; tooth = 0.62 + 0.34 * noise() }
    tooth *= 0.94
    const friction = soft(fibre((0.39 + tooth) * noise() + 0.28 * tooth))
    const contact = smoothStep(x / 0.21) * (0.65 + 0.35 * x)
      * smoothStep((1 - x) / 0.24) * (1 + 1.6 * pressure(noise()))
    return level * contact * (friction - bass(friction))
  })
}

/** Tiny irregular buckles in a tensioned sheet; neither white-noise hiss nor pitched chimes. */
function folds(mix: Float64Array, start: number, span: number, count: number, level: number, noise: () => number) {
  for (let i = 0; i < count; i++) {
    const at = start + span * (i + 0.42 + 0.4 * noise()) / count
    const weight = level * (0.64 + 0.36 * noise())
    const broad = resonator(760 + 240 * noise(), 0.0028)
    const fine = resonator(2_680 + 640 * noise(), 0.0016)
    const drive = lowPass(3_800)
    addGesture(mix, at, 0.026, (t) => {
      const pinch = drive(noise()) * smoothStep(t / 0.0008) * Math.exp(-t / 0.0021)
      return weight * (0.70 * broad(pinch) + 0.30 * fine(pinch))
    })
  }
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

/** A silk draw, then two lighter releases as the tissue loses tension. */
export function renderGiftOpen(): Float64Array {
  const samples = new Float64Array(Math.round(SOUND_DURATIONS['gift-open'] * SAMPLE_RATE))
  const noise = noiseSource(0x73696c6b)
  ribbonSlip(samples, 0.003, 0.14, 0.216, noise)
  // As the knot slips free, the broad face of the sheet exhales under two
  // successively lighter creases. Its last contact is unpitched, not a tap.
  const face = lowPass(1_080), rumble = lowPass(260)
  addGesture(samples, 0.137, 0.137, t => {
    const flex = face(noise())
    return 0.095 * smoothStep(t / 0.019) * Math.exp(-t / 0.050) * (flex - rumble(flex))
  })
  folds(samples, 0.145, 0.034, 5, 0.017, noise)
  folds(samples, 0.207, 0.039, 3, 0.009, noise)
  return finish(samples, 0.006, 0.016)
}

/** Fractional-delay plucked string. The finger position sets the initial
 * displacement (and harmonic notches); felt loss damps the highs on every trip. */
function pluck(mix: Float64Array, start: number, midi: number, gain: number, position: number, decay: number) {
  const hz = 440 * 2 ** ((midi - 69) / 12)
  const period = SAMPLE_RATE / hz
  const damping = 0.39
  const length = Math.floor(period - damping)
  const fraction = period - damping - length
  const line = new Float64Array(length + 1)
  for (let i = 0; i < line.length; i++) {
    // Two travelling halves of a displaced string form a triangular first period.
    const x = i / line.length
    line[i] = 2 * (x < position ? x / position : (1 - x) / (1 - position)) - 1
  }
  const loss = Math.exp(-1 / (hz * decay))
  const wood = resonator(326, 0.007), bridge = resonator(688, 0.004)
  const felt = lowPass(1_650), grain = noiseSource(0x66656c74 ^ midi)
  let cursor = 0, last = 0
  addGesture(mix, start, decay * 7, (t) => {
    const ahead = (cursor + 1) % line.length
    const wave = fraction * line[cursor]! + (1 - fraction) * line[ahead]!
    const velocity = wave - last
    line[cursor] = loss * (wave - damping * velocity)
    cursor = ahead
    last = wave
    // A little aperiodic finger contact excites only the board, not a
    // repeating noise pattern in the string. The upper modes carry on mono.
    const contact = velocity + 0.035 * felt(grain()) * Math.exp(-t / 0.012)
    const body = 0.20 * wood(contact) + 0.12 * bridge(contact)
    return gain * smoothStep(t / 0.013) * (wave + body)
  })
}

/** One close, rubato gesture. Nothing sustains underneath it: the perceived
 * space comes from overlapping string decays, not an ambient pad or reverb. */
export function renderBloom(): Float64Array {
  const samples = new Float64Array(Math.round(SOUND_DURATIONS.bloom * SAMPLE_RATE))
  const noise = noiseSource(0x7065746c)
  // The held head gets the rolled fifth; G opens the pullback, F lands
  // with the whole bouquet, and a softer D leaves the final fold unscored.
  pluck(samples, 0.490, 53, 0.068, 0.29, 0.37) // F3
  pluck(samples, 0.608, 60, 0.039, 0.36, 0.35) // C4
  pluck(samples, 1.835, 67, 0.069, 0.40, 0.48) // G4
  pluck(samples, 4.169, 65, 0.042, 0.36, 0.43) // F4
  pluck(samples, 5.120, 62, 0.029, 0.32, 0.34) // D4

  // Leaves pass one another smoothly, without the regular teeth of woven silk.
  // A second, lighter blade briefly follows the first on each sweep.
  for (const [at, span, level] of [
    [1.16, 0.125, 0.052], [2.72, 0.205, 0.065],
    [3.79, 0.177, 0.054], [5.49, 0.125, 0.026],
  ] as const) {
    const edge = lowPass(2_800), shade = lowPass(720)
    addGesture(samples, at, span, t => {
      const x = t / span, air = edge(noise())
      const blade = Math.sin(Math.PI * Math.min(1, x / 0.67)) ** 2
      const neighbour = Math.sin(Math.PI * Math.max(0, (x - 0.47) / 0.53)) ** 2
      return level * (blade + 0.55 * neighbour) * (air - shade(air))
    })
  }
  return finish(samples, 0.008, 0.45)
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
