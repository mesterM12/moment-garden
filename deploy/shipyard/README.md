# Deploy to an existing Docker host

This optional template runs Flowers alongside an existing reverse proxy on a shared Docker network. It builds a release-tagged image from an uploaded source directory, publishes a loopback-only port, and keeps preview images in a named volume. It does not provision a host, configure DNS/TLS, or deploy through GitHub Actions. For a standalone installation, use the root [deployment guide](../../docs/DEPLOYMENT.md).

## Configure the host

Install Docker Engine and Compose. Create or select an external Docker network shared with your reverse proxy. Choose a deployment directory and copy `deploy/shipyard/compose.yaml` there as `compose.yaml`; run subsequent Compose commands from that directory.

Create a private `.env` alongside that copy:

```dotenv
FLOWERS_IMAGE=flowers-for-you:release_2026_01
APP_SOURCE=./releases/release_2026_01
PUBLIC_URL=https://flowers.example/
FLOWERS_PORT=8109
FLOWERS_PROXY_NETWORK=tunnel
```

Replace the example release tag, source path, public URL, and network with your values. `PUBLIC_URL` is required and must name your externally reachable HTTPS app URL. This template builds for the domain root. For subpath hosting, adapt the build argument and follow the [base-path requirements](../../docs/DEPLOYMENT.md#production-url-and-reverse-proxy).

The defaults retain the `shipyard-flowers` Compose project, `flowers` container name, loopback port `8109`, and external network `tunnel`. The network must already exist. If those names conflict with another installation, change your local copy before starting it. The proxy can reach `flowers:3000` on the shared network, or a host proxy can use `127.0.0.1:8109`.

An existing installation upgrading from a hard-coded public URL must add `PUBLIC_URL` to its `.env` before using this template. Editing the repository does not modify an installed copy or restart a running service.

## Release manually

1. Run `npm run typecheck`, `npm test`, `npm run build`, and `npm run test:e2e` in your source checkout. Install Playwright Chromium first if needed.
2. Upload a reviewed source snapshot to the configured `APP_SOURCE` directory. Exclude `.git`, dependencies, generated outputs, agent configuration, caches, and private `.env` files. Include `.postcssrc.json`, public fonts and licenses, and the lockfile.
3. Record the source revision and any uncommitted changes included in the snapshot. A revision alone does not identify a dirty working tree. Prefer a clean reviewed revision and a unique image tag for each release.
4. Save the previous `.env` and image tag, then update `FLOWERS_IMAGE` and `APP_SOURCE` for this release.
5. Validate, build, and replace only this application:

   ```sh
   docker compose config --quiet
   docker compose build
   docker compose up -d --no-build --wait --wait-timeout 90
   ```

6. Check the configured loopback health endpoint, then verify the public page and an actual preview image:

   ```sh
   curl --fail http://127.0.0.1:8109/healthz
   curl --fail 'https://flowers.example/?bouquet=1970260fcfb'
   ```

Inspect the raw HTML's `og:image` URL, fetch that PNG, and confirm a second seed produces a different bouquet. Follow the complete [release checks](../../docs/DEPLOYMENT.md#verify-a-release), including browser opening, sharing, saving, and offline behavior. Health alone does not test Chromium.

The container runs as the image's non-root `node` user with a read-only root filesystem, a writable cache volume, bounded `/tmp`, dropped capabilities, and `no-new-privileges`. Chromium uses software WebGL and needs no host GPU. Keep one application process per cache volume.

## Configure the reverse proxy

Route your public hostname to this app without stripping paths or bouquet query strings. Allow unauthenticated access to shared HTML, assets, and preview images so messaging crawlers can fetch them. Preserve `no-store` on gift HTML and immutable caching on versioned preview images and Next.js static assets.

For a tunnel-based proxy, configure both the tunnel's published application route and the reverse proxy's upstream. DNS alone may not establish a tunnel route. Back up and validate proxy changes, then reload using your proxy's documented procedure. Check other hosted applications before and after changes; do not restart unrelated services as part of a Flowers release.

## Roll back only Flowers

Keep the prior image, source snapshot, and `.env`. Restore the previous image/source values and run `docker compose up -d --no-build --wait`. Keep the cache volume, and verify the public shared page and its image again.

If you added proxy or tunnel routes for this installation, revert only those routes when removing it. Do not run Compose commands in an unrelated application's or proxy's directory as part of a Flowers rollback.
