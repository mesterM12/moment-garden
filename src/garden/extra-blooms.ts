/* Procedural cut-flower heads. Batches share the renderer's petal material and bloom pose. */
import * as THREE from 'three';
import type { BladeSpan } from './petal-fold';
import type { ExtraSpeciesKey, MorphPetal, Specimen } from './types';

type Point = number[];
type Sample = (t: number, s: number) => Point;
type Paint = (t: number, s: number) => THREE.Color;
type Fold = (point: Point, t: number) => Point;
type Batch = ReturnType<typeof createBatch>;
type Batches = (layer: number, offset?: number) => Batch;
type Palette = ReturnType<typeof palette>;

const TAU = 2 * Math.PI;
const GOLDEN_ANGLE = Math.PI * (3 - Math.sqrt(5));
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const bell = (n: number) => Math.exp(-(n * n));
const smooth = (t: number) => { t = Math.max(0, Math.min(1, t)); return t * t * (3 - 2 * t); };
const scale = (point: Point, factor: number) => point.map(n => n * factor);
const sum = (a: Point, b: Point) => a.map((n, i) => n + b[i]);
const polar = (angle: number, radius: number, height: number, side = 0): Point => [
  Math.sin(angle) * radius + Math.cos(angle) * side,
  height,
  Math.cos(angle) * radius - Math.sin(angle) * side,
];
// Smooth outline through five evenly spaced samples, with no overshoot at extrema.
function profile(values: readonly number[], t: number) {
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
const bud: Fold = (point, t) => [point[0] * 0.28, point[1] * 0.63 + t * 0.53, point[2] * 0.28];
const compact = (point: Point): Point => [point[0] * 0.38, point[1] * 0.72 + 0.03, point[2] * 0.38];

function createBatch(head: THREE.Group, material: THREE.Material, layer: number, offset: number) {
  const positions: number[] = [], closed: number[] = [], colors: number[] = [], uvs: number[] = [], indices: number[] = [];
  const blades: BladeSpan[] = [];
  function surface(along: number, across: number, sample: Sample, paint: Paint, fold: Fold = bud, blade: boolean | BladeSpan['anchor'] = true) {
    const first = positions.length / 3;
    if (blade) blades.push({ first, end: first + (along + 1) * (across + 1), voice: blades.length, anchor: blade === true ? undefined : blade });
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
    return blades.length - 1;
  }
  function ellipsoid(center: Point, dimensions: Point, paint: Paint, fold: Fold = compact, along = 8, across = 16, host?: { uv: [number, number]; voice: number }) {
    surface(along, across, (t, s) => {
      const theta = t * Math.PI, phi = s * Math.PI;
      return sum(center, [
        dimensions[0] * Math.sin(theta) * Math.sin(phi),
        dimensions[1] * Math.cos(theta),
        dimensions[2] * Math.sin(theta) * Math.cos(phi),
      ]);
    }, paint, fold, host?.uv ?? false);
    if (host) blades[blades.length - 1].voice = host.voice;
  }
  function twig(from: Point, to: Point, width: number, paint: Paint) {
    const axis = new THREE.Vector3(...to).sub(new THREE.Vector3(...from)).normalize();
    const u = new THREE.Vector3().crossVectors(axis, new THREE.Vector3(1, 0, 0)).normalize().toArray();
    const v = new THREE.Vector3().crossVectors(axis, new THREE.Vector3(...u)).toArray();
    surface(1, 6, (t, s) => {
      const center = from.map((n, i) => lerp(n, to[i], t));
      const r = width * lerp(1, 0.53, t);
      return sum(center, sum(scale(u, Math.cos(s * Math.PI) * r), scale(v, Math.sin(s * Math.PI) * r)));
    }, paint, compact, false);
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
    return { mesh: panel, layer, offset, blades };
  }
  return { surface, ellipsoid, twig, mesh };
}
function palette(specimen: Specimen) {
  const color = (value: string) => new THREE.Color(value);
  const base = color(specimen.palette.base), tip = color(specimen.palette.tip);
  const shade = color(specimen.palette.root), fleck = color(specimen.palette.fleck);
  const tint = new THREE.Color();
  const petal = (t: number, s: number) => {
    const rim = specimen.pattern === 'picotee' ? 0.56 * smooth((t - 0.82) / 0.18) * (0.64 + 0.36 * s * s) : 0;
    return tint.copy(shade).lerp(base, smooth(t / 0.31))
      .lerp(tip, smooth((t - 0.33) / 0.67) * 0.66).lerp(tip, rim)
      .multiplyScalar(0.98 - 0.034 * Math.cos(s * 20 + t * 1.6) ** 8);
  };
  return { color, base, tip, shade, fleck, tint, petal };
}

// A florist's double ranunculus: thin, broad laminae with a rounded lip.
// Batches order the opening; the individual cups do not sit on circular tiers.
function ranunculus(specimen: Specimen, batch: Batches, { petal, tip, base, shade, tint }: Palette) {
  const R = specimen.length;
  const rings = specimen.layers + 1;
  for (let layer = 0; layer < rings; layer++) {
    const panels = batch(layer);
    const count = Math.max(5, specimen.count + 3 - layer);
    const pitch = TAU / count;
    const inner = layer / (rings - 1);
    if (layer === 0) {
      panels.ellipsoid(scale([0, .052, 0], R), scale([.226, .083, .226], R),
        t => tint.copy(base).lerp(shade, .52 + .31 * t), p => p, 8, 14);
    }
    for (let i = 0; i < count; i++) {
      const phase = specimen.rotation * 1.8 + i * GOLDEN_ANGLE + layer * 1.437;
      const hand = Math.sin(phase), tilt = Math.cos(phase * 1.33);
      const angle = specimen.rotation + pitch * (i + .23 * hand) + layer * GOLDEN_ANGLE;
      // Alternate long and short blades across the nominal batches so that
      // shoulders interrupt successive seams rather than making a rosette of bands.
      const eye = smooth((inner - .75) / .25);
      const reach = .96 - .88 * inner ** .84 + (.055 * hand + .023 * tilt) * (1 - inner) - eye * .046 * smooth(hand);
      const root = .215 * (1 - inner) ** 1.45 + .014;
      const foot = .024 + .373 * inner ** 1.28 + .011 * tilt * inner;
      const top = .22 + .403 * inner ** .85 + .025 * hand;
      const open: Sample = (t, s) => {
        const lip = smooth((t - .55) / .45), edge = Math.abs(s) ** 2.7;
        const arch = t - (.16 + .04 * hand) * s * s * lip;
        const span = pitch * profile([.11, .46, .68, .72, .59], t) * (1 + .125 * hand - .16 * eye * lip);
        const sweep = angle + span * s + (hand * .09 + .19) * t + .09 * tilt * lip;
        const radius = lerp(root, reach, arch ** .98) + (.06 * inner + .032) * Math.sin(Math.PI * t)
          - .024 * edge * t * (1 - inner);
        // Give overlapping margins a signed pitch. Outside the eye, compute
        // the rise in radial space so long/short petals remain lapped instead
        // of cutting through each other along their shoulders.
        const rise = lerp(Math.max(0, (radius - root) / (.96 - .88 * inner ** .84 - root)) ** 1.68, arch ** 1.2, inner);
        const wave = .008 * edge * lip * Math.sin(s * 5 + phase);
        const y = lerp(foot, top, rise) - .029 * Math.sin(Math.PI * t) * (1 - inner)
          + (.044 * s + .021 * s * s) * t + wave + .009 * tilt * s * lip;
        return polar(sweep, R * radius, R * y);
      };
      panels.surface(12, 10, open, (t, s) => {
        const rim = smooth((t - .86) / .14);
        return petal(t, s).lerp(base, .24 * inner + .13 * (1 - t))
          .lerp(shade, .13 * inner + .14 * Math.max(0, -s) * Math.sin(Math.PI * t))
          .lerp(tip, (.19 + .09 * hand) * rim).multiplyScalar(1 + .047 * hand);
      }, (point, t) => {
        // Keep the insertion fixed and wrap the free blade around an ovoid.
        // Use its existing azimuth so the same margins still make the lap.
        const a = Math.atan2(point[0], point[2]);
        const lip = smooth((t - .56) / .44);
        const radial = root * (1 - t) + (.26 - .13 * inner) * Math.sin(Math.PI * t)
          + (.053 - .025 * inner) * t;
        const y = lerp(foot, .72 - .05 * inner, t) + (point[1] / R - lerp(foot, top, t * t)) * (.55 + .25 * lip);
        const lap = .024 * (Math.hypot(point[0], point[2]) / R - lerp(root, reach, t));
        return polar(a, R * (radial + lap), R * y);
      });
    }
  }
}

// One asymmetric, wrapping spathe; the golden spadix is exposed by its low front rim.
function calla(specimen: Specimen, batch: Batches, { color, petal, tint, tip }: Palette) {
  const R = specimen.length;
  const yaw = 0.7 * (specimen.rotation / TAU - 0.5);
  const green = color('#91a356'), cream = color('#fff4c8');
  // Fold the entire flower with one transform so the spadix stays inside the wrap.
  const fold: Fold = point => [point[0] * 0.34, point[1] * 0.99, point[2] * 0.34];
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
  }, (t, s) => tint.copy(gold).lerp(cream, 0.26 * t + 0.14 * (Math.cos(s * 36 + t * 35) * Math.cos(t * 47)) ** 2), fold, false);
}

