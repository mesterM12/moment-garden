/* Procedural cut-flower heads. Batches share the renderer's petal material and bloom pose. */
import * as THREE from 'three';

const TAU = 2 * Math.PI;
const GOLDEN_ANGLE = Math.PI * (3 - Math.sqrt(5));
const lerp = (a, b, t) => a + (b - a) * t;
const bell = n => Math.exp(-(n * n));
const smooth = t => { t = Math.max(0, Math.min(1, t)); return t * t * (3 - 2 * t); };
const scale = (point, factor) => point.map(n => n * factor);
const sum = (a, b) => a.map((n, i) => n + b[i]);
const polar = (angle, radius, height, side = 0) => [
  Math.sin(angle) * radius + Math.cos(angle) * side,
  height,
  Math.cos(angle) * radius - Math.sin(angle) * side,
];
// Smooth outline through five evenly spaced samples, with no overshoot at extrema.
function profile(values, t) {
  const i = Math.min(3, Math.floor(t * 4));
  const u = t * 4 - i;
  const a = values[i], b = values[i + 1], d = b - a;
  const before = i === 0 ? d : a - values[i - 1];
  const after = i === 3 ? d : values[i + 2] - b;
  const m0 = before * d > 0 ? 2 * before * d / (before + d) : 0;
  const m1 = after * d > 0 ? 2 * after * d / (after + d) : 0;
  return lerp(a, b, smooth(u)) + u * (1 - u) * (m0 * (1 - u) - m1 * u);
}
// Radial cupping is one morph across all panels in a layer, not a mesh per petal.
const bud = (point, t) => [point[0] * 0.28, point[1] * 0.63 + t * 0.53, point[2] * 0.28];
const compact = point => [point[0] * 0.38, point[1] * 0.72 + 0.03, point[2] * 0.38];

function createBatch(head, material, layer, offset) {
  const positions = [], closed = [], colors = [], uvs = [], indices = [];
  function surface(along, across, sample, paint, fold = bud) {
    const first = positions.length / 3;
    for (let j = 0; j <= along; j++) {
      const t = j / along;
      for (let i = 0; i <= across; i++) {
        const u = i / across, s = u * 2 - 1;
        const point = sample(t, s);
        const color = paint(t, s);
        positions.push(...point);
        closed.push(...fold(point, t));
        colors.push(color.r, color.g, color.b);
        uvs.push(u, t);
        if (j < along && i < across) {
          const a = first + j * (across + 1) + i, b = a + across + 1;
          indices.push(a, b, a + 1, b, b + 1, a + 1);
        }
      }
    }
  }
  function ellipsoid(center, dimensions, paint, fold = compact, along = 8, across = 16) {
    surface(along, across, (t, s) => {
      const theta = t * Math.PI, phi = s * Math.PI;
      return sum(center, [
        dimensions[0] * Math.sin(theta) * Math.sin(phi),
        dimensions[1] * Math.cos(theta),
        dimensions[2] * Math.sin(theta) * Math.cos(phi),
      ]);
    }, paint, fold);
  }
  function twig(from, to, width, paint) {
    const axis = new THREE.Vector3(...to).sub(new THREE.Vector3(...from)).normalize();
    const u = new THREE.Vector3().crossVectors(axis, new THREE.Vector3(1, 0, 0)).normalize().toArray();
    const v = new THREE.Vector3().crossVectors(axis, new THREE.Vector3(...u)).toArray();
    surface(1, 6, (t, s) => {
      const center = from.map((n, i) => lerp(n, to[i], t));
      const r = width * lerp(1, 0.53, t);
      return sum(center, sum(scale(u, Math.cos(s * Math.PI) * r), scale(v, Math.sin(s * Math.PI) * r)));
    }, paint, compact);
  }
  function mesh() {
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
    geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
    geometry.setIndex(indices);
    geometry.computeVertexNormals();
    const openPosition = geometry.getAttribute('position');
    const openNormal = geometry.getAttribute('normal');
    const closedPosition = new THREE.Float32BufferAttribute(closed, 3);
    geometry.setAttribute('position', closedPosition);
    geometry.deleteAttribute('normal');
    geometry.computeVertexNormals();
    geometry.morphAttributes.position = [closedPosition];
    geometry.morphAttributes.normal = [geometry.getAttribute('normal')];
    geometry.setAttribute('position', openPosition);
    geometry.setAttribute('normal', openNormal);
    const panel = new THREE.Mesh(geometry, material);
    head.add(panel);
    return { mesh: panel, layer, offset, shell: true };
  }
  return { surface, ellipsoid, twig, mesh };
}
function palette(specimen) {
  const color = value => new THREE.Color(value);
  const base = color(specimen.palette.base), tip = color(specimen.palette.tip);
  const shade = color(specimen.palette.root), fleck = color(specimen.palette.fleck);
  const tint = new THREE.Color();
  const petal = (t, s) => {
    const rim = specimen.pattern === 'picotee' ? 0.56 * smooth((t - 0.82) / 0.18) * (0.64 + 0.36 * s * s) : 0;
    return tint.copy(shade).lerp(base, smooth(t / 0.31))
      .lerp(tip, smooth((t - 0.33) / 0.67) * 0.66).lerp(tip, rim)
      .multiplyScalar(0.98 - 0.034 * Math.cos(s * 20 + t * 1.6) ** 8);
  };
  return { color, base, tip, shade, fleck, tint, petal };
}

