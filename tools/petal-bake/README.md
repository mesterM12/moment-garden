# Baking the petal tissues

[`petal.wgsl`](petal.wgsl) draws a 128 × 128 linear RGBA8 sheet for each tissue, from its socket (`v=0`) to its lip (`v=1`). The offline draw uses Vercel Labs vgpu 0.6.0. None of its channels contain baked light or cultivar color:

| Channel | Content |
| --- | --- |
| RG | Signed relief gradients along the blade's UV axes; 128 encodes a flat slope. Hardware mips average the gradients toward neutral. |
| B | Relative pigment load in and around the vascular bundles, folds and broad mottled regions. |
| A | Tissue packing. Denser tissue absorbs more backlight and changes the shape of the highlight. This channel is not opacity. |

Primary bundles spread unevenly from the insertion. Tapered tributaries leave identified parent bundles and arc toward their neighbors. Pinched shoulders, soft tucks and smaller-scale relief sit over that network; the proportions differ by tissue. Wax has a broad thick midrib and a smoother dielectric highlight. Satin has elongated fibers and finer split bundles. Velvet has raised cellular patches and pigment-colored grazing sheen. Paper has creased pleats and directional fibers rather than a slick lobe.

**Visitors do not run WGSL or need WebGPU.** The [WebGL2 material](../../src/garden/petal-surface.ts) takes one mip-filtered RGBA sample. Its slopes follow the blade using screen-space UV and position derivatives, but it does not differentiate neighboring texture samples across mip levels. Pigment applies channel-relative absorption to the original cultivar and vertex patterns instead of adding painted shade or light. Thin backlit tissue scatters a little pigment-colored light, using the same directional light visibility as reflection (including PCF when enabled). It is an opaque lighting approximation, not another pass. Negative blade UVs opt attached solids out of all four channels and transmission.

The [blade hash](../../src/garden/petal-hand.ts) uses the original stem timestamp, panel and blade to supply two normalized bytes for handedness, bounded UV drift and pigment load. No recipe or animation RNG is consumed. The live scene, saved postcard and OG capture use the same material.

Each family costs 64 KiB of base texels, about 85.3 KiB with its separate mip chain. Four families fit in about 341.3 KiB of GPU texels, excluding driver overhead. [Paeth prediction](../../src/garden/petal-field-codec.ts) makes the base64 payload more compressible in the lazy garden bundle. Only families the renderer encounters are decoded and uploaded. There are no extra draws, runtime texture updates, or network images. The renderer releases the whole texture bank on teardown.

## Reproduce

Use the project's Node and pnpm versions. From the repository root:

```sh
cd tools/petal-bake
pnpm install --frozen-lockfile
pnpm exec vgpu --version                              # 0.6.0
pnpm exec vgpu doctor                                 # native render and readback
pnpm exec vgpu check petal.wgsl --require-validation  # WGSL + reflected binding
node bake.mjs                                         # replace fields after successful checks
node bake.mjs --check                                 # independent draw, byte-exact comparison
```

The writer waits for native compilation, draw, readback and device errors. It checks byte count, unclipped channel range, neutral mean slopes, denser socket pigment, distinct family hashes and the lossless decode round trip. The [generated asset](../../src/garden/petal-field.generated.json) carries the WGSL checksum. `--check` is exact on the same driver; implementations can round differently. Review actual bouquet renders when changing the bake. A native tool is not needed for application builds or visits; the separate manifest and lockfile keep Dawn out of the app.
