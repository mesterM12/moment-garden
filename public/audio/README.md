# Original Flowers sounds

Two close, dry gestures for a florist parcel. Both are synthesized offline in
`src/audio/render.ts`; no recordings, runtime instruments, third-party samples,
or bouquet randomness are involved. The committed WAV files are the build inputs.

| Cue | Timing | Intent |
| --- | --- | --- |
| `gift-open.wav` | 0–0.28 s | A 140 ms accelerating silk draw gives way to the soft flex of tissue, with two successively lighter groups of creases. |
| `bloom.wav` | 0–3.80 s | A rolled F–C fifth leaves the paper clear. G at 1.013 s marks stems unfolding; F at 2.070 s answers as the heads open. A quieter D and the final leaf brush trail off, leaving the last 0.8 s of the bloom silent. |

The ribbon picks up speed as its weave runs through a pinch. A wider, lower breath of paper supports the tissue creases; brief impulses excite the sheet without a pitched impact. The plucked voice uses fractional-delay strings and short wooden body resonances driven by the bridge and a little felt noise. Between the notes, paired sweeps of filtered air stand in for leaves sliding past each other. There is no ambient loop, sustained pad, or reverb tail.

## Regenerate and verify

With Node 22.18+ or 24+, run from the repository root:

```sh
npm run sound:render
npx vitest run --project unit src/lib/sound-assets.test.ts src/lib/bloom-sound.test.ts
```

Both files are mono 44.1 kHz, signed 16-bit PCM. Before quantization, the release measures 0.116788 peak / 0.010037 RMS; the bloom measures 0.105955 peak / 0.018667 RMS. FFmpeg's oversampled true peaks are −18.7 dBTP and −19.5 dBTP respectively. There is no loudness normalization. Tests compare the WAVs byte for byte, check clean edges and phrase dynamics, and probe each gesture's level through a mono 400 Hz high-pass / 3.2 kHz low-pass. That probe catches detail lost to bass; it is not a listening test on a phone.