// Layer upon layer of fine, overlapping, almost circular petal edges.
function ranunculus(specimen, batch, { petal, tip, base, shade, tint }) {
  const R = specimen.length;
  const rings = specimen.layers + 1;
  for (let layer = 0; layer < rings; layer++) {
    const panels = batch(layer);
    const count = Math.max(5, specimen.count + 3 - layer);
    const pitch = TAU / count;
    const progress = layer / (rings - 1);
    const radius = R * (1 - 0.87 * progress ** 0.78);
    const height = R * lerp(0.04, 0.47, progress ** 0.82);
    if (layer === 0) {
      panels.ellipsoid(scale([0, 0.115, 0], R), scale([0.306, 0.13, 0.306], R), t => tint.copy(base).lerp(shade, 0.53 + 0.23 * t));
    }
    for (let i = 0; i < count; i++) {
      const angle = specimen.rotation + pitch * (i + layer * 0.52);
      const phase = i * GOLDEN_ANGLE + specimen.rotation;
      panels.surface(12, 10, (t, s) => {
        const shoulder = smooth((t - 0.56) / 0.44);
        const r = radius * (0.22 + 0.78 * t - 0.085 * s * s * shoulder);
        const y = height + radius * (0.22 * Math.sin(t * 2.29) + 0.12 * t + 0.052 * s * s * t
          + 0.02 * Math.sin(s * 5.8 + phase) * shoulder);
        const a = angle + pitch * (0.70 * s * profile([0.14, 0.68, 1, 1, 0.90], t) + t * 0.29);
        return polar(a, r, y);
      }, (t, s) => {
        // Pale paper edges with deeper pigment where the rings turn inward.
        const rim = 0.31 * smooth((t - 0.86) / 0.14);
        return petal(t, s).lerp(base, progress * 0.48).lerp(shade, progress * 0.23).lerp(tip, rim);
      });
    }
    if (layer === rings - 1) {
      panels.ellipsoid([0, height + 0.055 * R, 0], scale([0.095, 0.112, 0.095], R), t => tint.copy(base).lerp(shade, 0.24 + 0.46 * t));
    }
  }
}

