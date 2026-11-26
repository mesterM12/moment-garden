import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { encodeWav, measureSignal, renderSound, SAMPLE_RATE, SOUND_DURATIONS } from '../audio/render'
import type { SoundName } from '../audio/render'

const names: SoundName[] = ['gift-open', 'bloom']

function rms(samples: Float64Array, start: number, end: number): number {
  return measureSignal(samples.slice(Math.round(start * SAMPLE_RATE), Math.round(end * SAMPLE_RATE))).rms
}

// A conservative mono midband probe, not a simulated phone or listening test.
function phoneBand(samples: Float64Array): Float64Array {
  const hp = 1 - Math.exp(-2 * Math.PI * 400 / SAMPLE_RATE)
  const lp = 1 - Math.exp(-2 * Math.PI * 3_200 / SAMPLE_RATE)
  let bass = 0, band = 0
  return samples.map(sample => {
    bass += hp * (sample - bass)
    band += lp * (sample - bass - band)
    return band
  })
}

function decodePcm(bytes: Uint8Array): Float64Array {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  const samples = new Float64Array((bytes.length - 44) / 2)
  for (let index = 0; index < samples.length; index++) {
    samples[index] = view.getInt16(44 + index * 2, true) / 32_767
  }
  return samples
}

describe.each(names)('%s offline sound asset', (name) => {
  it('is deterministic and independent of previous renders or bouquet randomness', () => {
    const first = encodeWav(renderSound(name))
    renderSound(name === 'gift-open' ? 'bloom' : 'gift-open')
    expect(encodeWav(renderSound(name))).toEqual(first)
  })

  it('matches the committed build input byte for byte', () => {
    const committed = readFileSync(resolve(process.cwd(), `public/audio/${name}.wav`))
    expect(Uint8Array.from(committed)).toEqual(encodeWav(renderSound(name)))
  })

  it('encodes an exact-duration 44100 Hz mono 16-bit PCM RIFF/WAVE', () => {
    const bytes = encodeWav(renderSound(name))
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
    const text = (start: number, end: number) => String.fromCharCode(...bytes.slice(start, end))
    const sampleCount = Math.round(SOUND_DURATIONS[name] * 44_100)
    expect(text(0, 4)).toBe('RIFF')
    expect(view.getUint32(4, true)).toBe(bytes.length - 8)
    expect(text(8, 12)).toBe('WAVE')
    expect(text(12, 16)).toBe('fmt ')
    expect(view.getUint32(16, true)).toBe(16)
    expect(view.getUint16(20, true)).toBe(1)
    expect(view.getUint16(22, true)).toBe(1)
    expect(view.getUint32(24, true)).toBe(44_100)
    expect(view.getUint32(28, true)).toBe(88_200)
    expect(view.getUint16(32, true)).toBe(2)
    expect(view.getUint16(34, true)).toBe(16)
    expect(text(36, 40)).toBe('data')
    expect(view.getUint32(40, true)).toBe(sampleCount * 2)
    expect(bytes.length).toBe(44 + sampleCount * 2)
    expect(decodePcm(bytes).length / 44_100).toBe(SOUND_DURATIONS[name])
  })

  it('has finite, quiet, unclipped samples and negligible DC before and after PCM quantization', () => {
    const rendered = renderSound(name)
    const decoded = decodePcm(encodeWav(rendered))
    for (const samples of [rendered, decoded]) {
      expect(samples.every(Number.isFinite)).toBe(true)
      const { peak, rms: level, mean } = measureSignal(samples)
      expect(peak).toBeGreaterThan(0.015)
      expect(peak).toBeLessThanOrEqual(0.16)
      expect(level).toBeGreaterThan(0.003)
      expect(level).toBeLessThan(0.035)
      expect(Math.abs(mean)).toBeLessThan(0.00001)
    }
    let quantizationError = 0
    for (let index = 0; index < rendered.length; index++) {
      quantizationError = Math.max(quantizationError, Math.abs(rendered[index]! - decoded[index]!))
    }
    expect(quantizationError).toBeLessThanOrEqual(0.5 / 32_767 + Number.EPSILON)
  })

  it('starts and ends at zero with quiet edges and no impulsive sample jumps', () => {
    const samples = decodePcm(encodeWav(renderSound(name)))
    expect(samples[0]).toBe(0)
    expect(samples.at(-1)).toBe(0)
    const duration = SOUND_DURATIONS[name]
    const body = measureSignal(samples).rms
    expect(rms(samples, 0, 0.004)).toBeLessThan(body * 0.04)
    expect(rms(samples, duration - 0.004, duration)).toBeLessThan(body * 0.04)
    let largestStep = 0
    for (let index = 1; index < samples.length; index++) {
      largestStep = Math.max(largestStep, Math.abs(samples[index]! - samples[index - 1]!))
    }
    expect(largestStep).toBeLessThan(0.04)
  })
})

