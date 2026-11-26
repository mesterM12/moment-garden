import type { Color, WebGLProgramParametersWithUniforms } from 'three';

type PetalOptics = {
  root: Color;
  wash: number;
  reverseRoughness: number;
  opticalDepth: number;
};

export function shadePetal(shader: WebGLProgramParametersWithUniforms, optics: PetalOptics) {
  shader.uniforms.petalRoot = { value: optics.root };
  shader.uniforms.petalWash = { value: optics.wash };
  shader.uniforms.petalReverseRoughness = { value: optics.reverseRoughness };
  shader.uniforms.petalOpticalDepth = { value: optics.opticalDepth };
  shader.vertexShader = shader.vertexShader.replace('#include <common>', `#include <common>
    attribute vec2 petalHand;
    varying vec3 vPetalBlade;`).replace('#include <uv_vertex>', `#include <uv_vertex>
    vPetalBlade = vec3(uv, petalHand.y);
    // Move the veins within each blade, not the lip or the socket. Solid
    // details (e.g. the calla's spadix) keep their negative UV sentinel.
    float blade = step(0.0, uv.y);
    float bow = 4.0 * uv.y * (1.0 - uv.y) * uv.x * (1.0 - uv.x);
    vBumpMapUv.x += (petalHand.x - 0.5) * 0.68 * bow * blade;
    vBumpMapUv.y += (petalHand.y - 0.5) * 0.36 * uv.y * (1.0 - uv.y) * blade;`);
  shader.fragmentShader = shader.fragmentShader.replace('#include <common>', `#include <common>
    varying vec3 vPetalBlade;
    uniform vec3 petalRoot;
    uniform float petalWash;
    uniform float petalReverseRoughness;
    uniform float petalOpticalDepth;`).replace('#include <color_fragment>', `#include <color_fragment>
    float blade = step(0.0, vPetalBlade.y);
    vec2 tissue = texture2D(bumpMap, vBumpMapUv).rg;
    float density = smoothstep(0.12, 0.79, tissue.g);
    float socket = 1.0 - smoothstep(0.05, 0.65, vPetalBlade.y);
    float reverse = gl_FrontFacing ? 0.0 : blade;
    float blush = petalWash * (0.38 * socket + 0.62 * density) * mix(0.78, 1.20, vPetalBlade.z);
    diffuseColor.rgb = mix(diffuseColor.rgb, petalRoot, blade * blush);
    diffuseColor.rgb *= 1.0 - blade * (0.10 * socket + 0.06 * density);`)
    .replace('#include <roughnessmap_fragment>', `#include <roughnessmap_fragment>
      roughnessFactor = clamp(roughnessFactor + blade * (0.12 * density - 0.045) + petalReverseRoughness * reverse, 0.23, 1.0);`)
    // Reuse the filtered height lookup: no extra samples for the slopes.
    .replace('#include <normal_fragment_maps>', `vec2 relief = vec2(dFdx(tissue.r), dFdy(tissue.r));
      vec3 grainNormal = perturbNormalArb(-vViewPosition, normal, bumpScale * (1.0 - 0.50 * reverse) * relief, faceDirection);
      normal = blade > 0.0 ? grainNormal : normal;`)
    .replace('#include <lights_fragment_end>', `#include <lights_fragment_end>
      #if NUM_DIR_LIGHTS > 0
        // Both the distal lip and the free sides thin; the buried socket and
        // dark vascular bundles (G) absorb more. Use unwarped blade UVs for
        // the shape and the same mip-filtered sample as the reflected color.
        float lip = smoothstep(0.60, 1.0, vPetalBlade.y);
        float side = smoothstep(0.33, 0.50, abs(vPetalBlade.x - 0.50)) * (1.0 - socket);
        float margin = lip + side - lip * side;
        float depth = petalOpticalDepth * mix(1.55, 0.50, margin) + 1.65 * density + 1.35 * socket;
        float transmittance = blade * exp2(-depth);
        // Attenuate the existing cultivar color, especially the channels
        // its pigment already absorbs. No independent cream highlight.
        vec3 transmittedPigment = diffuseColor.rgb * mix(vec3(0.55), sqrt(clamp(diffuseColor.rgb, 0.0, 1.0)), 0.45);
        vec3 through = vec3(0.0);
        #pragma unroll_loop_start
        for ( int i = 0; i < NUM_DIR_LIGHTS; i ++ ) {
          // The light vectors and the face-oriented, unbumped normal are
          // already in view space. Grazing rays expose less area and have a
          // longer path. No view/Fresnel term, emissive color or screen pass.
          through += directionalLights[ i ].color * pow2(max(0.0, -dot(nonPerturbedNormal, directionalLights[ i ].direction)));
        }
        #pragma unroll_loop_end
        reflectedLight.directDiffuse += through * (RECIPROCAL_PI * transmittance) * transmittedPigment;
      #endif`);
}
