# Baking the petal tissues

[`petal.wgsl`](petal.wgsl) describes a sheet from its socket (v=0) to its lip (v=1). R is surface relief; G is pigment density. Both are linear data, not sRGB colour. The authoring script draws the same 64 × 96 **RG8** offscreen target four times with **Vercel Labs vgpu 0.6.0**, selecting a tissue by uniform:

| Tissue | Drawing in the bake | On the bouquet |
| --- | --- | --- |
| Wax | Broad fleshy midrib and fading arcuate capillaries | Calla spathes and orchid wings |
| Satin | Lengthwise bundles that split toward the shoulder | Tulip, lily and iris tepals |
| Velvet | Diagonal tributaries and softly uneven tissue | Rose, ranunculus and clustered florets |
| Paper | Flutes with irregular widths, spreading toward the lip | Rays, dahlia rolls and open poppy/anemone bowls |

**Visitors never run WGSL or need WebGPU.** The [WebGL2 petal material](../../src/garden/petal-surface.ts) uses a single filtered RG lookup, differentiating relief for the normal and mixing pigment with the recipe's original vertex colours. Warm bounce is limited to thin margins facing away from the key; it is an opaque lighting approximation, not a second transmission render. Veins stay on the moving petal rather than being projected onto the screen. Joined beard grains, spadices and other solid details opt out.

The stem timestamp already identifies its bouquet slot. A [separate hash](../../src/garden/petal-hand.ts) of that timestamp, panel and blade provides two normalized bytes for vein drift and pigment per blade, even across a merged whorl. Other bits vary the tilt of a rose guard, the curl of a tulip shoulder or the flare of a calla. No recipe or animation RNG is consumed. The live scene, saved postcard and OG capture all use the same meshes and lighting.

The four fields total 48 KiB before mipmaps and travel in the lazy garden bundle (base64). Each tissue has its own clamp-to-edge mip chain: no padding, atlas bleed or per-species fetch. Only families encountered by the mounted renderer are decoded and uploaded, once each. The worst case is about 64 KiB of RG8 texels including mipmaps, excluding driver overhead. The blade identity costs two bytes per petal vertex and no draw call. There are no ongoing texture updates. Renderer teardown releases every field, not just those in the current bouquet.

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

The writer waits for native compilation, draw, readback and device errors. It checks the byte count, unclipped range, higher density at the socket than the tip, and four distinct field hashes. The [generated asset](../../src/garden/petal-field.generated.json) carries the WGSL checksum. `--check` is exact on the same driver; implementations can round differently. Review the actual bouquet before accepting a new bake. Without a usable native device, use the checked-in asset. No native tool is needed for app builds, offline visits or the production container.

The separate manifest and lockfile keep Dawn out of the app. Consult this installed CLI's `vgpu docs cat no-bundler`, `shader-workflow`, `texture-formats`, `/vgpu/effect.docs.md`, `/vgpu/target.docs.md` and `/vgpu/core/texture.docs.md` for the authoring API. There is no WGSL loader or TSL material in the browser bundle.
