# Botanical realism proof

From a checkout with a private `pnpm install --frozen-lockfile` and Playwright Chromium installed (`pnpm exec playwright install chromium` if missing), run the app on loopback:

```sh
pnpm dev --port 4331
```

In another terminal in the **same checkout**, run:

```sh
node tools/realism-proof.mjs http://127.0.0.1:4331/ /tmp/flowers-realism-proof/baseline
```

For a candidate, stop the baseline server, start the app from the candidate checkout, and run the **same tool** there against a new directory. The last argument locks the comparison to the baseline’s cameras, crops, and pixels:

```sh
node tools/realism-proof.mjs http://127.0.0.1:4331/ /tmp/flowers-realism-proof/candidate /tmp/flowers-realism-proof/baseline
```

Keep the output outside Git. Use empty output directories; a failed run may leave partial output. No additional image tools are required.

- `all-species.jpg` and `01-…` through `07-…`: 15 diagnostic heads in 288 × 288 lossless source frames, grouped into review families. Candidate family sheets put before on the left and after on the right. Each head comes from an explicit v3 token and slot, including species that never lead a v3 cut. The proof fails instead of substituting a changed token or slot. It builds the **whole production bouquet** and uses the production geometry, poses, textures, materials, renderer, and lights. Only visibility and the orthographic diagnostic lens are overridden: other heads, stems, leaves, and binding are hidden. A slot’s half beat is halfway through its own opening window, not halfway through the global clock or a guarantee that 50% of the surface has opened. Half and mature face share the same lens and scale. The mature oblique view turns around the head axis; tulip and calla start more side-on to show their openings. Candidate crops with out-of-frame vertices are flagged; run a fresh proof without baseline crops to inspect the full silhouette. These are **not** production postcard framings or evidence of bouquet clearance.
- `actual-postcards.jpg`: five actual mobile-size postcard stages, opened with Enter, then turned five keyboard steps. The browser runs the real app, so no diagnostic isolation or lens applies. PNGs are under `postcards/`; the sheet fits them to equal-size cells. This is a Chromium mobile viewport, not a phone.
- `proof.json`: revision and dirty paths, exact host/runtime/GL configuration, diagnostic crops and capture sources, and measurements for five representative v3 cuts. Full bouquets (including foliage and binding) run at 390 × 480, DPR 1 with the real bloom framer in the detached harness. It measures plan and build CPU time, then the first pose/framing/WebGL draw and a warmed sample at each of `p=.24/.50/.78/1`. `submitMs` is elapsed through `renderer.render`; `readbackMs` also includes a synchronous full-buffer RGBA read into an allocated-once typed array. Both include pose/framing but exclude React, input, audio, and presentation. `first` is the first paint of that bouquet, not cold browser or app-open latency; renderer and texture setup is logged once. Each seed has three builds and five warm measurements per beat/build. Three.js counts are submitted draws and triangles after frustum culling (including instances), not visible geometry counts. Timings are **headless Chromium + explicitly forced SwiftShader software WebGL** and can vary with host load, build order, JS/driver caches, and timer precision. Use medians/ranges as local regression signals; don't report them as mobile fps or physical GPU costs.
