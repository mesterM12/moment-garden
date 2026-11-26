// Blade-local, socket first, no baked lighting or cultivar RGB. RG = signed
// relief gradients, B = relative pigment load, A = tissue packing (roughness
// and optical path). Only this offline bake evaluates the branching network.
struct Spec { family: u32 }
@group(0) @binding(0) var<uniform> spec: Spec;

fn hash(p: vec2i) -> f32 {
  let q = bitcast<vec2u>(p);
  var n = (q.x * 1597334677u) ^ (q.y * 3812015801u);
  n = (n ^ (n >> 16u)) * 2246822519u;
  return f32((n ^ (n >> 13u)) >> 8u) / 16777216.0;
}
fn field(p: vec2f) -> f32 {
  let i = vec2i(floor(p));
  let f = smoothstep(vec2f(0), vec2f(1), fract(p));
  return mix(mix(hash(i), hash(i + vec2i(1, 0)), f.x),
             mix(hash(i + vec2i(0, 1)), hash(i + vec2i(1, 1)), f.x), f.y);
}
fn ridge(d: f32, w: f32) -> f32 {
  return 1.0 - smoothstep(0.0, w, abs(d));
}
fn pouch(d: f32) -> f32 { return exp(-d * d); }

// The eight traced primary bundles radiate from the insertion, changing
// spacing towards the shoulder. Signed ranks (0…3 on each side) allow an
// asymmetric fan without reflecting the same pattern on both halves.
fn bundle(v: f32, side: f32, rank: f32, divergence: f32, lean: f32) -> f32 {
  let spread = (0.15 + 0.90 * smoothstep(0.0, 0.72, v)) * divergence;
  let lane = (0.15 + 0.215 * rank + 0.02 * rank * rank) * spread;
  let swing = (0.044 + 0.023 * rank) * sin(4.2 * v + 1.4 * rank + side * 0.7);
  return lean * v * v + side * (lane + swing * v);
}

// Terminated branches originate on actual bundles, then taper. Some longer
// secondaries reconnect with an exterior bundle, leaving curved areoles
// rather than revolutions of one repeated line. Return fine trace and halo.
fn vascular(p: vec2f, divergence: f32, lean: f32, secondary: f32) -> vec2f {
  let v = p.y;
  let s = p.x;
  var trace = 0.0;
  var halo = 0.0;
  for (var half = 0; half < 2; half++) {
    let side = f32(half) * 2.0 - 1.0;
    for (var j = 0; j < 4; j++) {
      let rank = f32(j);
      let seed = vec2i(j + 31 * half, 12);
      let lane = bundle(v, side, rank, divergence, lean);
      let next = bundle(v, side, rank + 1.0, divergence, lean);
      let end = 0.76 + 0.31 * hash(seed);
      let taper = 1.0 - smoothstep(end - 0.30, end, v);
      let width = (0.019 + 0.006 * hash(seed + vec2i(1, 12))) * mix(1.0, 0.57, v);
      trace = max(trace, ridge(s - lane, width) * taper);
      halo = max(halo, pouch((s - lane) / (width * 3.2)) * taper);
      for (var k = 0; k < 4; k++) {
        let id = seed + vec2i(0, 13 * (k + 1));
        let start = 0.12 + 0.181 * f32(k) + 0.152 * hash(id);
        let length = mix(0.12, 0.30, hash(id + vec2i(7, 1)));
        let t = (v - start) / length;
        let arc = smoothstep(0.0, 1.0, t);
        let reach = mix(0.45, 1.0, hash(id + vec2i(8, 1)));
        let growth = smoothstep(-0.04, 0.20, t) * (1.0 - smoothstep(0.65, 1.0, t));
        let mid = mix(lane, next, reach * arc) + side * 0.04 * sin(3.14159 * arc);
        trace = max(trace, secondary * ridge(s - mid, mix(0.020, 0.009, arc)) * growth);
        halo = max(halo, secondary * pouch((s - mid) / 0.048) * growth);
      }
    }
  }
  return vec2f(trace, halo);
}

// Only 128² RGBA per tissue. Derive slopes from the height field at bake
// resolution, then sample the signed slopes via the hardware mip chain.
const TEXEL = 1.0 / 128.0;

