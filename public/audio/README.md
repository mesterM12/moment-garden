# Original Flowers sounds

Two close, dry gestures for a florist parcel. Both are synthesized offline in
`src/audio/render.ts`; no recordings, runtime instruments, third-party samples,
or bouquet randomness are involved. The committed WAV files are the build inputs.

| Cue | Timing | Intent |
| --- | --- | --- |
| `gift-open.wav` | 0–0.28 s | A 140 ms accelerating silk draw gives way to the soft flex of tissue, with two successively lighter groups of creases. |
| `bloom.wav` | 0–6.10 s | A rolled F–C fifth follows the paper. G at 1.835 s opens the pullback; F at 4.169 s answers as the full bouquet comes into view. A quieter D and a final leaf brush leave the last 0.4 s of the bloom silent. |

The ribbon picks up speed as its weave runs through a pinch. A wider, lower breath of paper supports the tissue creases; brief impulses excite the sheet without a pitched impact. The plucked voice uses fractional-delay strings and short wooden body resonances driven by the bridge and a little felt noise. Between the notes, paired sweeps of filtered air stand in for leaves sliding past each other. There is no ambient loop, sustained pad, or reverb tail.

## Regenerate and verify

With Node 22.18+ or 24+, run from the repository root:

```sh
pnpm sound:render
pnpm exec vitest run --project unit src/lib/sound-assets.test.ts src/lib/bloom-sound.test.ts
```

Both files are mono 44.1 kHz, signed 16-bit PCM. Before quantization, the release measures 0.116788 peak / 0.010037 RMS; the bloom measures 0.087143 peak / 0.015715 RMS. FFmpeg's oversampled true peaks are −18.7 dBTP and −21.2 dBTP respectively. There is no loudness normalization. Tests compare the WAVs byte for byte, check clean edges and phrase dynamics, and probe each gesture's level through a mono 400 Hz high-pass / 3.2 kHz low-pass. That probe catches detail lost to bass; it is not a listening test on a phone.