describe('sound timing and encoder guards', () => {
  it('keeps bloom under 3.8s and gently releases well before the 4.6s geometry finishes', () => {
    const samples = renderSound('bloom')
    expect(samples.length / SAMPLE_RATE).toBeLessThanOrEqual(3.8)
    expect(4.6 - samples.length / SAMPLE_RATE).toBeCloseTo(0.8)
    expect(rms(samples, 3.2, 3.4)).toBeLessThan(rms(samples, 2.6, 2.8))
    expect(rms(samples, 3.6, 3.8)).toBeLessThan(rms(samples, 3.2, 3.4) * 0.15)
    expect(rms(samples, 0, 0.1)).toBeLessThan(rms(samples, 0.8, 1.0) * 0.1)
  })

  it('leaves room for the release, breathes between fingers, and answers more quietly than the melody', () => {
    const samples = renderSound('bloom')
    const bass = rms(samples, 0.34, 0.49)
    const melody = rms(samples, 1.04, 1.20)
    const answer = rms(samples, 2.72, 2.83)
    expect(rms(samples, 0, SOUND_DURATIONS['gift-open'])).toBeLessThan(bass / 50)
    expect(rms(samples, 0.91, 1.005)).toBeLessThan(melody / 3)
    expect(rms(samples, 1.83, 2.04)).toBeLessThan(rms(samples, 2.10, 2.28) / 4)
    expect(answer).toBeLessThan(melody * 0.7)
    expect(answer).toBeGreaterThan(melody * 0.3)
  })

  it('keeps both tissue folds and the ribbon distinct in the mono midband', () => {
    const samples = phoneBand(decodePcm(encodeWav(renderSound('gift-open'))))
    const slip = rms(samples, 0.025, 0.12)
    const fold = rms(samples, 0.15, 0.19)
    const release = rms(samples, 0.215, 0.255)
    expect(slip).toBeGreaterThan(0.009)
    expect(fold / slip).toBeGreaterThan(0.35)
    expect(fold / slip).toBeLessThan(0.85)
    expect(release / fold).toBeGreaterThan(0.4)
    expect(release / fold).toBeLessThan(0.85)
  })

  it('keeps every register of the plucked phrase present without relying on bass', () => {
    const raw = decodePcm(encodeWav(renderSound('bloom')))
    const band = phoneBand(raw)
    for (const [start, end] of [[0.34, 0.49], [1.04, 1.20], [2.10, 2.28], [2.72, 2.83]] as const) {
      expect(rms(band, start, end)).toBeGreaterThan(0.01)
      expect(rms(band, start, end) / rms(raw, start, end)).toBeGreaterThan(0.43)
    }
  })

  it('keeps the final petal distinct from the fading string without a new loud note', () => {
    const samples = renderSound('bloom')
    // First-difference energy favors the little high-frequency edges of the brush.
    const edge = samples.map((sample, i) => sample - (samples[i - 1] ?? sample))
    expect(rms(edge, 3.303, 3.37)).toBeGreaterThan(rms(edge, 3.12, 3.23) * 2)
    expect(rms(samples, 3.303, 3.37)).toBeLessThan(rms(samples, 3.12, 3.23))
  })

  it.each([NaN, Infinity, -Infinity, 1.01, -1.01])('rejects unsafe sample %s instead of silently clipping', (value) => {
    expect(() => encodeWav(new Float64Array([0, value, 0]))).toThrow(RangeError)
  })
})
