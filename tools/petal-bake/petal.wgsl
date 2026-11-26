// Palette-independent sheets. Linear R = relief, G = optical density.
// Author each at the same scale, socket first. No baked light direction.
struct Spec { family: u32 }
@group(0) @binding(0) var<uniform> spec: Spec;

fn hash(p: vec2u) -> f32 {
  var n = (p.x * 1597334677u) ^ (p.y * 3812015801u);
  n = (n ^ (n >> 16u)) * 2246822519u;
  return f32(n >> 8u) / 16777216.0;
}
fn wash(p: vec2f) -> f32 {
  let i = vec2u(floor(p));
  let f = smoothstep(vec2f(0), vec2f(1), fract(p));
  return mix(mix(hash(i), hash(i + vec2u(1, 0)), f.x),
             mix(hash(i + vec2u(0, 1)), hash(i + vec2u(1, 1)), f.x), f.y);
}
fn rib(d: f32, w: f32) -> f32 { return 1.0 - smoothstep(0.0, w, abs(d)); }
fn cord(phase: f32, w: f32) -> f32 { return rib(fract(phase + 0.5) - 0.5, w); }

@fragment fn fs_main(@location(0) uv: vec2f) -> @location(0) vec4f {
  let v = uv.y;
  let s = 2.0 * uv.x - 1.0;
  let tide = wash(uv * vec2f(5, 4));
  let cell = wash(uv * vec2f(30, 20));
  let spine = s + 0.045 * sin(4.1 * v) * v;
  let belly = sin(3.14159 * v);
  let basal = 1.0 - smoothstep(0.02, 0.8, v);
  let margin = smoothstep(0.80, 1.0, abs(s)) * v;
  var h: f32;
  var pigment: f32;
  switch spec.family {
    case 0u: { // Spathe: broad fleshy rib; arcuate capillaries, nearly lost at the porcelain lip.
      let midrib = rib(spine + 0.15 * v, 0.27);
      let arc = abs(spine) * (3.7 - 1.15 * v) + 0.30 * sin(4.3 * v) + 0.13 * tide;
      let traces = cord(arc, 0.24) * (0.35 + 0.65 * basal);
      h = 0.26 + 0.37 * midrib + 0.085 * traces + 0.09 * tide;
      pigment = 0.10 + 0.53 * basal + 0.15 * midrib + 0.19 * traces + 0.075 * tide;
    }
    case 1u: { // Satin tepals: long vascular bundles split into finer threads above the shoulder.
      let lane = spine * (3.5 + 1.1 * (1.0 - v)) + 0.22 * sin(5.0 * v + spine * 2.0) + 0.16 * tide;
      let split = smoothstep(0.23, 0.8, v) * sign(spine);
      let veins = max(cord(lane, 0.21), 0.61 * abs(split) * cord(lane - 0.44 * split, 0.15));
      let flute = 0.5 + 0.5 * cos(lane * 6.28318);
      h = 0.23 + 0.21 * flute + 0.20 * veins + 0.075 * tide + 0.045 * cell;
      pigment = 0.10 + 0.42 * basal + (0.11 + 0.16 * belly) * veins + 0.15 * flute + 0.11 * tide;
    }
    case 2u: { // Velvet: diagonal tributaries emerge from a shallow midrib into soft cellular tissue.
      let midrib = rib(spine, 0.12 + 0.06 * v);
      let side = abs(spine);
      let arch = 3.8 * v - side * (1.65 - 0.60 * side) + 0.27 * tide + 0.18 * spine;
      let veins = cord(arch, 0.20) * smoothstep(0.02, 0.26, side) * (1.0 - 0.65 * margin);
      h = 0.23 + 0.18 * midrib + 0.15 * veins + 0.21 * tide + 0.13 * cell;
      pigment = 0.10 + 0.37 * basal + 0.12 * midrib + 0.13 * veins + 0.23 * tide + 0.06 * cell;
    }
    default: { // Paper rays: pleats with unequal widths, fanning toward the scalloped, very thin tip.
      let fan = 0.56 + 0.50 * smoothstep(0.03, 1.0, v);
      let lane = 2.15 * spine / fan + 0.23 * tide + 0.16 * sin(v * 5.5 + s);
      let pleat = 0.5 + 0.5 * cos(6.28318 * lane);
      let veins = cord(2.0 * lane + 0.12 * cell, 0.19);
      h = 0.20 + 0.37 * pleat + 0.105 * veins + 0.09 * tide + 0.07 * cell;
      pigment = 0.11 + 0.45 * basal + 0.25 * pleat * (0.45 + 0.55 * belly) + 0.10 * veins + 0.09 * tide;
    }
  }
  return vec4f(h, pigment * (1.0 - 0.39 * margin), 0, 1);
}
