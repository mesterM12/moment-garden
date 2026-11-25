# Contribute to Flowers for You

Flowers is a surprise bouquet and personal postcard, not a flower editor. Contributions should preserve the shared-link contract, accessible controls, and warm stationery design. Read [PRODUCT.md](PRODUCT.md), [DESIGN.md](DESIGN.md), and [AGENTS.md](AGENTS.md) before changing the experience.

## Report a bug or propose a change

Search existing issues first. For bugs, include reproduction steps, expected and actual behavior, browser/OS, and the bouquet token when relevant. State whether the problem occurs on the [live app](https://flowers.joojoo-lab.xyz/) or your own build. Include screenshots or console errors after removing private information.

For larger features or changes to bouquet generation, open an issue before implementing them. Explain the problem and how the proposal fits a surprise-only gift. Report vulnerabilities through [SECURITY.md](SECURITY.md), not a public bug report.

## Set up a local checkout

Use Node.js 24 or newer, npm, and a browser with WebGL. From your checkout:

```sh
npm ci
npm run dev
```

Open the localhost URL printed by Next.js. See the [README](README.md#run-it-locally) for controls, architecture, Docker, and offline behavior. No API keys or database are required. If you need deployment-specific settings, copy `.env.example` to `.env` and keep the copy private.

## Preserve the bouquet contract

Keep these constraints when changing code:

- A canonical `?bouquet=` token restores the same arrangement; preserve existing shared links and deterministic random streams
- Replay, rotation, sharing, and PNG export retain the selected bouquet; **Grow another** creates a new one
- Keep per-frame geometry and rotation outside React state, and dispose renderers, listeners, textures, and observers on unmount
- Honor reduced motion without removing pointer or keyboard control; check focus and status feedback
- Keep the real garden and server-side social preview consistent for the same seed
- Do not casually regenerate golden fixtures to make a compatibility test pass; explain any intentional compatibility change

For geometry changes, include before/after renders with a fixed token. Inspect the front, a quarter turn, and the back. For UI changes, include desktop and narrow-screen evidence plus keyboard and reduced-motion checks.

## Check your changes

Run these checks from the repository root:

```sh
npm run typecheck
npm test
npm run build
npx playwright install --with-deps chromium
npm run test:e2e
```

`npm test` includes unit, React, and server projects. Browser checks use Vitest with the Playwright library against the production build. Chromium's Linux system dependencies may require elevated installation permissions. There is no lint script or GitHub Actions workflow; report the commands you actually ran and any skipped checks in your pull request.

Test offline/install behavior against a production build, not `npm run dev`. Automated desktop/mobile browser checks do not establish physical-device installation, native sharing, or messaging-crawler behavior. See [deployment verification](docs/DEPLOYMENT.md#verify-a-release) for those checks.

## Open a pull request

Keep changes focused. Explain the problem, approach, and visible behavior changes; link a related issue if one exists. Include test results and screenshots when relevant. Do not include `.env` files, credentials, private deployment details, local agent installations, generated build outputs, or unrelated changes.

Keep third-party notices when adding or updating assets. Project contributions use the existing [MIT License](LICENSE); bundled fonts retain their own licenses. Be respectful and constructive in issues and reviews.
