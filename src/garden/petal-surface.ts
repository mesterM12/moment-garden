import * as THREE from 'three';
import field from './petal-field.generated.json';
import { shadePetal } from './petal-shader';
import type { SpeciesKey, Specimen } from './types';

type Tissue = keyof typeof field.fields;
const tissues: Record<SpeciesKey, Tissue> = {
  calla: 'wax', orchid: 'wax', tulip: 'satin', lily: 'satin', iris: 'satin',
  rose: 'velvet', ranunculus: 'velvet', hydrangea: 'velvet', billyButton: 'velvet',
  daisy: 'paper', cosmos: 'paper', anemone: 'paper', poppy: 'paper', sunflower: 'paper', dahlia: 'paper',
};
const profiles = {
  wax:    { roughness: .60, reverseRoughness: .18, specular: .57, sheen: .04, bump: .065, wash: .32, opticalDepth: 2.60 },
  satin:  { roughness: .65, reverseRoughness: .20, specular: .48, sheen: .07, bump: .075, wash: .32, opticalDepth: 1.75 },
  velvet: { roughness: .79, reverseRoughness: .17, specular: .32, sheen: .10, bump: .065, wash: .36, opticalDepth: 2.20 },
  paper:  { roughness: .73, reverseRoughness: .15, specular: .34, sheen: .05, bump: .055, wash: .30, opticalDepth: 1.20 },
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
  const profile = profiles[tissues[key]];
  const mat = new THREE.MeshPhysicalMaterial({
    vertexColors: true, side: THREE.DoubleSide, roughness: profile.roughness,
    specularIntensity: profile.specular,
    sheen: profile.sheen, sheenColor: palette.tip, sheenRoughness: .90,
    bumpMap: fields.forSpecies(key), bumpScale: profile.bump,
  });
  const optics = { ...profile, root: new THREE.Color(palette.root) };
  mat.onBeforeCompile = shader => shadePetal(shader, optics);
  return mat;
}
