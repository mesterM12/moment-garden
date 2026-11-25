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
- `manifest.webmanifest`, `sw.js`, and all four PNGs under `icons/` load from `/moment-garden/`, not the domain root. The manifest’s `id`, `start_url`, and `scope` resolve to the app directory without a bouquet token.
- After **Application → Service Workers** reports an activated worker and the initial precache completes, switch the browser offline, reload, and open another valid bouquet query you have never visited. Both bouquets should open with their original names and seeds.
- Use the browser’s **Install** or **Add to Home Screen** menu to install. On iPhone or iPad in Safari, use **Share → Add to Home Screen**. The postcard adds no installation button, custom prompt, or automatic prompt call.

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

## Social link previews

The built HTML includes Open Graph and Twitter `summary_large_image` metadata before JavaScript runs. The 1200 × 630 JPEG is committed at `public/og/flowers-for-you.jpg` and published at `og/flowers-for-you.jpg` inside the app directory. It must be publicly reachable over HTTPS without authentication and served as `image/jpeg`; messaging crawlers do not run the bouquet renderer or service worker.

By default, image metadata points at `https://mesterm12.github.io/moment-garden/og/flowers-for-you.jpg`. For another host or path, build with `VITE_SITE_URL=https://your-domain.example/app/ npm run build`. The build validates HTTPS and normalizes a trailing slash. This changes only absolute social-image URLs; the app and PWA still use relative asset paths. Rebuild metadata when moving hosts, then check the published HTML and image URL, not only the local preview.

All bouquet URLs use the same brand preview. The query string still restores the exact shared bouquet after opening. No static `og:url` or canonical-to-home tag is emitted: that would advertise the home URL as the identity of every gift. Truly bouquet-specific preview images and metadata require server-side or edge rendering, which this static deployment does not provide. Social platforms cache previews independently; after replacing the image, use a new filename/update its metadata URL or request a platform re-scrape.

`tests/social.spec.ts` verifies metadata with application scripts blocked, the deployed JPEG MIME/signature/dimensions, and shared-query behavior. After publishing, send a real link in the target messaging apps to confirm their crawler caches have refreshed.

## PWA hosting and update contract

Publish the whole `dist/` artifact together, including `manifest.webmanifest`, `sw.js`, `assets/`, and `icons/`. The app requires HTTPS for installation and service-worker storage; localhost is the development exception. A plain HTTP LAN address can preview the UI but cannot establish production offline/install behavior. Serve JavaScript with a JavaScript MIME type, the manifest as `application/manifest+json` (or JSON), and images with their image MIME types. Do not rewrite missing JavaScript files to `index.html`.

Vite uses `base: './'`. Registration resolves `sw.js` beside the document and limits its scope to that app directory. Workbox’s navigation handler serves the precached shell only for the app root or `index.html`; arbitrary sibling paths and unrelated same-origin apps are not captured. Bouquet queries remain in the address bar for deterministic generation, but do not create a separate cache per gift. The build precaches all local JS/CSS and icons, including lazy rendering chunks; external fonts and documentation images are not offline dependencies. If initial precaching fails, the new worker will not activate. Unsupported service workers and storage/registration errors leave the online postcard usable.

The manifest uses stable relative `./` values for identity, start URL, and scope. Installing from a shared bouquet does **not** install that seed as the app’s permanent launch target. Opening the installed app is a fresh visit; save the link or PNG to retain a gift. The theme stays light intentionally: blush browser chrome (`#f5e9e2`) and cream startup background (`#fff9f2`) match the stationery in either OS color scheme, because the app has no dark theme.

Updates use the browser’s waiting-worker lifecycle: there is no forced `skipWaiting`, client takeover, or reload. Existing windows continue using their current shell and cached lazy chunks. Close **all** app tabs and installed windows, then reopen to activate a waiting release. Workbox revisions changed files and removes obsolete entries from this app’s own scope-namespaced precache at activation; it does not clear unrelated origin caches. Recommend revalidation/no-cache for `sw.js`, `index.html`, and the manifest when the host allows headers; fingerprinted `assets/` files can use long-lived immutable caching. GitHub Pages controls its own response cache policy; registration requests bypass the HTTP cache when checking the worker.

Browser storage is best-effort and may be evicted. Offline availability starts only after a successful online installation of the worker, and must be re-established after clearing site data. A production deployment should retain old hashed assets briefly where hosting permits, to support an already-open page that was not yet controlled during its first visit.

### Automated PWA checks

`tests/pwa.spec.ts` runs with the normal `npm run test:e2e` suite after a build. It verifies PNG dimensions and manifest identity, production registration, precached Three/engine chunks, offline reloads and unseen bouquet queries, and a copy of the same build served under `/moment-garden/` on an isolated test server. The subpath test serves a changed worker and verifies it waits without re-sealing the current gift or deleting an unrelated cache. These checks do not prove operating-system installation; verify Safari home-screen install, standalone safe areas, Android install, and offline launches on physical devices before calling those capabilities device-tested.

App icons are committed build inputs. To regenerate them with Node.js 24 and ImageMagick installed, run `npm run pwa:icons`. [`src/pwa/generate-icons.ts`](../src/pwa/generate-icons.ts) renders the existing [`public/flowers.svg`](../public/flowers.svg) flower mark on cream, with a smaller safe-zone mark for the 512px maskable icon. Outputs are deterministic for the installed ImageMagick renderer; normal builds require no image tooling.

## Troubleshooting and rollback

- **Blank page or a `/src/main.tsx` request:** Pages is serving the source tree. Select GitHub Actions as the source and deploy the `dist/` artifact.
- **Deployment permission or environment failure:** confirm Pages is enabled, the `github-pages` environment permits `main`, and the deploy job has `pages: write` and `id-token: write`. Keep those permissions limited to the deploy job.
- **Build or tests fail:** inspect the failing job. The workflow does not publish when its build job fails; fix the source or lockfile instead of uploading the repository root.
- **An old preview appears in a messaging app:** the social card is generic and may be cached. The bouquet URL still selects the recipient’s exact arrangement.
- **Old app after a successful deployment:** a replacement worker deliberately waits while any older app tab/window remains open. Close all app tabs and installed windows, then reopen online. Do not solve this by automatically reloading a gift.
- **Offline fails on a first visit:** open online and allow worker precaching to finish first. Check HTTPS, worker scope, storage policy, and failed local asset requests. Clearing browser site data also removes offline availability.
- **Rollback:** revert the faulty change on `main` and push. The workflow rebuilds and publishes the reverted source; the rolled-back worker follows the same waiting lifecycle. Do not revert to a pre-Vite source layout without also coordinating the Pages publishing configuration.

A successful Actions run confirms artifact publication. Real-device Safari, native sharing, and screen-reader behavior still need device testing; desktop/mobile Chromium automation does not establish those results.
