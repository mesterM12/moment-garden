import * as THREE from 'three';
import field from './petal-field.generated.json';
import { decodePetalBytes } from './petal-field-codec';
import { shadePetal } from './petal-shader';
import type { SpeciesKey, Specimen } from './types';

type Tissue = keyof typeof field.fields;
const tissues: Record<SpeciesKey, Tissue> = {
  calla: 'wax', orchid: 'wax', tulip: 'satin', lily: 'satin', iris: 'satin',
  rose: 'velvet', ranunculus: 'velvet', hydrangea: 'velvet', billyButton: 'velvet',
  daisy: 'paper', cosmos: 'paper', anemone: 'paper', poppy: 'paper', sunflower: 'paper', dahlia: 'paper',
};
const profiles = {
  wax:    { roughness: .43, reverseRoughness: .17, specular: .74, sheen: 0, bump: 2.35, opticalDepth: 2.75, packingRoughness: -.23 },
  satin:  { roughness: .56, reverseRoughness: .16, specular: .47, sheen: .10, bump: 2.65, opticalDepth: 1.92, packingRoughness: -.14 },
  velvet: { roughness: .83, reverseRoughness: .11, specular: .22, sheen: .29, bump: 3.90, opticalDepth: 2.38, packingRoughness: .28 },
  paper:  { roughness: .76, reverseRoughness: .13, specular: .29, sheen: 0, bump: 3.30, opticalDepth: 1.16, packingRoughness: .28 },
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
        const bytes = decodePetalBytes(field.fields[tissue], field.width);
        texture = new THREE.DataTexture(bytes, field.width, field.height, THREE.RGBAFormat);
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
  const profile = profiles[tissues[key]];
  const mat = new THREE.MeshPhysicalMaterial({
    vertexColors: true, side: THREE.DoubleSide, roughness: profile.roughness,
    specularIntensity: profile.specular,
    sheen: profile.sheen, sheenColor: palette.tip, sheenRoughness: .90,
    bumpMap: fields.forSpecies(key),
    // A dahlia's tightly rolled ribbon already has stronger transverse relief
    // than an open paper ray; don't emboss it twice.
    bumpScale: profile.bump * (key === 'dahlia' ? .71 : 1),
  });
  // Relative channel absorption of the cultivar, computed once per material.
  // A shared floor gives ivory petals structure without painting in gray or red.
  const absorption = new THREE.Color(palette.base);
  const peak = Math.max(absorption.r, absorption.g, absorption.b);
  const chroma = peak - Math.min(absorption.r, absorption.g, absorption.b);
  absorption.setRGB(
    1.05 + 1.45 * chroma + 2.65 * (peak - absorption.r),
    1.05 + 1.45 * chroma + 2.65 * (peak - absorption.g),
    1.05 + 1.45 * chroma + 2.65 * (peak - absorption.b),
  );
  const optics = { ...profile, absorption, pigmentBias: .13 * chroma };
  mat.onBeforeCompile = shader => shadePetal(shader, optics);
  return mat;
}
