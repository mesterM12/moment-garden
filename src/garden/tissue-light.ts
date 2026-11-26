import { ShaderChunk } from 'three';

/** Extend Three's directional lighting loop *after* it resolves visibility.
 * Transmitted light then uses the same shadow sample as reflected light, even
 * for a moving blocker or a non-receiving mesh; no second PCF tap or loop. */
export function withTissueTransmission(term: string): string {
  const chunk = ShaderChunk.lights_fragment_begin;
  const start = chunk.indexOf('getDirectionalLightInfo( directionalLight, directLight );');
  const direct = chunk.indexOf('RE_Direct( directLight,', start);
  if (start < 0 || direct < 0) throw new Error('Three directional light chunk changed; check tissue transmission');
  return chunk.slice(0, direct) + `reflectedLight.directDiffuse += directLight.color * ${term}
    * pow2(max(0.0, -dot(nonPerturbedNormal, directLight.direction)));\n` + chunk.slice(direct);
}