// One asymmetric, wrapping spathe; the golden spadix is exposed by its low front rim.
function calla(specimen, batch, { color, petal, tint, tip }) {
  const R = specimen.length;
  const yaw = 0.7 * (specimen.rotation / TAU - 0.5);
  const green = color('#91a356'), cream = color('#fff4c8');
  // Fold the entire flower with one transform so the spadix stays inside the wrap.
  const fold = point => [point[0] * 0.34, point[1] * 0.99, point[2] * 0.34];
  const spathe = batch(0);
  spathe.surface(28, 64, (t, s) => {
    const u = (s + 1) * 0.5;
    const sweep = (u - 0.86) * TAU * 1.12 + 0.18 * t;
    const back = (1 - Math.cos(sweep)) * 0.5;
    const apex = Math.max(0, Math.cos(sweep + 2.91)) ** 3;
    const lip = smooth((t - 0.72) / 0.28);
    // Both laps have the same rise and flare at a given angle, but the outside
    // lap stands proud of the inside lap rather than crossing through it.
    const seam = (u - 0.5) * (0.034 + 0.078 * t);
    const radius = 0.065 + t ** 1.34 * (0.44 + 0.14 * (1 - back) - 0.04 * apex)
      + lip * 0.075 * (1 - back) + seam;
    const y = 0.72 * t + (0.20 * back + 0.32 * apex) * t ** 2 + 0.016 * Math.sin(sweep * 3) * lip;
    const point = polar(sweep + yaw, radius, y);
    // The funnel bows away from the spadix as it opens.
    point[0] += 0.08 * t * t;
    point[2] -= (0.19 * apex + 0.07 * back) * lip;
    return scale(point, R);
  }, (t, s) => petal(t, s).lerp(cream, 0.18 * smooth((t - 0.6) / 0.4))
    .lerp(tip, 0.28 * smooth((t - 0.8) / 0.2)).lerp(green, 0.87 * (1 - smooth(t / 0.34))), fold);
  const gold = color('#db9c24');
  spathe.surface(20, 14, (t, s) => {
    const r = (0.006 + 0.066 * Math.sin(Math.PI * t) ** 0.45) * (1 - 0.29 * t);
    return scale(polar(s * Math.PI, r, 0.1 + 0.73 * t, 0.032 * t * t), R);
  }, (t, s) => tint.copy(gold).lerp(cream, 0.26 * t + 0.14 * (Math.cos(s * 36 + t * 35) * Math.cos(t * 47)) ** 2), fold);
}

// A moth orchid's two broad wings frame three sepals and a projecting, forked lip.
function orchid(specimen, batch, { color, petal, base, shade, tip, fleck, tint }) {
  const R = specimen.length;
  const twist = (specimen.rotation / TAU - 0.5) * 0.38;
  const sepals = batch(0), wings = batch(1), lip = batch(2, 0.022);
  for (const [i, aim] of [Math.PI, 0.73, -0.73].entries()) {
    const angle = aim + twist;
    const length = i ? 0.77 : 0.93;
    sepals.surface(16, 12, (t, s) => {
      const width = profile([0.05, 0.52, 0.94, 1, 0.66], t) * (i ? 0.24 : 0.26);
      const curve = 0.10 * s * s * t ** 3;
      const y = -0.035 + 0.13 * t ** 2 + 0.075 * s * s * Math.sin(Math.PI * t);
      return scale(polar(angle, 0.035 + length * t - curve, y, s * width), R);
    }, (t, s) => petal(t, s).lerp(shade, 0.16));
  }
  for (const sign of [-1, 1]) {
    const angle = Math.PI + sign * 1.35 + twist;
    wings.surface(20, 16, (t, s) => {
      const width = specimen.width * profile([0.038, 0.48, 0.94, 1.14, 0.82], t);
      const shoulder = Math.sin(Math.PI * t);
      const y = 0.014 + 0.25 * t * t + 0.093 * s * s * shoulder + 0.022 * Math.cos(s * 9 + sign * t * 18) * t ** 2;
      const radial = 0.03 + 0.97 * t - 0.18 * s * s * t ** 3;
      return polar(angle + sign * 0.11 * t, radial * R, y * R, width * (s + sign * 0.10 * t));
    }, (t, s) => {
      const vein = (1 - smooth((t - 0.22) / 0.48)) * Math.cos(s * 15 + sign * t * 1.4) ** 12;
      return petal(t, s).lerp(tip, 0.30).lerp(fleck, 0.17 * vein);
    });
  }
  const throat = color('#fff0c9'), pollen = color('#e8a132');
  for (const sign of [-1, 1]) {
    lip.surface(16, 12, (t, s) => {
      const y = 0.13 + 0.28 * Math.sin(Math.PI * t) + 0.02 * t + 0.10 * s * s * Math.sin(Math.PI * t);
      const side = sign * (0.02 + 0.08 * t + 0.15 * t ** 4) + s * profile([0.01, 0.115, 0.123, 0.14, 0.012], t);
      return scale(polar(twist, 0.01 + 0.62 * t, y, side), R);
    }, (t, s) => tint.copy(base).lerp(fleck, 0.40 + 0.18 * Math.sin(t * 20 + s * 9) ** 6)
      .lerp(throat, 0.71 * (1 - smooth((t - 0.10) / 0.32)))
      .lerp(pollen, 0.72 * bell((t - 0.24) / 0.12) * bell(s * 1.6)));
  }
  lip.ellipsoid(scale([0, 0.22, -0.008], R), scale([0.092, 0.15, 0.10], R), t => tint.copy(throat).lerp(pollen, 0.7 * t));
  sepals.ellipsoid([0, 0.02, 0], [0.105, 0.11, 0.11], t => tint.copy(shade).lerp(base, 0.28 * (1 - t)));
}

