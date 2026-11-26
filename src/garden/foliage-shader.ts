import type { WebGLProgramParametersWithUniforms } from 'three';

// Mode, upper cuticle roughness, lamina permeability, spatial pigment variance.
export type LeafSkin = readonly [mode: number, roughness: number, permeability: number, mottling: number];

// Height in scene units; view-position derivatives already include the pose.
const surfaceRelief = /* glsl */`
  vec3 greenRelief(vec3 p, vec3 n, float height) {
    vec3 dx = dFdx(p), dy = dFdy(p);
    vec3 x = cross(dy, n), y = cross(n, dx);
    float det = dot(dx, x);
    vec3 grad = dFdx(height) * x + dFdy(height) * y;
    return normalize(max(abs(det), 1e-8) * n - sign(det) * grad);
  }`;

export function shadeFoliage(shader: WebGLProgramParametersWithUniforms, skin: LeafSkin) {
  shader.uniforms.leafSkin = { value: skin };
  shader.vertexShader = shader.vertexShader.replace('#include <common>', `#include <common>
    attribute vec3 leafTissue;
    varying vec3 vLeafTissue;`).replace('#include <uv_vertex>', `#include <uv_vertex>
    vLeafTissue = leafTissue;`);
  shader.fragmentShader = shader.fragmentShader.replace('#include <common>', `#include <common>
    uniform vec4 leafSkin;
    varying vec3 vLeafTissue;

    float leafStripe(float distanceFromVein, float width, float pixelWidth) {
      float aa = max(pixelWidth * 0.64, 0.0001);
      return (1.0 - smoothstep(max(width - aa, 0.0), width + aa, abs(distanceFromVein))) * min(1.0, width / aa);
    }

    float leafNoise(vec2 p) {
      vec2 i = floor(p), f = fract(p);
      f = f * f * (3.0 - 2.0 * f);
      vec4 h = fract(vec4(i.x, i.x + 1.0, i.x, i.x + 1.0) * 0.1031 +
                    vec4(i.y, i.y, i.y + 1.0, i.y + 1.0) * 0.11369);
      h = fract(h * (19.19 + h) * (h + h));
      return mix(mix(h.x, h.y, f.x), mix(h.z, h.w, f.x), f.y);
    }

    ${surfaceRelief}`).replace('#include <color_fragment>', `#include <color_fragment>
    float blade = step(0.0, vLeafTissue.z);
    float reverse = gl_FrontFacing ? 0.0 : blade;
    float s = vLeafTissue.x, t = vLeafTissue.y, flank = abs(s), hand = vLeafTissue.z;
    vec2 pixel = fwidth(vec2(s, t));
    float emerging = smoothstep(0.0, 0.22, t);
    float taper = 1.0 - smoothstep(0.72, 1.0, t);
    float edge = smoothstep(0.86, 1.0, flank);
    float field = emerging * taper * (1.0 - edge);
    float midrib = leafStripe(s, mix(0.047, 0.012, t), pixel.x) * (1.0 - smoothstep(0.85, 1.0, t));
    float mode = leafSkin.x;
    float ribs = 0.0, fineRibs = 0.0;
    if (mode < 1.5 || mode > 3.5) {
      // Adjacent ribs arise at staggered sockets and curve toward the tip.
      // Near the margin the main ribs fade, and fine forks take over.
      float course = (t - (0.16 * flank + 0.19 * flank * flank)) * mix(6.3, 7.8, hand)
                   + s * (0.19 + 0.12 * sin(t * 17.0 + hand * 6.28)) + 0.18 * sin(14.0 * t + hand * 6.28);
      float ribWidth = mix(0.112, 0.032, flank) * mix(1.0, 0.62, t);
      ribs = leafStripe(fract(course + 0.5) - 0.5, ribWidth, fwidth(course)) * field;
      float fork = course + 0.48 * smoothstep(0.30, 0.99, flank);
      fineRibs = leafStripe(fract(fork + 0.5) - 0.5, 0.032, fwidth(fork)) * field * smoothstep(0.27, 0.62, flank);
      if (mode > 0.5 && mode < 1.5) {
        float ray = t - (0.045 + 0.39 * flank + 0.045 * flank * flank) + 0.031 * s;
        float basal = leafStripe(ray, mix(0.029, 0.007, flank), fwidth(ray)) * (1.0 - edge);
        ribs = max(ribs * mix(0.35, 1.0, smoothstep(0.10, 0.48, t)), 0.90 * basal);
      }
      if (mode > 3.5) {
        float collecting = flank - (0.92 + 0.025 * sin(19.0 * t + hand));
        fineRibs = max(fineRibs, 0.56 * leafStripe(collecting, 0.017, fwidth(collecting)) * emerging * taper);
      }
    } else if (mode < 2.5) {
      // Longitudinal bundles fan out with the blade, not across it. This also
      // lets a clasp pass directly from collar to blade without a UV seam.
      float rail = s * (4.3 + 0.36 * sin(t * 2.4 + hand)) + 0.13 * sin(5.7 * t + hand + s);
      ribs = leafStripe(fract(rail + 0.5) - 0.5, 0.083, fwidth(rail)) * field * smoothstep(0.10, 0.26, flank);
      fineRibs = leafStripe(fract(rail * 2.0) - 0.5, 0.073, 2.0 * fwidth(rail)) * field * 0.65;
    } else {
      // The cosmos divisions are too narrow for a separate branch network.
      midrib *= 0.36;
    }
    vec2 cells = vec2(19.0 * s, 36.0 * t) + vec2(hand * 11.0, hand * 17.0);
    float footprint = max(19.0 * pixel.x, 36.0 * pixel.y);
    float pigment = leafNoise(cells * 0.21) - 0.5;
    float grain = 0.0;
    if (footprint < 1.1) grain = (leafNoise(cells) - 0.5) * (1.0 - smoothstep(0.36, 1.1, footprint));
    float vein = max(midrib, 0.68 * ribs);
    // Adaxial tissue is chlorophyll-rich; the less glossy reverse has more
    // visible bundles and a muted blue-green cast, not a solid pale paint.
    diffuseColor.rgb *= 1.0 + blade * (leafSkin.w * (pigment + 0.32 * grain) - 0.078 * edge);
    diffuseColor.rgb *= mix(vec3(1.0), vec3(1.19, 1.25, 1.47), reverse);
    diffuseColor.rgb *= 1.0 + blade * (mix(0.26, 0.43, reverse) * midrib + mix(0.24, 0.40, reverse) * ribs + 0.10 * fineRibs);
    diffuseColor.rb *= vec2(1.0) + blade * vein * vec2(0.19, 0.07);`)
    .replace('#include <roughnessmap_fragment>', `#include <roughnessmap_fragment>
      float freshCuticle = clamp(leafSkin.y + 0.10 * pigment + 0.08 * edge + 0.04 * vein, 0.29, 0.89);
      roughnessFactor = mix(roughnessFactor, mix(freshCuticle, min(0.95, freshCuticle + 0.23), reverse), blade);`)
    .replace('#include <normal_fragment_maps>', `#include <normal_fragment_maps>
      float bundles = 0.00063 * midrib + 0.00032 * ribs + 0.00009 * fineRibs;
      float height = blade * (bundles * mix(0.54, 1.0, reverse) + (0.00017 + 0.00035 * leafSkin.y) * grain);
      normal = greenRelief(-vViewPosition, normal, height);`)
    .replace('#include <lights_fragment_end>', `#include <lights_fragment_end>
      #if NUM_DIR_LIGHTS > 0
        // Only real light on the far side reaches the viewer. More light
        // passes through thin distal/marginal tissue than vascular bundles.
        float thin = smoothstep(0.20, 0.92, t) + 0.48 * edge;
        float throughLeaf = blade * leafSkin.z * (0.18 + 0.65 * thin) * (1.0 - 0.73 * vein);
        vec3 through = vec3(0.0);
        #pragma unroll_loop_start
        for ( int i = 0; i < NUM_DIR_LIGHTS; i ++ ) {
          through += directionalLights[ i ].color * pow2(max(0.0, -dot(nonPerturbedNormal, directionalLights[ i ].direction)));
        }
        #pragma unroll_loop_end
        reflectedLight.directDiffuse += through * (RECIPROCAL_PI * throughLeaf) * diffuseColor.rgb * vec3(0.72, 0.92, 0.36);
      #endif`);
}

