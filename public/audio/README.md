# Original Flowers sounds

These are original, deterministic, code-generated sounds for the warm cream
stationery interface. No recordings, sample libraries, synthesizer dependencies,
or third-party sound assets are used. The source is `src/audio/render.ts`.

Regenerate from the repository root with a Node version supporting native
TypeScript type stripping (Node 22.18+ / 24+):

```sh
node src/audio/generate.ts
```

The `.ts` entry runs directly with Node's native TypeScript support. No generation occurs at build time. The committed WAV files are the runtime/build inputs.

## Format and intent

Both files are centered mono, 44,100 Hz, signed 16-bit little-endian PCM in a
canonical WAV container. There is no heavy bass, stereo widening, compression,
limiting, or peak normalization. Fixed audio-only xorshift seeds never consume
bouquet randomness. Smooth edge envelopes and DC removal precede quantization.

| File | Duration | Bytes | Float peak | Float RMS |
| --- | ---: | ---: | ---: | ---: |
| `gift-open.wav` | 0.28 s | 24,740 | 0.090795 | 0.018383 |
| `bloom.wav` | 3.80 s | 335,204 | 0.048377 | 0.009329 |

- **Gift open:** unequally spaced contacts of doubly low-passed, bass-reduced
  noise, with a tiny soft 330 Hz felt/contact transient. Intended as paper
  slipping free, not paper tearing, a broad whoosh, or a notification bell.
- **Bloom:** a slow, band-limited breath swell with three restrained, round
  resonances beginning at 0.65, 1.55, and 2.50 seconds. Fundamentals are
  349.23, 440, and 523.25 Hz; quiet, quickly damped upper modes provide a little
  warm glass character without a sharp striking edge. The final 1.2 seconds
  taper gently to silence. In the 4.6-second geometry opening, the last
  0.8 seconds are silent.

## Verification and limitations

`src/lib/sound-assets.test.ts` verifies repeatable output, committed-file byte
identity, WAV headers and timing, finite samples, conservative peak/RMS/DC,
PCM quantization, quiet edges, sample continuity, and the final bloom fade.
Run it with:

```sh
npx vitest run --project unit src/lib/sound-assets.test.ts
```

These sounds have **not been auditioned**. Objective checks cannot establish
whether a listener perceives paper rather than friction, warm glass rather than
an understated tone sequence, or whether breath is sufficiently subtle on a
particular phone speaker. The rendering intentionally favors restraint and
midrange translation; final listening on phone and headphones is still needed.
No audio was played on the development host.