// One continuous spathe, not a cone capped with a second lip. The seam
// overlaps down the neck and parts above it. Its hood bends back over a
// short fleshy spadix; both start at the stem instead of leaving a pinhole.
function cutCalla(specimen: Specimen, batch: Batches, { petal, tint, color }: Palette) {
  const R = specimen.length, yaw = .32 * Math.sin(specimen.rotation);
  const green = color('#829657'), gold = color('#dca642'), cream = color('#fff0c4');
  const spathe = batch(0);
  const fold: Fold = p => [p[0] * .34, p[1] * .99, p[2] * .34];
  spathe.surface(32, 64, (t, s) => {
    const u = (1 + s) / 2, lip = smooth((t - .78) / .22);
    const a = yaw + .26 + (u - .5) * TAU * (1.17 - .10 * smooth(t)) + .36 * t + Math.PI;
    const hood = (.5 - .5 * Math.cos(a - yaw)) ** 5;
    const flank = Math.sin(a - yaw);
    const seam = (u - .5) * (.012 + .065 * t);
    const r = .025 + .095 * t + (.36 + .065 * flank) * t ** 1.72 + seam
      + lip * (.12 + .12 * hood) - .025 * smooth((t - .93) / .07);
    const y = -.018 + .71 * t + (.43 * hood + .13 * flank + .13 * (u - .5)) * t ** 2
      - .072 * smooth((t - .90) / .1) * (1 - hood);
    return scale([Math.sin(a) * r + .092 * t ** 2, y, Math.cos(a) * r - .105 * hood * lip], R);
  }, (t, s) => petal(t, s).lerp(cream, .10 * t).lerp(green, .86 * (1 - smooth(t / .41))), fold);
  // Ovary seals the passage between stem and spadix at the base of the wrap.
  spathe.ellipsoid(scale([0, .073, 0], R), scale([.038, .09, .038], R),
    t => tint.copy(green).lerp(gold, 1 - t), fold, 8, 12);
  spathe.surface(24, 20, (t, s) => {
    const r = .009 + .055 * Math.sin(Math.PI * t) ** .49 * (1 - .19 * t);
    const a = s * Math.PI;
    return scale([r * Math.sin(a) + .036 * t ** 2, .131 + .63 * t,
      r * Math.cos(a) - .036 * t ** 2], R);
  }, (t, s) => tint.copy(gold).lerp(cream, .18 + .19 * t + .13 * (Math.cos(42 * s + t * 51) * Math.cos(30 * t)) ** 2), fold, false);
}

