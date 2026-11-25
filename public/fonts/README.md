# Self-hosted stationery fonts

Latin WOFF2 builds served by Google Fonts, downloaded 2026-02-24. Both families are licensed under the SIL Open Font License; their licenses are included alongside these files.

- DM Sans, normal variable weights 400–600: https://fonts.gstatic.com/s/dmsans/v17/rP2Yp2ywxg089UriI5-g4vlH9VoD8Cmcqbu0-K4.woff2
- Instrument Serif, regular: https://fonts.gstatic.com/s/instrumentserif/v5/jizBRFtNs2ka5fXjeivQ4LroWlx-6zUTjg.woff2
- Instrument Serif, italic: https://fonts.gstatic.com/s/instrumentserif/v5/jizHRFtNs2ka5fXjeivQ4LroWlx-6zAjjH7M.woff2

The stylesheet references these local files through relative asset URLs. Next.js bundles them into its static assets and applies the configured build-time base path. Capture readiness explicitly loads and verifies these three faces; no screenshot needs a connection to Google Fonts.
