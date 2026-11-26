# Deploy Flowers for You

The supported self-hosted deployment is a custom Docker image containing **Node.js 26 LTS**, the **Next.js 16 App Router standalone build**, and **Playwright Chromium**. Next.js serves the app on port **3000** and generates bouquet-specific social-preview PNGs using the real Three.js garden engine. Application code, server helpers, build scripts, and tests use TypeScript. There is no bouquet database, external rendering service, or API key requirement.

The [live demo](https://flowers.joojoo-lab.xyz/) serves the domain root. The repository has no GitHub Actions test or deployment workflows. Releases are manual: run checks and deploy explicitly; a push does not publish a release. These instructions do not provision infrastructure or configure TLS for you. For an existing Docker host with a shared reverse-proxy network, see the optional [host deployment template](../deploy/shipyard/README.md).

## Run with Docker Compose

Install Docker Engine and the Compose plugin, then run from the repository root:

```sh
docker compose up --build -d
```

Open **http://localhost:3000/**. The default public URL is `http://localhost:3000/`, suitable only for local use.

```sh
curl --fail http://localhost:3000/healthz
docker compose logs -f
# Stop without removing the persistent image cache:
docker compose down
```

The named `og-cache` volume persists generated PNGs across container replacement. `docker compose down --volumes` removes that cache; it is not necessary for an ordinary update. Images are reproducible from the seed, so clearing the cache loses no gifts, but the next image request needs a fresh render.

### Production URL and reverse proxy

Set **`PUBLIC_URL` for every production deployment** to the externally reachable app URL. Use HTTPS, include any path prefix, and omit queries, fragments, and credentials. A trailing slash is normalized by the server.

For a domain-root deployment, leave `NEXT_PUBLIC_BASE_PATH` empty. For a subpath deployment, set it **at build time**, beginning with `/` and without a trailing slash:

```sh
NEXT_PUBLIC_BASE_PATH=/moment-garden \
PUBLIC_URL=https://flowers.example/moment-garden/ \
docker compose up --build -d
```

You can also set both variables in the Compose project's `.env` file; copy [`.env.example`](../.env.example) as a starting point. Keep deployment-specific environment files out of version control. `PUBLIC_URL` is public configuration, not a secret, but credentials and private host details do not belong in the repository. Compose passes `${NEXT_PUBLIC_BASE_PATH:-}` as a Docker build argument; the Dockerfile sets it in both build and runtime stages. `PUBLIC_URL` is runtime configuration, but its normalized pathname **must match the built base path**. Changing `/moment-garden` to another path requires rebuilding the image and recreating the container. Changing only the hostname or scheme in `PUBLIC_URL` needs only container recreation (`docker compose up -d --force-recreate`). The server does not infer its public origin from request headers.

Provide your own TLS reverse proxy in front of port 3000. Compose binds the published port to host loopback (`127.0.0.1`) by default, suitable for a reverse proxy running on the same host. Set `FLOWERS_PORT` to change that host port; if your proxy runs in another container or on another machine, explicitly configure its network access rather than assuming the loopback binding is reachable. Forward the app prefix **without stripping it**, preserve query strings, and allow public unauthenticated GET requests to app assets and `og/` images. For the example above, `/moment-garden/?bouquet=1970260fcfb` and `/moment-garden/og/...` must reach the container unchanged. Health checks use that same prefix: `/moment-garden/healthz` for this build, or `/healthz` for a root build. The Docker health check includes the built prefix; do not add a separate root-only health route at the proxy. It does not prove Chromium can render—verify an actual image too.

Do not put an authentication challenge in front of shared pages or preview images. Do not cache HTML across bouquet queries: the metadata is request-specific and HTML is served with `Cache-Control: no-store`. The server supplies immutable caching for versioned OG PNGs and fingerprinted assets; preserve those headers. TLS, DNS, proxy configuration, resource limits, and host security remain the operator's responsibility.

### Build and runtime settings

| Variable | Default | Purpose |
| --- | --- | --- |
| `NEXT_PUBLIC_BASE_PATH` | Empty (domain root) | Build-time app prefix, e.g. `/moment-garden`, without a trailing slash. Set before `pnpm build` or through Compose's build argument. Path changes require rebuilding. |
| `PUBLIC_URL` | `http://localhost:3000/` in Compose; localhost with the built prefix for direct startup | Runtime absolute externally reachable app URL. Its pathname must match `NEXT_PUBLIC_BASE_PATH`. Required configuration for production. |
| `FLOWERS_PORT` | `3000` in root Compose | Host loopback port mapped to container port 3000. If you change it for local use, also update `PUBLIC_URL` to match the URL you open. |
| `PORT` | `3000` | HTTP listener port inside the container. Keep 3000 with the supplied Compose port mapping and health check. |
| `HOSTNAME` | `0.0.0.0` in Docker | Next.js standalone server bind address; keep this for container access. `pnpm start` supplies the equivalent Next.js CLI hostname option. |
| `OG_CACHE_DIR` | `/app/.cache/og` in Docker; `.cache/og` for direct startup | Writable persistent PNG cache directory. The Compose volume mounts the Docker path. |
| `OG_CACHE_ENTRIES` | `256` | Maximum persistent PNG entries, pruned across content versions. This bounds entry count, not disk bytes. |
| `CHROMIUM_EXECUTABLE_PATH` | Playwright's bundled browser | Optional compatible Chromium executable override. Normally leave unset. |

`PUBLIC_URL` and `OG_CACHE_ENTRIES` are passed through at runtime by the supplied Compose setup; `NEXT_PUBLIC_BASE_PATH` is passed at build time. Other runtime overrides can be added to the service's `environment` block if needed. Do not change the container's base-path environment independently of the build. Changing cache paths also requires updating volume mounts and write permissions. Changing the listener port requires coordinating the mapping, health check, and proxy.

## Run without Docker

Use Node.js 24 or newer and the pnpm version in `package.json`. Install Chromium plus its operating-system dependencies on a supported host:

```sh
pnpm install --frozen-lockfile
pnpm exec playwright install --with-deps chromium
pnpm build
PUBLIC_URL=http://localhost:3000/ pnpm start
```

`pnpm start` runs `next start` from the repository root. Keep `.next/`, `public/` (including the generated PWA files), package metadata, and installed dependencies together. The cache directory must be writable by the service account. Browser dependency installation can require elevated privileges on Linux. For production use a process supervisor and a TLS reverse proxy, and replace `PUBLIC_URL` with your public HTTPS URL.

For a subpath, set `NEXT_PUBLIC_BASE_PATH=/moment-garden` before `pnpm build`, then start with `PUBLIC_URL=https://flowers.example/moment-garden/`. Rebuild to change the path; a runtime environment change alone cannot relocate Next.js assets or routes.

The Docker image instead copies `.next/standalone`, `.next/static`, and `public`, then runs **`node server.js`**. That `server.js` is generated by Next.js, not a hand-written server. For a manual standalone deployment, copy `.next/static` into `.next/standalone/.next/static` and `public` into `.next/standalone/public`, provide compatible Playwright/Chromium runtime dependencies, and run from `.next/standalone`.

`pnpm dev` runs `next dev`; production startup is `pnpm build` followed by `pnpm start`. There is no separate preview command, static-export deployment, or root `index.html` entry. Vite remains a development dependency only to underpin Vitest.

## Social link previews

For a canonical valid `?bouquet=` token, App Router **`generateMetadata`** supplies Open Graph and Twitter image metadata in the HTML **before JavaScript runs**. Messaging crawlers need not execute the renderer or service worker. The absolute image URL has this form, relative to `PUBLIC_URL`:

```text
og/<16hex-build-ID-hash>/<bouquet-token>.png
```

Pages without a valid gift token use the fixed default preview seed `1970260fcfb`; they cannot preview a fresh timestamp that the browser has not chosen yet. Valid shared pages use their full token: `<hex>.png` for bare legacy links or `v3-<hex>.png` for new cuts. The recipe version is separate from the build namespace. The preview always uses the canonical front view, not a saved sender camera angle.

The version is the first 16 hexadecimal characters of the SHA-256 hash of `.next/BUILD_ID`, so each new Next.js build gets its own image namespace. PNGs are served as `image/png`, at **1200 × 630**, with immutable caching. Social platforms cache independently; request a platform re-scrape when necessary. An image URL for an old build version is not a permanent archive: an old version may no longer be served after an update. The original shared page URL still regenerates that seed with the current build.

The internal `/__og?bouquet=...` capture view (under the built app prefix) mounts a client-only capture component and reuses the real Three.js engine, locally hosted Instrument Serif and DM Sans fonts, and the current stationery styles. Neither the interactive garden nor the capture renderer is server-rendered. It renders the **same seeded bouquet**, fully bloomed in its canonical front view, adapted to a landscape card. It does not copy the sender's rotation or promise pixel identity across browsers, GPUs, screen sizes, or future visual changes. The URL stores the bouquet seed, not an uploaded screenshot.

Chromium's capture requests are restricted to the local app origin; callers cannot supply an arbitrary URL to render. The image endpoint rejects malformed or noncanonical tokens with HTTP 404 before starting Chromium. The client-only internal capture view rejects invalid tokens through its capture-readiness error state rather than promising a page HTTP status. A shared app page with an invalid `?bouquet=` query still returns HTTP 200 with default preview metadata, preserving the browser's invalid-link notice and fresh-bouquet recovery. Missing images are handled by a serialized browser queue, concurrent requests for the same image share one render, and completed PNGs are persisted in the bounded cache. By default, per process, new renders are limited to 30 per minute with at most four pending jobs; the persistent cache holds at most 256 entries. Cached hits do not require a browser render. Saturated requests receive HTTP 429 with `Retry-After`; render failures receive a retryable error rather than a cached error image. These bounds limit work but are not a substitute for reverse-proxy abuse controls or host monitoring.

The supported deployment needs the Next.js server; it is not a static export. A static file host cannot provide the App Router metadata, image routes, or exact-seed Chromium rendering.

## Shared-link contract

A gift uses one `bouquet` parameter: a lowercase hexadecimal timestamp for legacy v2 or `v3-` followed by the timestamp for the florist generator. For example:

```text
https://flowers.example/moment-garden/?bouquet=1970260fcfb
https://flowers.example/moment-garden/?bouquet=v3-1970260fcfb
```

Keep the path and query intact in your reverse proxy. Do not strip `v3-` or rewrite bare links: the same timestamp in these two URLs produces different bouquets. The timestamp rules have not changed: no leading zeros except `0`, a nonnegative millisecond Unix timestamp within the JavaScript `Date` range. Seeded generation needs no server-side gift lookup.

When changing domains or app paths, existing shared URLs need redirects at their original host. Preserve the bouquet query when redirecting so recipients open the same arrangement.

## Test before publishing

```sh
pnpm install --frozen-lockfile
pnpm exec playwright install --with-deps chromium
pnpm typecheck
pnpm test
pnpm build
pnpm test:server
pnpm test:e2e
```

All test runners are **Vitest**. `pnpm test` runs the unit, React, and server projects; `pnpm test:server` selects the server project (`vitest run --project server`) for backend and image-cache checks. `pnpm test:e2e` uses `vitest.browser.config.ts`, Node test fixtures, and the **Playwright library** for desktop/mobile automation against the built Next.js app—not the `@playwright/test` runner. Run the build first. Tests do not deploy anything.

### Verify a release

Use your real production origin and path in the following checks:

```sh
curl --fail https://flowers.example/moment-garden/healthz
curl --fail 'https://flowers.example/moment-garden/?bouquet=1970260fcfb'
```

Use `/healthz` only for a root build; subpath builds expose health under that subpath. Inspect the fetched HTML, not just the live DOM: `og:image` and `twitter:image` must name the public HTTPS versioned PNG for `1970260fcfb`, with no localhost address. Fetch that exact URL, verify HTTP 200, `Content-Type: image/png`, and 1200 × 630 dimensions, then view it to confirm the seeded arrangement on stationery. Try the same timestamp with the `v3-` prefix and confirm its image URL, ETag and bouquet differ. Verify that an invalid shared-page token still loads the app with HTTP 200, default preview metadata, and an invalid-link notice followed by a fresh bouquet. Invalid image tokens should return HTTP 404 without starting Chromium; invalid internal capture tokens should produce the capture-readiness error state instead of a ready image. Re-request a completed image to check the persisted cache path.

In a browser, check that:

- The personal cover loads and **Open your flowers** is enabled.
- Opening the known token reveals **The Last Light**, seeded by timestamp `1748091600123`.
- Replay preserves the arrangement; **Grow another** changes it and removes the old token from the URL.
- **Send flowers** produces a public link under the intended path, not a local address.
- **Save postcard** downloads a PNG of the current bouquet and viewing angle.
- Keyboard and reduced-motion opening show the finished arrangement without waiting.
- There are no failed local asset requests or application errors.
- `manifest.webmanifest`, `sw.js`, fonts, audio, and all four PNGs under `icons/` load from the app path, not the domain root. Manifest identity, launch URL, and scope resolve to the app directory without a seed.
- After service-worker activation and precaching, switch offline, reload, and open another valid bouquet query you have not visited. Both bouquets should retain their original names and seeds. Offline browser use does not generate a new server preview image.
- Use the browser's **Install** or **Add to Home Screen** menu to install. On iPhone or iPad in Safari, use **Share → Add to Home Screen**. The postcard adds no installation button or custom prompt.

Finally, send a real shared link in the target messaging apps. Local tests do not establish crawler reachability, cache refreshes, native sharing behavior, or operating-system installation.

## PWA hosting and update contract

Deploy the whole build together, including `.next/`, the generated `public/manifest.webmanifest` and `public/sw.js`, and public fonts, audio, and icons. In standalone packaging, copy `.next/static` and `public` alongside the generated server. HTTPS is required for installation and service-worker storage; localhost is the development exception. Plain HTTP on a LAN can preview the UI but cannot establish production offline/install behavior. The server sends appropriate asset MIME types and does not rewrite missing JavaScript files to HTML. Preserve those behaviors at the proxy.

After `next build`, `node scripts/build-pwa.ts` uses esbuild to bundle the native TypeScript worker in `src/pwa/sw.ts`. It generates `public/sw.js` and `public/manifest.webmanifest`; both are ignored build outputs, not hand-maintained assets. The precache includes Next.js JS/CSS under `/_next/static/`, lazy rendering chunks, local fonts, icons, and both WAVs under `audio/`, all with the built base-path prefix. Documentation images are not offline dependencies.

Registration resolves `sw.js` under the built app directory and limits its scope to that directory. Home navigations try the network and fall back to the precached shell when offline; arbitrary sibling paths, image routes, and unrelated same-origin apps are not captured. Bouquet queries remain in the address bar for deterministic client generation, but do not create a separate precache per gift. Missing or blocked audio does not prevent opening. If initial precaching fails, the new worker will not activate. Unsupported service workers and storage/registration errors leave the online postcard usable.

The manifest uses stable relative `./` values for identity, start URL, and scope. Installing from a shared bouquet does **not** install that seed as the permanent launch target. Opening the installed app is a fresh visit; save the link or PNG to retain a gift. The theme stays light intentionally: blush browser chrome (`#f5e9e2`) and cream startup background (`#fff9f2`) match the stationery in either OS color scheme.

Updates use the browser's waiting-worker lifecycle: there is no forced `skipWaiting`, client takeover, or reload. Existing windows continue using their current shell and cached lazy chunks. Close **all** app tabs and installed windows, then reopen to activate a waiting release. The native worker uses a build-versioned, scope-namespaced cache and removes this app scope's obsolete caches at activation; it does not clear unrelated origin caches. Preserve revalidation/no-cache for `sw.js` and the manifest, no-store for request-specific HTML, and long-lived immutable caching for fingerprinted assets. Registration bypasses the HTTP cache when checking the worker.

Browser storage is best-effort and may be evicted. Offline availability starts only after successful online worker installation and must be re-established after clearing site data. Where practical, retain old hashed assets briefly to support an already-open page not yet controlled during its first visit; replacing a single container's build does not itself retain those assets.

### Automated PWA checks

`tests/pwa.spec.ts` runs through Vitest with `pnpm test:e2e` after a build. It covers PNG dimensions and manifest identity, production registration, precached Next.js/engine assets, offline reloads and unseen bouquet queries, and waiting-worker updates without re-sealing the current gift or deleting an unrelated cache. A subpath is a separate build configuration, not a runtime relocation of the same build; also build and smoke-test with `NEXT_PUBLIC_BASE_PATH=/moment-garden` when deploying that prefix. Verify Safari home-screen install, standalone safe areas, Android install, and offline launches on physical devices before calling them device-tested.

App icons are committed build inputs. With Node.js 24 and ImageMagick installed, `pnpm pwa:icons` regenerates them. [`src/pwa/generate-icons.ts`](../src/pwa/generate-icons.ts) renders [`public/flowers.svg`](../public/flowers.svg) on cream, with a smaller safe-zone mark for the 512px maskable icon. Outputs are deterministic for the installed ImageMagick renderer; normal builds require no image tooling.

## Updates, troubleshooting, and rollback

For an update, check out the reviewed source, run the tests, then run `docker compose up --build -d` with the same production `NEXT_PUBLIC_BASE_PATH`, `PUBLIC_URL`, and volume. Save the previous source revision or image before replacing it. Verify both health and a real preview render after each release.

- **Blank page or missing Next.js chunks:** the proxy may be serving source files or an incomplete build instead of Next.js. Route to port 3000 and ensure the image includes the standalone server, `.next/static`, and generated `public` files from the same build.
- **Subpath assets, health, or images return 404:** compare the built `NEXT_PUBLIC_BASE_PATH`, runtime `PUBLIC_URL`, and external path. Rebuild after changing the path, and preserve the prefix and query strings at the proxy. Do not strip `/moment-garden/` before forwarding.
- **Preview points at localhost or the wrong host:** correct runtime `PUBLIC_URL`, recreate the container, inspect raw HTML, then request a platform re-scrape. The browser's interactive bouquet is not proof that metadata is correct.
- **Preview returns 429:** the per-process queue or render-start budget is full. Honor `Retry-After`; inspect traffic and add proxy-level controls if needed.
- **Preview returns a retryable error:** inspect `docker compose logs`, Chromium dependencies, available memory, and cache write permissions. The prefixed health endpoint alone does not test rendering. Do not point Chromium at an arbitrary executable unless it is compatible with the installed Playwright version.
- **An old preview appears in a messaging app:** the platform may have cached the old HTML/image URL. Check the public HTML and image independently before requesting a re-scrape.
- **Old app after a successful deployment:** a replacement worker deliberately waits while an older app tab/window remains open. Close all app tabs and installed windows, then reopen online. Do not automatically reload a gift to force updates.
- **Offline fails on a first visit:** load online and allow precaching to finish. Check HTTPS, worker scope, storage policy, and failed assets. Clearing browser data removes offline availability.
- **Rollback:** check out the previous known-good revision and rebuild/recreate with the same `NEXT_PUBLIC_BASE_PATH` and matching `PUBLIC_URL`, or redeploy a saved previous image. Keep the cache volume; versioned cache keys prevent mixing images from different builds. The rolled-back worker follows the same waiting lifecycle. Verify the public shared URL and image again.

A successful build or healthy container is not proof of external publication. Real-device Safari, native sharing, screen-reader behavior, and messaging-app crawlers need separate verification.