// A moth orchid's two broad wings frame three sepals and a projecting, forked lip.
function orchid(specimen: Specimen, batch: Batches, { color, petal, base, shade, tip, fleck, tint }: Palette) {
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
function iris(specimen: Specimen, batch: Batches, { color, petal, tint, fleck, tip }: Palette) {
  const R = specimen.length;
  const twist = (specimen.rotation / TAU - 0.5) * 0.64;
  const falls = batch(0), standards = batch(1);
  const cream = color('#f7e3a6'), gold = color('#dfa42f'), green = color('#77864c');
  falls.ellipsoid([0, 0.082, 0], [0.102, 0.14, 0.10], t => tint.copy(green).lerp(tip, 0.64 * (1 - t)));
  for (let i = 0; i < 3; i++) {
    const angle = twist + i * TAU / 3;
    const fall: Sample = (t, s) => {
      const width = specimen.width * profile([0.08, 0.30, 0.79, 1, 0.56], t);
      const wave = 0.041 * Math.sin(t * 29 + s * 3.4 + i * 2) * t ** 0.8 * s ** 4;
      const y = 0.082 + 0.24 * Math.sin(t * Math.PI) - 0.36 * t ** 2 + 0.14 * s * s * Math.sin(Math.PI * t) + wave;
      return polar(angle + 0.09 * t, R * (0.035 + t - 0.13 * s * s * t ** 2), y * R, s * width);
    };
    const voice = falls.surface(24, 20, fall, (t, s) => {
      const blaze = bell((t - 0.36) / 0.31) * bell(s * (2.5 + 1.8 * t));
      const streaks = Math.cos(s * 26 / (0.8 + t) + 2 * t) ** 10;
      return petal(t, s).lerp(cream, 0.93 * blaze).lerp(fleck, 0.32 * streaks * blaze);
    });
    // Each fall has one blade plus fifteen attached beard grains.
    for (let j = 0; j < 15; j++) {
      const t = 0.13 + j * 0.026;
      const s = 0.12 * Math.sin(j * GOLDEN_ANGLE);
      const point = fall(t, s);
      point[1] += 0.021 + 0.018 * Math.sin(j / 15 * Math.PI);
      falls.ellipsoid(point, [0.026, 0.035, 0.026], a => tint.copy(gold).lerp(cream, 0.58 * (1 - a)), p => bud(p, t), 4, 7, { uv: [t, s], voice });
    }
    standards.surface(20, 16, (t, s) => {
      const width = specimen.width * 0.91 * profile([0.05, 0.40, 0.83, 1, 0.57], t);
      const r = 0.04 + 0.52 * t - 0.13 * t ** 5;
      const y = 0.08 + 0.78 * Math.sin(1.48 * t) + 0.04 * Math.sin(t * 29 + s * 5 + i) * t * s ** 4;
      return polar(angle + Math.PI / 3 + 0.20 * t, R * r, R * (y - 0.12 * s * s * t ** 3), s * width);
    }, (t, s) => petal(t, s).lerp(tip, 0.27 + 0.16 * t).lerp(cream, 0.55 * (1 - smooth(t / 0.48))));
  }
}

// A mophead branches into short cymes. Each showy floret carries four sepals
// on a tilted socket, surrounding a much smaller flower with its own crown.
function hydrangea(specimen: Specimen, batch: Batches, { color, petal, tint, tip, base, shade }: Palette, cut = false) {
  const R = specimen.length;
  const ivory = color('#eee9ca'), spring = color('#a2b36b');
  // Preserve the authored meshes of shared v1/v2 bouquets.
  if (!cut) {
    const stalk = color('#56703d');
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
        const fold: Fold = (point, t) => {
          const node = compact(center);
          return sum(node, [(point[0] - center[0]) * 0.24, (point[1] - center[1]) * 0.38 + t * 0.10, (point[2] - center[2]) * 0.24]);
        };
        const slope = radius * 0.93;
        for (let j = 0; j < 4; j++) {
          const aim = phase * 0.23 + j * TAU / 4;
          panels.surface(9, 8, (t, s) => {
            const w = .61 * profile([.06, .40, .78, 1, .68], t);
            const arch = .12 * s * s * t;
            const delta = scale(polar(aim, t + .05 - .20 * s * s * t ** 3,
              .16 * Math.sin(t * Math.PI) + arch, s * w), size);
            const out = delta[0] * Math.sin(angle) + delta[2] * Math.cos(angle);
            return sum(center, sum(delta, polar(angle, slope * delta[1], -slope * out)));
          }, (t, s) => petal(t, s).lerp(tip, 0.12 + 0.18 * Math.sin(phase)).lerp(ivory, 0.08 + 0.40 * (1 - smooth(t / 0.56))), fold);
        }
        panels.ellipsoid(sum(center, [0, size * 0.17, 0]), scale([0.18, 0.15, 0.18], size), t => tint.copy(spring).lerp(ivory, 0.68 * (1 - t)).lerp(base, 0.18), fold, 5, 9);
      }
    }
    branches.ellipsoid([0, 0.045, 0], [0.057, 0.11, 0.057], t => tint.copy(stalk).lerp(shade, 0.06 + 0.1 * t));
    return;
  }
  const stalk = color('#657d45');
  const branches = batch(0);
  const trunk = [0, .42 * R, 0], crown = [.025 * R, .71 * R, -.02 * R];
  const branchPaint: Paint = (t, s) => tint.copy(stalk).lerp(shade, .12 + .08 * Math.cos(s * Math.PI)).lerp(spring, .20 * t);
  branches.twig([0, -.035, 0], trunk, .039, branchPaint);
  branches.twig(trunk, crown, .024, branchPaint);
  const forks = Array.from({ length: 6 }, (_, i) => {
    const angle = specimen.rotation + i * TAU / 6;
    const joint = polar(angle, R * .37, R * (.40 + .034 * Math.cos(3 * angle + .7)));
    branches.twig(trunk, joint, .025, branchPaint);
    return joint;
  });
  const rings = [[9, .79, .24], [9, .64, .53], [6, .36, .72], [1, 0, .86]];
  for (const [ring, [count, radius, height]] of rings.entries()) {
    const panels = batch(ring, .018);
    for (let i = 0; i < count; i++) {
      const phase = (ring * 9 + i) * GOLDEN_ANGLE + specimen.rotation;
      const angle = specimen.rotation + TAU * i / count + ring * .27 + .065 * Math.sin(phase * 1.7);
      const size = (.264 + .030 * Math.sin(phase) + (ring === 2 ? .012 : 0)) * R;
      const r = R * Math.max(0, radius + .034 * Math.sin(phase * 2.6));
      const y = R * (height + (ring > 1 ? .029 : .051) * Math.sin(phase * 1.4));
      const center = polar(angle, r, y);
      const joint = ring > 1 ? crown : forks[Math.round((angle - specimen.rotation) * 6 / TAU + 6) % 6];
      const elbow = sum(joint, scale(sum(center, scale(joint, -1)), .60));
      elbow[1] -= R * .055;
      branches.twig(joint, elbow, .015, branchPaint);
      branches.twig(elbow, center, .009, branchPaint);

      const tilt = radius * .83 + .14 * Math.sin(phase * 2);
      const pitchSin = Math.sin(tilt), pitchCos = Math.cos(tilt);
      const local = (aim: number, reach: number, lift: number, side = 0) => {
        const forward = Math.cos(aim) * reach - Math.sin(aim) * side;
        const lateral = Math.sin(aim) * reach + Math.cos(aim) * side;
        return sum(center, scale(polar(angle, forward * pitchCos + lift * pitchSin,
          lift * pitchCos - forward * pitchSin, lateral), size));
      };
      const node = compact(center);
      const close = (point: Point) => sum(node, scale(sum(point, scale(center, -1)), .38));
      const fold: Fold = (point, t) => sum(close(point), [0, size * .31 * t, 0]);
      for (let j = 0; j < 4; j++) {
        const voice = phase + j * GOLDEN_ANGLE;
        const aim = phase * .73 + j * TAU / 4 + .16 * Math.sin(voice);
        const long = .97 + .10 * Math.sin(voice) + (j % 2 ? -.043 : .043);
        panels.surface(8, 8, (t, s) => {
          const width = .65 * profile([.06, .61, .94, 1, .66], t) * (1 + .10 * Math.cos(voice));
          const shoulder = Math.sin(Math.PI * t);
          const edge = t ** 2 * s ** 4;
          const reach = .047 + long * t - .29 * s * s * t ** 3 + .016 * Math.sin(9 * s + voice) * t ** 4;
          const lift = .036 + .145 * shoulder + .087 * s * s * shoulder
            + (.12 * Math.sin(voice) + (j % 2 ? .082 : -.024)) * t * t
            + edge * (.08 * Math.sin(6 * t + 3 * s + voice) + .045 * s);
          return local(aim + .14 * t * Math.cos(voice), reach, lift, s * width);
        }, (t, s) => {
          const throat = 1 - smooth(t / .62);
          const vein = bell((s + .10 * Math.sin(6 * t + voice)) * 7) * Math.sin(Math.PI * t);
          return petal(t, s).lerp(base, .09 + .09 * Math.cos(phase)).lerp(tip, .23 + .15 * Math.sin(voice))
            .lerp(ivory, .055 + .32 * throat + .11 * vein + .095 * smooth((t - .76) / .24))
            .lerp(spring, .22 * throat ** 2).multiplyScalar(.94 + .06 * (1 - s * Math.sin(voice)));
        }, fold);
      }
      // The pedicel enters the calyx; the little five-point crown is tissue,
      // not a detached pale bead. It is anchored at the same node in the bud.
      panels.surface(4, 8, (t, s) => local(s * Math.PI, .153 * Math.sin(Math.PI * t), -.12 + .34 * t),
        t => tint.copy(stalk).lerp(spring, t).lerp(base, .25 * t), close, false);
      panels.surface(4, 10, (t, s) => {
        const a = s * Math.PI + phase;
        const tooth = (1 + Math.cos(5 * s * Math.PI)) * .5;
        return local(a, .025 + (.14 - .044 * smooth((t - .55) / .45)) * t + .032 * tooth * t ** 2,
          .181 + .11 * Math.sin(t * 2.65) + .047 * tooth * t ** 2);
      }, (t, s) => tint.copy(spring).lerp(ivory, .20 + .58 * smooth(t) * (.65 + .35 * Math.cos(5 * s * Math.PI))).lerp(tip, .14), close, false);
    }
  }
}

