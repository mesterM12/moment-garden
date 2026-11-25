# Deploy Flowers for You

The site is a React 19 + TypeScript application built with Vite. GitHub Pages serves the contents of `dist/`; it does not execute React, TypeScript, or a Node server.

- Public site: https://mesterm12.github.io/moment-garden/
- Deployment workflow: [pages.yml](../.github/workflows/pages.yml)
- Build and browser checks: [test.yml](../.github/workflows/test.yml)

## Publish through GitHub Actions

1. In repository **Settings → Pages → Build and deployment**, select **GitHub Actions** as the source. Branch-root publishing is incompatible with the Vite source tree.
2. Push a reviewed commit to `main`, or run **Deploy static site to GitHub Pages** manually from the Actions tab.
3. The build job installs the lockfile with Node.js 24, runs the Node and React tests, builds the application, and uploads `dist/` as a Pages artifact.
4. The deploy job publishes that artifact to the `github-pages` environment using GitHub’s short-lived deployment token. No personal access token or application secret is needed.
5. Wait for both the deployment and the separate browser-test workflow to succeed. Smoke-test the public URL before sharing it.

From an authenticated GitHub CLI:

```sh
gh workflow run pages.yml --ref main
gh run list --workflow pages.yml --limit 5
gh run watch <run-id> --exit-status
```

The workflow runs on `main` pushes automatically; manual dispatch is useful for redeploying an existing commit. Concurrent Pages runs are canceled in favor of the latest one.

## Verify a release

Open this known bouquet:

https://mesterm12.github.io/moment-garden/?bouquet=1970260fcfb

Check that:

- The personal cover loads and **Open your flowers** is enabled.
- Opening reveals **The Last Light**, seeded by timestamp `1748091600123`.
- Replay preserves the arrangement; **Grow another** changes it and removes the old bouquet token from the URL.
- **Send flowers** produces a link under `/moment-garden/`, not a local preview address.
- **Save postcard** downloads a PNG of the current bouquet.
- Keyboard and reduced-motion opening show the finished arrangement without waiting.
- The browser reports no failed local asset requests or application errors.

The URL token and path are part of the gift contract. Keep `/moment-garden/` and the existing lowercase hexadecimal seed format when changing deployment infrastructure. Vite’s relative asset base allows deployment at this subpath without rebuilding for a specific hostname.

## Test before publishing

```sh
npm ci
npm test
npm run build
npx playwright install chromium
npm run test:e2e
```

To inspect the generated files locally, use `npm run preview`. Opening `index.html` from disk or serving the repository root is not a production deployment. Production includes `public/` assets copied into `dist/`; documentation screenshots and legacy generator fixtures stay in the repository.

## Troubleshooting and rollback

- **Blank page or a `/src/main.tsx` request:** Pages is serving the source tree. Select GitHub Actions as the source and deploy the `dist/` artifact.
- **Deployment permission or environment failure:** confirm Pages is enabled, the `github-pages` environment permits `main`, and the deploy job has `pages: write` and `id-token: write`. Keep those permissions limited to the deploy job.
- **Build or tests fail:** inspect the failing job. The workflow does not publish when its build job fails; fix the source or lockfile instead of uploading the repository root.
- **An old preview appears in a messaging app:** the social card is generic and may be cached. The bouquet URL still selects the recipient’s exact arrangement.
- **Rollback:** revert the faulty change on `main` and push. The workflow rebuilds and publishes the reverted source. Do not revert to a pre-Vite source layout without also coordinating the Pages publishing configuration.

A successful Actions run confirms artifact publication. Real-device Safari, native sharing, and screen-reader behavior still need device testing; desktop/mobile Chromium automation does not establish those results.
