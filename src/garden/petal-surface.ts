import * as THREE from 'three';
import field from './petal-field.generated.json';
import type { SpeciesKey, Specimen } from './types';

type Tissue = keyof typeof field.fields;
const tissues: Record<SpeciesKey, Tissue> = {
  calla: 'wax', orchid: 'wax', tulip: 'satin', lily: 'satin', iris: 'satin',
  rose: 'velvet', ranunculus: 'velvet', hydrangea: 'velvet', billyButton: 'velvet',
  daisy: 'paper', cosmos: 'paper', anemone: 'paper', poppy: 'paper', sunflower: 'paper', dahlia: 'paper',
};
const fabrics = {
  wax:    { roughness: .48, sheen: .10, bump: .085, wash: .48, rim: .28 },
  satin:  { roughness: .61, sheen: .20, bump: .105, wash: .45, rim: .27 },
  velvet: { roughness: .88, sheen: .26, bump: .11, wash: .54, rim: .15 },
  paper:  { roughness: .77, sheen: .12, bump: .065, wash: .44, rim: .23 },
};

// Independent mip chains: never borrow another species' colour at distant
// LODs. Decode on first use, share across bouquets, release with the renderer.
export function petalFields(anisotropy: number) {
  const textures = new Map<Tissue, THREE.DataTexture>();
  return {
    forSpecies(key: SpeciesKey) {
      const tissue = tissues[key];
      let texture = textures.get(tissue);
      if (!texture) {
        const bytes = Uint8Array.from(atob(field.fields[tissue]), c => c.charCodeAt(0));
        texture = new THREE.DataTexture(bytes, field.width, field.height, THREE.RGFormat);
        texture.name = `Petal tissue / ${tissue}`;
        texture.magFilter = THREE.LinearFilter;
        texture.minFilter = THREE.LinearMipmapLinearFilter;
        texture.generateMipmaps = true;
        texture.anisotropy = anisotropy;
        texture.needsUpdate = true;
        textures.set(tissue, texture);
      }
      return texture;
    },
    dispose() { textures.forEach(texture => texture.dispose()); textures.clear(); },
  };
}

export function petalSurface({ key, palette }: Specimen, fields: ReturnType<typeof petalFields>) {
  const f = fabrics[tissues[key]];
  const mat = new THREE.MeshPhysicalMaterial({
    vertexColors: true, side: THREE.DoubleSide, roughness: f.roughness,
    sheen: f.sheen, sheenColor: palette.tip, sheenRoughness: .83,
    bumpMap: fields.forSpecies(key), bumpScale: f.bump,
  });
  const root = new THREE.Color(palette.root);
  const rim = new THREE.Color(palette.tip).lerp(new THREE.Color('#ffebcc'), f.rim);
  mat.onBeforeCompile = shader => {
    shader.uniforms.petalRoot = { value: root };
    shader.uniforms.petalRim = { value: rim };
    shader.uniforms.petalWash = { value: f.wash };
    shader.vertexShader = shader.vertexShader.replace('#include <common>', `#include <common>
      attribute vec2 petalHand;
      varying vec2 vPetalHand;`).replace('#include <uv_vertex>', `#include <uv_vertex>
      vPetalHand = petalHand;
      // Shear the internal veins, not the lip or the socket. Solid attached
      // details keep their constant negative UVs (no pigment or relief).
      float bow = 4.0 * uv.y * (1.0 - uv.y) * uv.x * (1.0 - uv.x);
      vBumpMapUv.x += (petalHand.x - 0.5) * 0.68 * bow * step(0.0, uv.y);
      vBumpMapUv.y += (petalHand.y - 0.5) * 0.36 * uv.y * (1.0 - uv.y) * step(0.0, uv.y);`);
    shader.fragmentShader = shader.fragmentShader.replace('#include <common>', `#include <common>
      varying vec2 vPetalHand;
      uniform vec3 petalRoot;
      uniform vec3 petalRim;
      uniform float petalWash;`).replace('#include <color_fragment>', `#include <color_fragment>
      float blade = step(0.0, vBumpMapUv.y);
      vec2 tissue = texture2D(bumpMap, vBumpMapUv).rg;
      float density = smoothstep(0.10, 0.86, tissue.g);
      float socket = 1.0 - smoothstep(0.08, 0.68, vBumpMapUv.y);
      float blush = petalWash * density * mix(0.77, 1.22, vPetalHand.y);
      diffuseColor.rgb = mix(diffuseColor.rgb, petalRoot * 0.58, blade * blush);
      diffuseColor.rgb *= 1.0 - blade * (0.20 * socket + 0.12 * density);
      float edge = max(abs(2.0 * vBumpMapUv.x - 1.0), vBumpMapUv.y);
      float margin = smoothstep(0.78, 1.0, edge) * (1.0 - density) * (1.0 - socket) * blade;
      float reverse = gl_FrontFacing ? 0.0 : blade;
      diffuseColor.rgb = mix(diffuseColor.rgb, petalRim, margin * (0.032 + 0.055 * vPetalHand.x));`)
      // Pigment-rich folds and the dull underside break the broad wax highlight.
      .replace('#include <roughnessmap_fragment>', `#include <roughnessmap_fragment>
        roughnessFactor = clamp(roughnessFactor + blade * (0.14 * density - 0.065) + 0.10 * reverse, 0.23, 1.0);`)
      // Derive slopes from the same filtered RG lookup instead of doing
      // three more height fetches. Minified tissue softens with distance.
      .replace('#include <normal_fragment_maps>', `normal = perturbNormalArb(-vViewPosition, normal,
        blade * bumpScale * (1.0 - 0.4 * reverse) * vec2(dFdx(tissue.r), dFdy(tissue.r)), faceDirection);`)
      .replace('#include <lights_fragment_end>', `#include <lights_fragment_end>
        // Warm bounce through the thin, grazing margin; not a glow or a
        // transmission pass. The underside away from the key receives most.
        #if NUM_DIR_LIGHTS > 0
          float back = max(0.0, -dot(normal, directionalLights[0].direction));
          float thin = blade * (1.0 - socket) * (1.0 - density);
          vec3 scattered = mix(diffuseColor.rgb, petalRim, 0.10);
          reflectedLight.indirectDiffuse += scattered * directionalLights[0].color * back * thin * (0.085 + 0.08 * margin);
        #endif`);
  };
  return mat;
}