// Thin, unevenly cupped tepals frame a pin-cushion of carpels and curved stamens.
function anemone(specimen: Specimen, batch: Batches, { color, petal, tint, tip, base, shade }: Palette, cut = false) {
  const R = specimen.length, { count, rotation } = specimen;
  const petals = batch(0), eye = batch(2, .032);
  if (!cut) {
    const ink = color('#18172b'), blue = color('#484161'), collar = color('#a9b9a4');
    petals.ellipsoid(scale([0, 0.045, 0], R), scale([0.263, 0.098, 0.263], R), t => tint.copy(shade).lerp(collar, 0.14 + 0.21 * t));
    for (let i = 0; i < count; i++) {
      const angle = rotation + TAU * i / count;
      const variation = Math.sin(i * GOLDEN_ANGLE + rotation);
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
      const a = i * GOLDEN_ANGLE + rotation;
      const radius = 0.145 + 0.173 * Math.sqrt((i + 0.5) / 72);
      const y = 0.14 + 0.06 * Math.sin(a * 2) ** 2 + 0.08 * (1 - i / 72);
      const end = polar(a, R * radius, R * y);
      eye.twig(polar(a, R * radius * 0.74, 0.075), end, 0.012, () => blue);
      eye.ellipsoid(end, scale([0.026, 0.040, 0.026], R), t => tint.copy(ink).lerp(blue, 0.77 * (1 - t)).lerp(base, 0.08), compact, 4, 7);
    }
    return;
  }
  const ink = color('#21182d'), violet = color('#625173'), collar = color('#b3b99a');
  const pollen = color('#aa9b9d'), moss = color('#66704d');
  const throatFold: Fold = p => [p[0] * .28, p[1] * .63, p[2] * .28];
  petals.ellipsoid(scale([0, .043, 0], R), scale([.277, .074, .277], R),
    t => tint.copy(ink).lerp(moss, .28 + .56 * t), throatFold, 6, 14);
  for (let i = 0; i < count; i++) {
    const phase = i * GOLDEN_ANGLE + rotation;
    const hand = Math.sin(phase), lean = Math.cos(phase * 2.3);
    const angle = rotation + TAU * i / count + .055 * hand;
    petals.surface(19, 16, (t, s) => {
      const edge = smooth((t - .43) / .57), belly = Math.sin(Math.PI * t);
      const width = specimen.width * profile([.084, .64, 1.01, 1.08, .70], t) * (1 + .08 * lean);
      const radius = .177 + (.765 + .040 * hand) * t - (.17 + .02 * lean) * s * s * t ** 3
        + .015 * Math.cos(8 * s + phase) * edge * edge;
      const wave = .022 * Math.sin(t * 19 + s * 7 + phase) * edge * s ** 4;
      const crease = .007 * Math.cos(11 * s + .7 * Math.sin(4 * t + phase)) * belly;
      const y = .041 + .053 * belly + (.157 + .060 * lean) * t ** 2 + .085 * s * s * belly
        + (.086 * s + .026 * hand - .055 * edge) * edge + wave + crease;
      return polar(angle + (.06 + .10 * hand) * t, R * radius, R * y, width * (s + .10 * lean * t));
    }, (t, s) => {
      const veins = Math.cos(11 * s + .7 * Math.sin(4 * t + phase)) ** 6;
      const halo = 1 - smooth((t - .017 - .024 * veins) / .39);
      const rim = smooth((t - .82) / .18) * (.76 + .24 * Math.sin(phase + s * 3));
      return petal(t, s).lerp(tip, .16 + .16 * rim + .07 * veins * Math.sin(Math.PI * t))
        .lerp(shade, .095 * (.5 + .5 * hand)).lerp(collar, .45 * halo * smooth(t / .16)).lerp(ink, .80 * halo ** 2);
    });
  }
  eye.ellipsoid(scale([0, .123, 0], R), scale([.164, .123, .164], R), t => tint.copy(ink).lerp(moss, .34 * (1 - t)), throatFold, 8, 14);
  for (let i = 0; i < 43; i++) {
    const a = i * GOLDEN_ANGLE + rotation;
    const r = .151 * Math.sqrt((i + .6) / 43);
    const h = .123 + .123 * Math.sqrt(1 - (r / .164) ** 2);
    const seed = Math.sin(4.9 * i + rotation);
    eye.surface(3, 4, (t, s) => {
      const rho = (.010 + .007 * Math.sin(Math.PI * t)) * (1.07 - .72 * t ** 3);
      return scale(sum(polar(a + .1 * t, r * (1 + .12 * t), h - .012 + t * (.029 + .01 * seed)),
        polar(s * Math.PI, rho, 0)), R);
    }, t => tint.copy(ink).lerp(moss, .16 + .21 * t + .13 * seed).lerp(violet, .32 * t), throatFold, false);
  }
  for (let i = 0; i < 68; i++) {
    const inner = i < 30, index = inner ? i : i - 30;
    const phase = i * GOLDEN_ANGLE + rotation;
    const swing = Math.sin(phase), h = Math.cos(phase * 2.2);
    const a = rotation + TAU * (index + .30 * h + (inner ? .48 : 0)) / (inner ? 30 : 38);
    const length = (inner ? .187 : .120) + .033 * h;
    const reach = (inner ? .058 : .128) + .027 * swing;
    const root = inner ? .138 : .160;
    const filament = (t: number) => polar(a + .12 * swing * t, root + reach * t ** 1.65,
      .079 + length * t - .022 * swing * t ** 4);
    eye.surface(3, 4, (t, s) => {
      const w = (.0095 - .004 * t) * (1 + .19 * swing);
      return scale(sum(filament(t), polar(s * Math.PI, w, 0)), R);
    }, t => tint.copy(ink).lerp(violet, .40 + .53 * t), throatFold, false);
    const end = filament(1);
    eye.surface(3, 8, (t, s) => {
      const theta = (t - .5) * Math.PI, phi = s * Math.PI;
      const cross = Math.cos(theta) * (.79 + .21 * Math.cos(2 * phi));
      const lobe = .025 * Math.sin(theta) * (1 + .22 * h);
      return scale(sum(end, polar(a + .76 + .85 * swing,
        lobe * (.46 + .40 * h) + .010 * cross * Math.cos(phi),
        lobe * .76 + .010 * cross * Math.sin(phi), .016 * cross * Math.cos(phi))), R);
    }, (t, s) => tint.copy(ink).lerp(violet, .61 + .27 * t + .10 * swing)
      .lerp(pollen, (.08 + .21 * t) * Math.cos(s * Math.PI) ** 4), throatFold, false);
  }
}