// Three ruffled, drooping falls alternate with three tall upright standards.
function iris(specimen, batch, { color, petal, tint, fleck, tip }) {
  const R = specimen.length;
  const twist = (specimen.rotation / TAU - 0.5) * 0.64;
  const falls = batch(0), standards = batch(1);
  const cream = color('#f7e3a6'), gold = color('#dfa42f'), green = color('#77864c');
  falls.ellipsoid([0, 0.082, 0], [0.102, 0.14, 0.10], t => tint.copy(green).lerp(tip, 0.64 * (1 - t)));
  for (let i = 0; i < 3; i++) {
    const angle = twist + i * TAU / 3;
    const fall = (t, s) => {
      const width = specimen.width * profile([0.08, 0.30, 0.79, 1, 0.56], t);
      const wave = 0.041 * Math.sin(t * 29 + s * 3.4 + i * 2) * t ** 0.8 * s ** 4;
      const y = 0.082 + 0.24 * Math.sin(t * Math.PI) - 0.36 * t ** 2 + 0.14 * s * s * Math.sin(Math.PI * t) + wave;
      return polar(angle + 0.09 * t, R * (0.035 + t - 0.13 * s * s * t ** 2), y * R, s * width);
    };
    falls.surface(24, 20, fall, (t, s) => {
      const blaze = bell((t - 0.36) / 0.31) * bell(s * (2.5 + 1.8 * t));
      const streaks = Math.cos(s * 26 / (0.8 + t) + 2 * t) ** 10;
      return petal(t, s).lerp(cream, 0.93 * blaze).lerp(fleck, 0.32 * streaks * blaze);
    });
    for (let j = 0; j < 15; j++) {
      const t = 0.13 + j * 0.026;
      const s = 0.12 * Math.sin(j * GOLDEN_ANGLE);
      const point = fall(t, s);
      point[1] += 0.021 + 0.018 * Math.sin(j / 15 * Math.PI);
      falls.ellipsoid(point, [0.026, 0.035, 0.026], a => tint.copy(gold).lerp(cream, 0.58 * (1 - a)), p => bud(p, t), 4, 7);
    }
    standards.surface(20, 16, (t, s) => {
      const width = specimen.width * 0.91 * profile([0.05, 0.40, 0.83, 1, 0.57], t);
      const r = 0.04 + 0.52 * t - 0.13 * t ** 5;
      const y = 0.08 + 0.78 * Math.sin(1.48 * t) + 0.04 * Math.sin(t * 29 + s * 5 + i) * t * s ** 4;
      return polar(angle + Math.PI / 3 + 0.20 * t, R * r, R * (y - 0.12 * s * s * t ** 3), s * width);
    }, (t, s) => petal(t, s).lerp(tip, 0.27 + 0.16 * t).lerp(cream, 0.55 * (1 - smooth(t / 0.48))));
  }
}