fn sheet(uv: vec2f) -> vec3f {
  let v = uv.y;
  let s = 2.0 * uv.x - 1.0;
  let bulk = field(uv * vec2f(5, 4) + vec2f(18.3, 22.4));
  let warp = field(uv * vec2f(6, 3) + 4.0) - 0.5;
  let flow = s + 0.075 * warp * sin(3.14159 * v);
  let shoulder = smoothstep(0.1, 0.45, v);
  let socket = 1.0 - smoothstep(0.0, 0.67, v);
  let cells = field(vec2f(flow * 28.0 + v * 10.0, v * 34.0));
  let fibers = field(vec2f(flow * 24.0, v * 4.3 + flow * 3.0));
  // Uneven compression causes a crease on one side and a soft bulge on the
  // other. The crease pinches out, so folds don't become full-length bands.
  let crease = (pouch((flow + 0.50 - 0.19 * v) * 7.5) - 0.56 * pouch((flow + 0.37 - 0.10 * v) * 4.0))
               * pouch((v - 0.70) * 3.1);
  let tuck = pouch((flow - 0.41 - 0.15 * v) * 4.0) * pouch((v - 0.33) * 3.9);
  var h: f32;
  var pigment: f32;
  var packing: f32;
  switch spec.family {
    case 0u: { // Wax: soft thick midrib with faint curving bundles on its shoulders.
      let veins = vascular(vec2f(flow, v), 1.04, -0.20, 0.62);
      let midrib = pouch((flow + 0.20 * v * v) * 5.6);
      h = 0.14 * midrib * (1.0 - 0.54 * v) + 0.022 * veins.x + 0.052 * bulk
          + 0.038 * tuck + 0.045 * crease + 0.006 * cells;
      pigment = 0.34 + 0.34 * socket + 0.12 * midrib * socket + 0.07 * veins.y
                + 0.15 * (bulk - 0.5) - 0.08 * tuck;
      packing = 0.41 + 0.17 * socket + 0.15 * midrib + 0.15 * bulk + 0.07 * veins.x;
    }
    case 1u: { // Satin: stretched flanks with bundles that split into fine threads.
      let veins = vascular(vec2f(flow, v), 1.12, 0.10, 0.68);
      let grain = field(vec2f(flow * 39.0 + 1.7 * bulk, v * 5.8));
      h = 0.13 * bulk + 0.072 * tuck + 0.073 * crease + 0.031 * veins.x
          + 0.034 * fibers + 0.012 * grain;
      pigment = 0.38 + 0.35 * socket + 0.12 * veins.y + 0.16 * (fibers - 0.5)
                + 0.15 * (bulk - 0.5) - 0.08 * tuck;
      packing = 0.37 + 0.24 * socket + 0.12 * fibers + 0.13 * veins.x + 0.11 * bulk;
    }
    case 2u: { // Velvet: spreading fans joined by faint looped secondaries; patches of raised papillae.
      let veins = vascular(vec2f(flow, v), 1.23, -0.07, 0.95);
      let nap = smoothstep(0.20, 0.82, field(uv * vec2f(14, 11) + 15.0));
      let blush = field(vec2f(flow * 4.4, v * 4.8 + flow * 2.3 + 17.0));
      h = 0.105 * bulk + 0.087 * crease + 0.069 * tuck + 0.020 * veins.x * shoulder
          + (0.005 + 0.016 * nap) * cells + 0.015 * fibers;
      pigment = 0.35 + 0.34 * socket + 0.11 * veins.y * shoulder + 0.31 * (blush - 0.5)
                + 0.15 * (bulk - 0.5) + 0.078 * crease - 0.10 * tuck;
      packing = 0.37 + 0.19 * socket + 0.22 * nap + 0.11 * veins.x + 0.14 * cells;
    }
    default: { // Paper: compressed folds form uneven, exfoliating flutes; fibers don't tile.
      let veins = vascular(vec2f(flow, v), 0.94, 0.20, 0.40);
      let pleats = field(vec2f(flow * (5.6 - 1.35 * shoulder), 3.0 + v * 2.2));
      let pull = 0.24 + 0.76 * field(vec2f(flow * 3.0, v * 3.0 + 12.0));
      h = 0.19 * pleats + 0.11 * crease + 0.07 * tuck + 0.048 * veins.x
          + 0.10 * (fibers - 0.5) * pull + 0.015 * cells;
      pigment = 0.40 + 0.33 * socket + 0.13 * veins.y + 0.17 * (pleats - 0.5)
                + 0.12 * (bulk - 0.5) + 0.07 * crease;
      packing = 0.32 + 0.19 * socket + 0.19 * fibers + 0.11 * veins.x + 0.11 * cells;
    }
  }
  return vec3f(h, pigment, packing);
}

@fragment fn fs_main(@location(0) uv: vec2f) -> @location(0) vec4f {
  let surface = sheet(uv);
  let slope = vec2f(sheet(uv + vec2f(TEXEL, 0)).x - sheet(uv - vec2f(TEXEL, 0)).x,
                    sheet(uv + vec2f(0, TEXEL)).x - sheet(uv - vec2f(0, TEXEL)).x) / (2.0 * TEXEL);
  // The 8-bit neutral code is 128. Limit occasional steep intersection
  // slopes without introducing a hard clipping plateau at the vein walls.
  let encoded = vec2f(128.0) + 112.0 * (slope / (11.0 + abs(slope)));
  return vec4f(encoded / 255.0, surface.yz);
}
