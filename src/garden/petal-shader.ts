import { ShaderChunk, type Color, type WebGLProgramParametersWithUniforms } from 'three';

type PetalOptics = {
  absorption: Color;
  pigmentBias: number;
  reverseRoughness: number;
  opticalDepth: number;
  packingRoughness: number;
};

// Insert just after Three has applied directional shadow visibility. Sharing
// directLight.color gives reflection and transmission the *same* PCF result,
// also when shadows are disabled or a receiver opts out. Keep Three's loop,
// guard, and shadow type handling verbatim; a browser probe exercises both
// the no-shadow and PCF variants against the installed Three.
const directionalAnchor = '\t\tgetDirectionalLightInfo( directionalLight, directLight );';
const directAnchor = '\t\tRE_Direct( directLight, geometryPosition, geometryNormal, geometryViewDir, geometryClearcoatNormal, material, reflectedLight );';
const directionalIndex = ShaderChunk.lights_fragment_begin.indexOf(directionalAnchor);
const directIndex = ShaderChunk.lights_fragment_begin.indexOf(directAnchor, directionalIndex);
if (directionalIndex < 0 || directIndex < 0) throw new Error('Three directional light chunk changed; check petal transmission');
const tissueLights = ShaderChunk.lights_fragment_begin.slice(0, directIndex) + `
    reflectedLight.directDiffuse += directLight.color * throughPigment
      * pow2(max(0.0, -dot(nonPerturbedNormal, directLight.direction)));
` + ShaderChunk.lights_fragment_begin.slice(directIndex);

export function shadePetal(shader: WebGLProgramParametersWithUniforms, optics: PetalOptics) {
  shader.uniforms.petalAbsorption = { value: optics.absorption };
  shader.uniforms.petalPigmentBias = { value: optics.pigmentBias };
  shader.uniforms.petalReverseRoughness = { value: optics.reverseRoughness };
  shader.uniforms.petalOpticalDepth = { value: optics.opticalDepth };
  shader.uniforms.petalPackingRoughness = { value: optics.packingRoughness };
  shader.vertexShader = shader.vertexShader.replace('#include <common>', `#include <common>
    attribute vec2 petalHand;
    varying vec3 vPetalBlade;`).replace('#include <uv_vertex>', `#include <uv_vertex>
    vPetalBlade = vec3(uv, petalHand.y);
    // Break repetition inside the blade; its socket and lip remain registered.
    // Solid details sharing the mesh keep their negative UV sentinel.
    float blade = step(0.0, uv.y);
    float bow = 4.0 * uv.y * (1.0 - uv.y) * uv.x * (1.0 - uv.x);
    vBumpMapUv.x += ((petalHand.x - 0.5) * 1.09 * bow + (petalHand.y - 0.5) * .27 * uv.x * (1.0 - uv.x)) * blade;
    vBumpMapUv.y += (petalHand.y - 0.5) * 0.83 * uv.y * (1.0 - uv.y) * blade;
    // Deterministic handedness reverses the whole sheet, not individual veins.
    vBumpMapUv.x = mix(vBumpMapUv.x, 1.0 - vBumpMapUv.x, blade * step(0.5, petalHand.x));`);
  shader.fragmentShader = shader.fragmentShader.replace('#include <common>', `#include <common>
    varying vec3 vPetalBlade;
    uniform vec3 petalAbsorption;
    uniform float petalPigmentBias;
    uniform float petalReverseRoughness;
    uniform float petalOpticalDepth;
    uniform float petalPackingRoughness;`).replace('#include <color_fragment>', `#include <color_fragment>
    float blade = step(0.0, vPetalBlade.y);
    vec4 tissue = texture2D(bumpMap, vBumpMapUv);
    float reverse = gl_FrontFacing ? 0.0 : blade;
    float packing = tissue.a - 0.55;
    // Beer-like relative absorption around a neutral concentration. Rich
    // cultivars deepen toward their own hue; near-neutral petals keep theirs.
    // No painted highlights or replacement of geometry's cultivar gradients.
    float load = blade * (tissue.b - 0.46 + petalPigmentBias + 0.15 * (vPetalBlade.z - 0.5) - 0.04 * reverse);
    diffuseColor.rgb *= exp2(-load * petalAbsorption);`)
    .replace('#include <roughnessmap_fragment>', `#include <roughnessmap_fragment>
      roughnessFactor = clamp(roughnessFactor + blade * petalPackingRoughness * packing + petalReverseRoughness * reverse, 0.28, 1.0);`)
    .replace('#include <normal_fragment_maps>', `
      // Pre-filtered slopes, not derivatives of a varying mip level. The
      // UV Jacobian follows the free blade as it folds and reverses. Use the
      // larger basis length so tapering sockets don't amplify the grain.
      vec2 du = dFdx(vBumpMapUv), dv = dFdy(vBumpMapUv);
      vec3 qx = dFdx(-vViewPosition), qy = dFdy(-vViewPosition);
      vec3 across = cross(qy, normal) * du.x + cross(normal, qx) * dv.x;
      vec3 along = cross(qy, normal) * du.y + cross(normal, qx) * dv.y;
      float scale = inversesqrt(max(1e-18, max(dot(across, across), dot(along, along))));
      vec2 slope = (tissue.rg - vec2(128.0 / 255.0)) * bumpScale;
      normal = normalize(normal - blade * scale * (1.0 - 0.58 * reverse) * (across * slope.x + along * slope.y));`)
    .replace('#include <lights_physical_fragment>', `#include <lights_physical_fragment>
      #ifdef USE_SHEEN
        material.sheenColor *= 1.0 + blade * packing * 0.86 - 0.76 * reverse;
      #endif`)
    .replace('#include <lights_fragment_begin>', `
      #if NUM_DIR_LIGHTS > 0
        float socket = 1.0 - smoothstep(0.04, 0.65, vPetalBlade.y);
        float thin = smoothstep(0.24, 1.0, vPetalBlade.y);
        float depth = petalOpticalDepth * mix(1.40, 0.52, thin) + 1.8 * packing + 1.7 * socket;
        vec3 throughPigment = diffuseColor.rgb * exp2(-depth - 0.24 * petalAbsorption) * (blade * RECIPROCAL_PI);
      #endif
      ${tissueLights}`);
}