// A mophead cluster: four rounded showy sepals per floret on a branching dome.
function hydrangea(specimen, batch, { color, petal, tint, tip, base, shade }) {
  const R = specimen.length;
  const ivory = color('#eee9ca'), spring = color('#a2b36b'), stalk = color('#56703d');
  const branches = batch(0);
  const rings = [[9, 0.81, 0.24], [8, 0.67, 0.57], [5, 0.39, 0.80], [1, 0, 0.89]];
  for (const [ring, [count, radius, height]] of rings.entries()) {
    const panels = batch(ring, 0.018);
    for (let i = 0; i < count; i++) {
      const phase = (ring * 9 + i) * GOLDEN_ANGLE + specimen.rotation;
      const angle = specimen.rotation + TAU * i / count + ring * 0.23;
      const size = (0.243 + 0.031 * Math.sin(phase) + (ring === 2 ? 0.012 : 0)) * R;
      const r = R * (radius + 0.025 * Math.sin(phase * 2.6));
      const y = R * (height + 0.034 * Math.sin(phase * 1.4));
      const center = polar(angle, r, y);
      const fork = polar(angle, r * 0.27, y * 0.58);
      branches.twig([0, 0, 0], fork, 0.019, () => stalk);
      branches.twig(fork, center, 0.014, () => stalk);
      const fold = (point, t) => {
        const node = compact(center);
        return sum(node, [(point[0] - center[0]) * 0.24, (point[1] - center[1]) * 0.38 + t * 0.10, (point[2] - center[2]) * 0.24]);
      };
      const slope = radius * 0.93;
      for (let j = 0; j < 4; j++) {
        const aim = phase * 0.23 + j * TAU / 4;
        panels.surface(9, 8, (t, s) => {
          const w = 0.61 * profile([0.06, 0.40, 0.78, 1, 0.68], t);
          const delta = scale(polar(aim, t + 0.05 - 0.20 * s * s * t ** 3, 0.16 * Math.sin(t * Math.PI) + 0.12 * s * s * t, s * w), size);
          const out = delta[0] * Math.sin(angle) + delta[2] * Math.cos(angle);
          return sum(center, sum(delta, polar(angle, slope * delta[1], -slope * out)));
        }, (t, s) => petal(t, s).lerp(tip, 0.12 + 0.18 * Math.sin(phase)).lerp(ivory, 0.08 + 0.40 * (1 - smooth(t / 0.56))), fold);
      }
      panels.ellipsoid(sum(center, [0, size * 0.17, 0]), scale([0.18, 0.15, 0.18], size), t => tint.copy(spring).lerp(ivory, 0.68 * (1 - t)).lerp(base, 0.18), fold, 5, 9);
    }
  }
  branches.ellipsoid([0, 0.045, 0], [0.057, 0.11, 0.057], t => tint.copy(stalk).lerp(shade, 0.06 + 0.1 * t));
}

// Broad satin petals around a dark, button-shaped eye and a visible ring of stamens.
function anemone(specimen, batch, { color, petal, tint, tip, base, shade }) {
  const R = specimen.length;
  const petals = batch(0), eye = batch(2, 0.032);
  const ink = color('#18172b'), blue = color('#484161'), collar = color('#a9b9a4');
  petals.ellipsoid(scale([0, 0.045, 0], R), scale([0.263, 0.098, 0.263], R), t => tint.copy(shade).lerp(collar, 0.14 + 0.21 * t));
  const count = specimen.count;
  for (let i = 0; i < count; i++) {
    const angle = specimen.rotation + TAU * i / count;
    const variation = Math.sin(i * GOLDEN_ANGLE + specimen.rotation);
    petals.surface(20, 16, (t, s) => {
      const width = specimen.width * profile([0.12, 0.66, 0.97, 1.10, 0.77], t);
      const radius = 0.23 + (0.76 + 0.035 * variation) * t - 0.15 * s * s * t ** 3;
      const wave = 0.015 * Math.sin(t * 22 + s * 9 + variation * 3) * t ** 2;
      const y = 0.045 + 0.085 * Math.sin(Math.PI * t) + 0.105 * t * t + 0.11 * s * s * Math.sin(Math.PI * t) + wave;
      return polar(angle + 0.12 * t + 0.035 * variation, R * radius, R * y, s * width);
    }, (t, s) => {
      const halo = 1 - smooth((t - 0.025 - 0.03 * Math.cos(s * 10)) / 0.41);
      return petal(t, s).lerp(tip, 0.21).lerp(collar, 0.68 * halo * smooth(t / 0.16)).lerp(ink, 0.72 * halo ** 3);
    });
  }
  eye.ellipsoid(scale([0, 0.12, 0], R), scale([0.18, 0.15, 0.18], R), (t, s) => tint.copy(ink)
    .lerp(blue, 0.35 + 0.22 * Math.cos(s * 29 + 22 * t) ** 2 * Math.sin(32 * t) ** 2));
  for (let i = 0; i < 72; i++) {
    const a = i * GOLDEN_ANGLE + specimen.rotation;
    const radius = 0.145 + 0.173 * Math.sqrt((i + 0.5) / 72);
    const y = 0.14 + 0.06 * Math.sin(a * 2) ** 2 + 0.08 * (1 - i / 72);
    const end = polar(a, R * radius, R * y);
    eye.twig(polar(a, R * radius * 0.74, 0.075), end, 0.012, () => blue);
    eye.ellipsoid(end, scale([0.026, 0.040, 0.026], R), t => tint.copy(ink).lerp(blue, 0.77 * (1 - t)).lerp(base, 0.08), compact, 4, 7);
  }
}