// Craspedia: tightly interlocking, five-toothed tubular flowers at different
// stages, each sunk into the receptacle rather than stacked on its surface.
function billyButton(specimen: Specimen, batch: Batches, { color, tint, base, tip }: Palette, cut = false) {
  const radius = specimen.length * .82;
  const middle = radius * 1.16;
  if (!cut) {
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
    return;
  }
  const count = Math.floor(2.75 * specimen.count);
  const saffron = color('#e6aa2d'), bronze = color('#ab6e19'), honey = color('#f8ce62');
  const stalk = color('#819044');
  const core = batch(0);
  core.ellipsoid([0, .052, 0], [.058, .076, .058], t => tint.copy(stalk).lerp(bronze, .48 * (1 - t)), compact, 6, 10);
  const relief = (y: number, a: number) => .016 * Math.sin(23 * y + 3 * a) * Math.cos(12 * a + 9 * y)
    + .014 * Math.sin(13 * y - 5 * a) + .013 * Math.cos(6 * a + 3 * y);
  core.surface(14, 24, (t, s) => {
    const a = s * Math.PI, y = Math.cos(Math.PI * t);
    const r = radius * (.954 + relief(y, a) * Math.sin(Math.PI * t));
    return polar(a, r * Math.sin(Math.PI * t), middle + r * y);
  }, (t, s) => tint.copy(bronze).lerp(saffron, .41 + .23 * Math.sin(34 * t + 6 * s * Math.PI) * Math.cos(13 * s * Math.PI + 31 * t)), compact, false);
  const florets = [batch(1, .015), batch(2, .028)];
  for (let i = 0; i < count; i++) {
    const phase = i * GOLDEN_ANGLE + specimen.rotation;
    const hand = Math.sin(phase * 3.7), maturity = .5 + .5 * Math.cos(i * 5.13 + specimen.rotation);
    const y = 1 - 2 * (i + .5 + .29 * hand) / count;
    const a = phase + (.042 + .055 * (1 - Math.abs(y))) * Math.sin(i * 7.37 + specimen.rotation);
    const r = Math.sqrt(1 - y * y);
    const n = polar(a, r, y), u = polar(a, 0, 0, 1), v = polar(a, -y, r);
    const center = sum([0, middle, 0], scale(n, radius * (.929 + relief(y, a) * r + .011 * hand)));
    const spread = radius * (.128 + .009 * maturity + .017 * hand);
    const turn = phase * 1.64, opened = maturity > .66;
    const local = (h: number, x: number, z: number) => sum(center, sum(scale(n, h), sum(scale(u, x), scale(v, z))));
    const panel = florets[y > .12 ? 1 : 0];
    // Pressed buds still have angular creases. Some open into small notched
    // cups, but their styles fill the throats rather than leaving large pits.
    panel.surface(3, opened ? 10 : 6, (t, s) => {
      const phi = s * Math.PI + turn;
      const tooth = (1 + Math.cos((opened ? 5 : 3) * (s * Math.PI + Math.PI))) * .5;
      const asymmetry = .12 * Math.sin(phi * 2 + phase) + .11 * Math.cos(phi + phase);
      const shape = opened ? profile([.24, .73, .94, 1, .85], t) : profile([.21, .82, .97, .77, .014], t);
      const ornament = (.23 * tooth * t + asymmetry) * t;
      const width = spread * (shape + ornament * (opened ? 1 : 1 - t ** 4));
      const h = spread * ((.84 + .20 * hand + .17 * (1 - maturity)) * t
        + (.33 + .14 * tooth) * Math.sin(Math.PI * t * .8) + .11 * tooth * t ** 3);
      return local(h, Math.cos(phi) * width + .22 * spread * hand * t * t, Math.sin(phi) * width);
    }, (t, s) => {
      const edge = smooth((t - .43) / .57), voice = .5 + .5 * Math.sin(phase + s * Math.PI);
      return tint.copy(saffron).lerp(base, .22).lerp(bronze, (.43 - .27 * t) * (1 - edge) + .16 * (1 - maturity))
        .lerp(honey, (.14 + .30 * maturity + .24 * voice) * edge).lerp(tip, .20 * voice * edge);
    }, compact, opened);
    if (opened && hand > 0) {
      panel.surface(2, 3, (t, s) => {
        const phi = s * Math.PI;
        const width = spread * (.28 + .18 * Math.sin(Math.PI * t)) * (1 - .64 * t ** 3);
        return local(spread * (.29 + (1 + .34 * hand) * t),
          Math.cos(phi) * width + .23 * hand * spread * t, Math.sin(phi) * width);
      }, t => tint.copy(bronze).lerp(saffron, smooth(t * 2)).lerp(honey, .69 * t ** 2), compact, false);
    }
  }
}

const forms = { ranunculus, calla, orchid, iris, hydrangea, anemone, billyButton };
const has = (key: string): key is ExtraSpeciesKey => Object.hasOwn(forms, key);
function build(specimen: Specimen, head: THREE.Group, material: THREE.Material, cut = false): MorphPetal[] {
  if (!has(specimen.key)) return [];
  const batches: Batch[] = [];
  const batch: Batches = (layer, offset = 0) => {
    const builder = createBatch(head, material, layer, offset);
    batches.push(builder);
    return builder;
  };
  const form = cut && specimen.key === 'calla' ? cutCalla : forms[specimen.key];
  form(specimen, batch, palette(specimen), cut);
  return batches.map(builder => builder.mesh());
}

export { has, build };
