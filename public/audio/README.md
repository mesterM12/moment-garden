# Original Flowers sounds

Two close, dry gestures for a florist parcel. Both are synthesized offline in
`src/audio/render.ts`; no recordings, runtime instruments, third-party samples,
or bouquet randomness are involved. The committed WAV files are the build inputs.

| Cue | Timing | Intent |
| --- | --- | --- |
| `gift-open.wav` | 0–0.28 s | A ribbon slides through a pinch, tissue unfolds in two small clusters, and the last fold touches the lid. |
| `bloom.wav` | 0–3.80 s | A low rolled fifth under the lifting stems; an E leans down to D, answered by a softer F♯ below. Short leaf brushes and tiny creases sit between the notes. The 4.6-second bloom finishes in silence. |

The silk texture comes from changing friction across a woven surface. Brief noise impulses excite two damped sheet resonances for the tissue; these are separate from the low, muted contact of the lid. The bloom score leaves the initial paper cue unobstructed. Its plucks use fractional-delay string loops with different finger positions, felt damping, and a pair of short wooden body modes. The rubato timing and overlapping decays are written into the score. There is no ambient loop, sustained pad, or reverb tail.

## Regenerate and verify

With Node 22.18+ or 24+, run from the repository root:

```sh
npm run sound:render
npx vitest run --project unit src/lib/sound-assets.test.ts src/lib/bloom-sound.test.ts
```

Both files are mono 44.1 kHz, signed 16-bit PCM. Before quantization, the release measures 0.096687 peak / 0.011006 RMS; the bloom measures 0.099892 peak / 0.019545 RMS. There is no loudness normalization. Tests check committed-file identity, timing, bounded levels, clean edges, phrase dynamics, the last petal brush, and playback controls. These measurements don't replace listening on phone speakers and headphones.