// Craspedia: a small gold globe of fused five-point florets, not a daisy in miniature.
function billyButton(specimen, batch, { color, tint, base, tip }) {
  const radius = specimen.length * 0.82;
  const middle = radius * 1.16;
  const count = specimen.count;
  const gold = color('#dba12d'), ochre = color('#a46917'), honey = color('#f9d46b');
  const stalk = color('#829041');
  const core = batch(0);
  core.ellipsoid([0, 0.075, 0], [0.075, 0.09, 0.075], t => tint.copy(stalk).lerp(ochre, 0.58 * (1 - t)));
  core.ellipsoid([0, middle, 0], [radius, radius, radius], t => tint.copy(ochre).lerp(gold, 0.24 * (1 - t)), compact, 14, 24);
  const florets = [batch(1, 0.015), batch(2, 0.028)];
  for (let i = 0; i < count; i++) {
    const z = 1 - 2 * (i + 0.5) / count;
    const a = specimen.rotation + i * GOLDEN_ANGLE;
    const r = Math.sqrt(1 - z * z);
    const n = [r * Math.sin(a), z, r * Math.cos(a)];
    const u = [Math.cos(a), 0, -Math.sin(a)];
    const v = [-z * Math.sin(a), r, -z * Math.cos(a)];
    const center = sum([0, middle, 0], scale(n, radius * (0.96 + 0.025 * Math.sin(i * 7))));
    const spread = radius * (0.183 + 0.028 * Math.sin(i * 2.6));
    florets[z > 0.12 ? 1 : 0].surface(5, 15, (t, s) => {
      const angle = s * Math.PI + a;
      const lobe = (1 + Math.cos(angle * 5)) * 0.5;
      const size = spread * (0.20 + 0.76 * t + 0.14 * lobe * t);
      const h = spread * (0.38 * t + (0.42 + 0.30 * lobe) * Math.sin(t * Math.PI) + 0.15 * lobe * t);
      return sum(center, sum(scale(n, h), sum(scale(u, Math.cos(angle) * size), scale(v, Math.sin(angle) * size))));
    }, (t, s) => tint.copy(gold).lerp(base, 0.21).lerp(tip, 0.14).lerp(ochre, 0.48 * (1 - smooth(t / 0.63)))
      .lerp(honey, (0.32 + 0.10 * Math.sin(i * 7 + s * 9)) * smooth((t - 0.40) / 0.60)), compact);
  }
}

const forms = { ranunculus, calla, orchid, iris, hydrangea, anemone, billyButton };
const has = key => Object.hasOwn(forms, key);
function build(specimen, head, material) {
  if (!has(specimen.key)) return [];
  const batches = [];
  const batch = (layer, offset = 0) => {
    const builder = createBatch(head, material, layer, offset);
    batches.push(builder);
    return builder;
  };
  forms[specimen.key](specimen, batch, palette(specimen));
  return batches.map(builder => builder.mesh());
}

export { has, build };
export default { has, build };
