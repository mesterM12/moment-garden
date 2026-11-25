import { mkdirSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { encodeWav, measureSignal, renderSound, SAMPLE_RATE } from './render.ts'
import type { SoundName } from './render.ts'

const directory = new URL('../../public/audio/', import.meta.url)
mkdirSync(directory, { recursive: true })

for (const name of ['gift-open', 'bloom'] satisfies SoundName[]) {
  const samples = renderSound(name)
  const bytes = encodeWav(samples)
  const { peak, rms, mean } = measureSignal(samples)
  const path = new URL(`${name}.wav`, directory)
  writeFileSync(path, bytes)
  console.log(`${fileURLToPath(path)}: ${(samples.length / SAMPLE_RATE).toFixed(2)}s, ${bytes.length} bytes, peak ${peak.toFixed(6)}, RMS ${rms.toFixed(6)}, DC ${mean.toExponential(3)}`)
}