export function shadeCutStem(shader: WebGLProgramParametersWithUniforms) {
  shader.vertexShader = shader.vertexShader.replace('#include <common>', `#include <common>
    attribute vec3 stemTissue;
    varying vec3 vStemTissue;`).replace('#include <uv_vertex>', `#include <uv_vertex>
    vStemTissue = stemTissue;`);
  shader.fragmentShader = shader.fragmentShader.replace('#include <common>', `#include <common>
    varying vec3 vStemTissue;
    ${surfaceRelief}`).replace('#include <color_fragment>', `#include <color_fragment>
    float cut = step(0.5, vStemTissue.z);
    vec2 tissue = vStemTissue.xy;
    // Along the skin, the fibres gently waver and fade with screen footprint.
    // Both phases wrap to the same value at the duplicate tube seam.
    float skinPhase = 6.2831853 * (14.0 * tissue.x + 0.075 * sin(tissue.y * 23.0 + 6.2831853 * tissue.x));
    float pores = 0.0, stria = 0.0;
    if (cut < 0.5) {
      float footprint = fwidth(skinPhase);
      if (footprint < 3.1) {
        stria = sin(skinPhase) * (1.0 - smoothstep(1.0, 3.1, footprint));
        stria *= 0.86 + 0.14 * sin(tissue.y * 31.0 + 6.2831853 * tissue.x * 3.0);
      }
    } else {
      // A compressed, off-centre cambium ring and small broken vascular pores
      // around the pith. Cartesian cut coordinates avoid a pinched UV pole.
      float r = length(tissue * vec2(0.98, 1.03) + vec2(0.018, -0.013));
      float ring = 1.0 - smoothstep(0.004, 0.035 + fwidth(r), abs(r - 0.73));
      float fiber = sin(45.0 * tissue.x + 24.0 * tissue.y) * sin(40.0 * tissue.y - 32.0 * tissue.x);
      pores = ring * (0.34 + 0.66 * smoothstep(0.30, 0.95, fiber)) * (1.0 - smoothstep(0.026, 0.15, fwidth(r)));
    }
    diffuseColor.rgb *= 1.0 + 0.11 * stria - 0.26 * pores;`)
    .replace('#include <roughnessmap_fragment>', `#include <roughnessmap_fragment>
      roughnessFactor = mix(roughnessFactor - 0.057 * stria, 0.78 + 0.14 * pores, cut);`)
    .replace('#include <normal_fragment_maps>', `#include <normal_fragment_maps>
      normal = greenRelief(-vViewPosition, normal, 0.00009 * stria - 0.00018 * pores);`);
}
