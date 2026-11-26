# Saving the bloom

Open a bouquet and choose **Save bloom GIF** below the postcard. This makes a silent, looping `.gif` of the front-facing bloom for that exact gift, even with reduced motion turned on. Use **Save postcard** instead for a still image at your current angle. Neither export replaces the live bouquet or the link you send.

The GIF uses the garden’s own pose, lighting, and bloom camera. At 432 × 480 pixels, it samples the shared bloom duration roughly every 80 ms and holds the finished bouquet for another 1.2 seconds. A separate renderer draws on cream paper while a worker encodes one frame at a time. The postcard stays interactive. You can cancel while preparing the GIF; growing another bouquet also cancels a pending export. If export is unavailable, you can retry or save the still postcard.

## Verify a production build

```sh
pnpm build
PORT=4276 PUBLIC_URL=http://127.0.0.1:4276/ pnpm exec next start --hostname 127.0.0.1 --port 4276
```

In a second terminal, with Playwright Chromium installed:

```sh
node scripts/verify-bloom-gif.ts http://127.0.0.1:4276
```

This downloads and decodes the legacy and current versions of the same seed, plus a second current bouquet. It checks GIF timing and looping and compares the decoded final frames to their matching live bouquets. It also verifies keyboard cancellation, focus restoration, and that exporting with reduced motion leaves the live view alone. The v3 files are exported offline after the production app has cached. The real downloads are written to `.cache/bloom-gif-proof/`.
