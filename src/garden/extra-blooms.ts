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
      // A nearly round guard silhouette, with the next cup visible behind
      // each seam. Keep the irregular insertions; taper their effect toward
      // the lip so the outer ring doesn't divide into separate paddles.
      const eye = smooth((inner - .75) / .25);
      const reach = .96 - .88 * inner ** .84 + (.044 * hand + .015 * tilt) * (1 - inner) - eye * .041 * smooth(hand);
      const root = .215 * (1 - inner) ** 1.45 + .014;
      const foot = .024 + .373 * inner ** 1.28 + .011 * tilt * inner;
      const top = .295 + .348 * inner ** .9 + .016 * hand;
      const open: Sample = (t, s) => {
        const lip = smooth((t - .65) / .35), side = smooth(t / .65);
        const edge = s * s;
        const arch = t - (.14 + .06 * s * tilt) * edge * lip;
        const span = pitch * profile([.11, .49, .72, .79, .62], t) * (1 + .125 * hand * (1 - .55 * side) - .16 * eye * lip);
        const sweep = angle + span * s + (hand * .025 + .13) * t + .032 * tilt * lip;
        const radius = lerp(root, reach, arch ** .98) + (.054 * inner + .029) * Math.sin(Math.PI * t);
        // One margin tucks, the other opens into a soft rolled hem. The
        // radial rise makes neighbouring cups lap even when their lengths
        // differ; the roll is localized to the free edge, not the whole blade.
        const rise = lerp(Math.max(0, (radius - root) / (.96 - .88 * inner ** .84 - root)) ** 1.28, arch ** 1.15, inner);
        const hem = lip * bell((s - .42 * tilt) * 1.55);
        const y = lerp(foot, top, rise) + side * (.043 * s + .041 * edge * (1 - eye))
          + .031 * Math.sin(Math.PI * t) * (1 - inner) - .042 * hem;
        return polar(sweep, R * (radius + (.020 - .033 * inner) * hem), R * y);
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
          + (.053 - .047 * inner ** 3) * t;
        // The outer laps cluster at the bud's shoulder, not all necklines
        // sharing a ring. Stagger its edge height with the original hand.
        const overlap = .058 * hand * lip + .025 * tilt * lip * (1 - inner);
        const y = lerp(foot, .72 - .05 * inner, t) + (point[1] / R - lerp(foot, top, t * t)) * (.55 + .25 * lip) + overlap;
        const lap = .024 * (Math.hypot(point[0], point[2]) / R - lerp(root, reach, t));
        return polar(a, R * (radial + lap), R * y);
      });
    }
  }
}

// The two cuts use the same continuous sheet. It overlaps at the throat and
// unwinds into a low apron on one side and a high, recurved hood on the other.
function calla(specimen: Specimen, batch: Batches, palette: Palette) {
  callaWrap(specimen, batch, palette, false);
}

function cutCalla(specimen: Specimen, batch: Batches, palette: Palette) {
  callaWrap(specimen, batch, palette, true);
}

function callaWrap(specimen: Specimen, batch: Batches, { petal, tint, color, shade, tip }: Palette, cut: boolean) {
  const R = specimen.length;
  const yaw = cut ? .32 * Math.sin(specimen.rotation) : .70 * (specimen.rotation / TAU - .5);
  const green = color('#829657'), ochre = color('#a86b26'), gold = color('#dda345'), cream = color('#fff1c7');
  const panels = batch(0);
  // The overlap becomes an opening at the rim. The low inner seam starts the
  // apron while the higher outside edge rolls away from the spadix.
  const sweep = (t: number, s: number) => Math.PI + .24 + .40 * t
    + s * Math.PI * (1.17 - .22 * smooth((t - .40) / .60));
  const spatheFold: Fold = (point, t) => {
    const a = Math.atan2(point[0], point[2]);
    const lip = smooth((t - .58) / .42);
    const r = Math.hypot(point[0], point[2]);
    return polar(a + .94 * smooth(t), r * (1 - .70 * smooth(t)) * (1 - .63 * lip),
      point[1] + R * smooth(t) * (.29 + .10 * Math.cos(a - yaw)));
  };
  panels.surface(cut ? 32 : 28, cut ? 58 : 54, (t, s) => {
    const a = sweep(t, s), lip = smooth((t - .75) / .25);
    const back = .5 - .5 * Math.cos(a + .11), hood = back ** 6, flank = Math.sin(a);
    const roll = Math.sin(lip * Math.PI * .90);
    const apron = (.5 + .5 * Math.cos(a - .26)) ** 3;
    const seam = s * (.009 + .042 * t);
    const radius = (cut ? .028 : .035) + .095 * t + ((cut ? .37 : .43) + .065 * flank) * t ** 1.68
      + seam + lip * (.099 + .075 * hood) + roll * (.043 + .051 * apron);
    const y = -.017 + .71 * t + (.43 * hood + .11 * flank + .047 * s) * t ** 2
      - (.077 + .048 * apron) * lip ** 2 * (1 - hood);
    const center = polar(yaw, -.13 * hood * lip, y, .076 * t * t);
    return scale(sum(center, polar(a + yaw, radius, 0)), R);
  }, (t, s) => {
    const a = sweep(t, s), lip = smooth((t - .70) / .30);
    const throat = bell((t - .42) / .23) * (.54 + .46 * Math.sin(a * .5) ** 2);
    const veins = Math.cos(8 * a + .85 * Math.sin(a + 4.2 * t)) ** 8;
    return petal(t, .72 * Math.sin(a)).lerp(shade, .30 * throat + .13 * throat * veins)
      .lerp(green, .86 * (1 - smooth(t / .40))).lerp(tip, .23 * lip)
      .lerp(cream, .07 * t + .18 * lip * (.5 + .5 * Math.cos(a)));
  }, spatheFold);
  // The ovary closes the wrap at the stem. The fleshy spike stays put while
  // the spathe unrolls; its staggered florets are relief, not painted noise.
  panels.ellipsoid(scale([0, .062, 0], R), scale([.043, .080, .043], R),
    t => tint.copy(green).lerp(gold, .77 * (1 - t)), p => p, cut ? 8 : 6, cut ? 12 : 10);
  const spadixHeight = cut ? .62 : .59;
  const grain = (t: number, a: number) => smooth((.12 + Math.cos(a * 6 + TAU * 4 * t) * Math.cos(TAU * 4 * t)) / 1.12);
  panels.surface(24, cut ? 24 : 20, (t, s) => {
    const a = s * Math.PI;
    const shaft = Math.sin(Math.PI * t) ** .48 * (1 - .16 * t);
    const r = .002 + shaft * (.058 + .012 * grain(t, a));
    return scale(sum(polar(yaw, -.036 * t ** 2, .105 + spadixHeight * t, .038 * t ** 2), polar(a, r, 0)), R);
  }, (t, s) => {
    const raised = grain(t, s * Math.PI);
    return tint.copy(ochre).lerp(gold, .56 + .44 * raised).lerp(cream, .16 * t + .21 * raised);
  }, p => p, false);
}

// A Phalaenopsis face: three slim sepals sit behind the two overlapping
// wings. The three-lobed labellum cups the column, then projects as a lip.
function orchid(specimen: Specimen, batch: Batches, { color, petal, base, shade, tip, fleck, tint }: Palette) {
  const R = specimen.length, twist = (specimen.rotation / TAU - .5) * .38;
  const sepals = batch(0), wings = batch(1), lip = batch(2, .022);
  const ivory = color('#fff0d5'), pollen = color('#e8a132');
  // The sepals wrap around the inner packet rather than shrinking the face
  // about its center. Roots stay at the insertion throughout the bloom.
  const wrap = (axis: number, height: number, girth: number, span: number,
    turn: number, width: (t: number) => number, offset: (t: number) => number): Fold => (p, t) => {
    const aim = axis + turn * t;
    const s = (p[0] * Math.cos(aim) - p[2] * Math.sin(aim)) / width(t) - offset(t);
    const shoulder = Math.sin(Math.PI * t), bend = smooth(t / .47);
    const a = axis + .32 * t + s * span * (.55 + .45 * shoulder);
    const closed = polar(a, R * (.025 + girth * shoulder ** .77 + s * .013 * shoulder),
      R * (height * t - .036 * s * s * smooth(t)));
    return p.map((n, i) => lerp(n, closed[i], bend));
  };
  for (const [i, aim] of [Math.PI, .70, -.70].entries()) {
    const a = aim + twist;
    const width = (t: number) => R * (i ? .207 : .235) * profile([.05, .56, .88, 1, .76], t);
    const bias = i ? (i === 1 ? .11 : -.10) : .07 * Math.sin(specimen.rotation);
    const offset = (t: number) => bias * t * t;
    sepals.surface(16, 12, (t, s) => {
      // A rounded end, not a pointed shield: retract the corner along the
      // rib in proportion to the same radius used for the side of the cap.
      const cap = 1 - Math.sqrt(1 - .95 * s * s);
      const r = .035 + (i ? .76 : .935) * t - (.18 - bias * s * .15) * cap * smooth((t - .57) / .43);
      const y = -.034 + .115 * t ** 2 + .058 * s * s * Math.sin(Math.PI * t)
        - .028 * smooth((t - .74) / .26) * (1 - s * s);
      return polar(a, r * R, y * R, (s + offset(t)) * width(t));
    }, (t, s) => petal(t, s).lerp(shade, .13 + .11 * bell(s * 3) * (1 - t)),
    wrap(a, i ? .682 : .704, .195, i ? .74 : .80, 0, width, offset));
  }
  for (const sign of [-1, 1]) {
    const a = sign * 1.63 + twist, turn = sign * .13;
    const bias = .22 * Math.cos(specimen.rotation + sign * 1.7);
    const offset = (t: number) => (-sign * .11 + bias) * t * t;
    // Broad shoulders give way to a domed cap on each wing. The inward
    // margin folds back early, leaving the opposite margin flatter and long.
    const width = (t: number) => specimen.width * profile([.075, .46, .89, 1.10, 1.01], t);
    wings.surface(20, 16, (t, s) => {
      const wing = sign * s, cap = 1 - Math.sqrt(1 - .96 * s * s);
      const shoulder = Math.sin(Math.PI * t), rim = smooth((t - .56) / .44);
      const r = .035 + .955 * t - rim * ((.252 + .044 * wing) * cap + .019 * bias * wing);
      const hem = bell((wing + .48) * 2.5) * smooth((t - .77) / .23);
      const y = .038 + .112 * Math.sin(t * 2.1) + .123 * s * s * shoulder
        + .058 * wing * shoulder * t - .066 * hem;
      return polar(a + turn * t, r * R, y * R, width(t) * (s + offset(t)));
    }, (t, s) => {
      const vein = Math.cos(s * 13 / (.8 + .4 * t) + sign * t * 1.2) ** 12;
      const throat = bell((t - .26) / .26) * bell(2 * s);
      return petal(t, s).lerp(tip, .18 + .22 * t).lerp(ivory, .22 * throat)
        .lerp(fleck, .18 * vein * throat);
    }, wrap(a, .672, .170, .80, turn, width, offset));
  }
  const tuckLip: Fold = (p, t) => {
    const pull = smooth(t), side = p[0] * Math.cos(twist) - p[2] * Math.sin(twist);
    const reach = p[0] * Math.sin(twist) + p[2] * Math.cos(twist);
    return polar(twist, reach * (1 - .84 * pull), p[1] + .112 * R * pull, side * (1 - .66 * pull));
  };
  const apron: Sample = (t, s) => {
    const rim = smooth((t - .69) / .31), notch = bell(s * 3.15);
    const w = profile([.028, .095, .16, .211, .141], t);
    const r = .04 + .60 * t - rim * (.10 * notch + .105 * s * s);
    const y = .132 + .155 * Math.sin(Math.PI * t * .91) - .027 * t
      + .062 * s * s * t - .035 * rim * (1 - notch);
    return scale(polar(twist, r, y, s * w), R);
  };
  const host = lip.surface(16, 14, apron, (t, s) => {
    const flash = bell((t - .24) / .16) * bell(2.35 * s);
    const streak = Math.cos(15 * s * (1 - .45 * t) + 1.3 * t) ** 8;
    return tint.copy(base).lerp(fleck, .46 + .19 * streak * (1 - t))
      .lerp(ivory, .85 * flash).lerp(pollen, .51 * flash * streak)
      .lerp(tip, .67 * smooth((t - .65) / .35));
  }, tuckLip);
  for (const sign of [-1, 1]) {
    lip.surface(12, 8, (t, s) => {
      const cheek = sign * (.048 + .15 * Math.sin(t * 2.36));
      const w = profile([.026, .063, .078, .080, .024], t);
      return scale(polar(twist, .044 + .324 * t - .058 * s * s * t ** 3,
        .133 + .205 * Math.sin(t * 2.35) + .10 * s * Math.sin(Math.PI * t), cheek + s * w), R);
    }, (t, s) => {
      const stripes = Math.cos(s * 10 + t * 11) ** 9;
      return tint.copy(ivory).lerp(pollen, .62 * bell((t - .41) / .31))
        .lerp(fleck, .58 * Math.max(0, stripes) * Math.sin(Math.PI * t)).lerp(base, .63 * t ** 2);
    }, tuckLip);
    const t = .22, s = sign * .29, onLip = apron(t, s);
    lip.ellipsoid(sum(onLip, [0, .017 * R, 0]), scale([.021, .028, .028], R),
      a => tint.copy(ivory).lerp(pollen, .73 * a), p => tuckLip(p, t), 3, 4, { uv: [t, s], voice: host });
  }
  // Fused column behind the lip: an ivory hook with a broad anther cap,
  // distinct from the two gold callus ridges growing out of the lip itself.
  lip.surface(9, 8, (t, s) => {
    const a = s * Math.PI, cap = bell((t - .81) / .19);
    const r = profile([.056, .049, .046, .075, .003], t);
    return scale(polar(twist, -.064 + .215 * t ** 2 + r * .85 * Math.cos(a),
      .077 + .284 * Math.sin(1.66 * t) + r * .35 * cap * Math.cos(a), r * Math.sin(a)), R);
  }, (t, s) => tint.copy(ivory).lerp(shade, .40 * (1 - t) + .12 * Math.cos(Math.PI * s) ** 2)
    .lerp(pollen, .68 * bell((t - .88) / .14) * (.5 + .5 * Math.cos(Math.PI * s))),
  p => [p[0] * .53, .077 * R + (p[1] - .077 * R) * .73, p[2] * .44], false);
  sepals.ellipsoid([0, .02, 0], [.105, .11, .11], t => tint.copy(shade).lerp(base, .28 * (1 - t)), p => p, 6, 12);
}

// Three spoon-shaped falls with a narrow haft alternate with three pale,
// incurved standards. The beard sits on a veined signal patch on each fall.
function iris(specimen: Specimen, batch: Batches, { color, petal, tint, fleck, tip }: Palette) {
  const R = specimen.length;
  // A gap between the two forward falls lets the stem approach from below
  // without crossing a drooping blade. The face still shows both beards.
  const twist = Math.PI / 3 + (specimen.rotation / TAU - .5) * .64;
  const falls = batch(0), standards = batch(1);
  const cream = color('#f9eabf'), gold = color('#dd9428'), green = color('#77864c');
  falls.ellipsoid([0, .082, 0], [.102, .14, .10], t => tint.copy(green).lerp(tip, .64 * (1 - t)), p => p);
  for (let i = 0; i < 3; i++) {
    const a = twist + i * TAU / 3, crown = a + Math.PI / 3;
    const fall: Sample = (t, s) => {
      const bias = Math.sin(a + 1.7), cap = 1 - Math.sqrt(1 - .96 * s * s);
      const rim = smooth((t - .53) / .47), shoulder = Math.sin(Math.PI * t);
      const w = specimen.width * profile([.078, .25, .68, .95, .65], t);
      // Broad waves near the margins, with a bank in opposite directions
      // across the falls. Keep the haft smooth where it carries the beard.
      const wave = .051 * Math.sin(t * 16 + s * 3.1 + i * 2) * smooth((t - .29) / .58) * s ** 4;
      const y = .082 + .267 * shoulder - .415 * t ** 2 + .103 * s * s * shoulder
        + (.059 * bias * s + .12 * cap) * rim + wave;
      return polar(a + .096 * t, R * (.035 + .945 * t - (.203 + .038 * bias * s) * cap * rim), y * R, (s + .13 * bias * rim) * w);
    };
    const foldFall: Fold = (p, t) => {
      const bend = smooth(t / .78), rim = smooth((t - .57) / .43);
      const aim = Math.atan2(p[0], p[2]);
      const side = Math.sin(aim - a);
      const r = lerp(Math.hypot(p[0], p[2]), R * (.216 - .167 * rim + .025 * side), bend);
      return polar(aim + .26 * bend, r, lerp(p[1], R * (.07 + .72 * t ** 1.24 - .15 * side ** 2 * t), bend));
    };
    const voice = falls.surface(24, 20, fall, (t, s) => {
      const v = s * (1.6 + 2.7 * t), patch = 1 - smooth((Math.abs(v) + ((t - .24) / .39) ** 2 - .43) / .56);
      const vein = Math.cos(17 * s / (.39 + t) + 5 * t + .7 * Math.sin(7 * s)) ** 10;
      return petal(t, s).lerp(fleck, .15 * smooth(t / .55))
        .lerp(cream, .94 * patch).lerp(gold, .40 * patch * bell(7.5 * s) * bell((t - .31) / .2))
        .lerp(fleck, .41 * patch * vein * (1 - bell(4.5 * s)));
    }, foldFall);
    // Stagger the hairs in two close rows and taper the crest from the
    // throat. Every hair has its own attachment but follows the fall's pose.
    for (let j = 0; j < 15; j++) {
      const t = .115 + j * .025, s = (j % 2 ? -.17 : .17) * (1 - .52 * j / 15);
      const anchor = fall(t, s), shut = foldFall(anchor, t);
      const size = .014 + .010 * Math.sin((j + 2) * Math.PI / 18);
      const point = sum(anchor, [0, size * R * .68, 0]);
      const lean = 1.38 * smooth(t / .37);
      const foldGrain: Fold = p => {
        // Rotate the beard with the haft instead of leaving it outside the bud.
        const delta = p.map((n, k) => n - anchor[k]);
        const side = delta[0] * Math.cos(a) - delta[2] * Math.sin(a);
        const radial = delta[0] * Math.sin(a) + delta[2] * Math.cos(a);
        return sum(shut, polar(Math.atan2(shut[0], shut[2]), radial * Math.cos(lean) - delta[1] * Math.sin(lean),
          radial * Math.sin(lean) + delta[1] * Math.cos(lean), side));
      };
      falls.ellipsoid(point, scale([size * .69, size * 1.72, size * .87], R),
        u => tint.copy(gold).lerp(cream, .67 * (1 - u) ** 2), foldGrain, 4, 7, { uv: [t, s], voice });
    }
    standards.surface(20, 16, (t, s) => {
      const rim = smooth((t - .53) / .47), shoulder = Math.sin(Math.PI * t);
      const bias = Math.cos(crown + 1.2), cap = 1 - Math.sqrt(1 - .96 * s * s);
      const w = specimen.width * profile([.047, .29, .66, .90, .38], t);
      const r = .043 + .56 * t - .33 * t ** 4 - .108 * s * s * shoulder
        + .065 * rim * (1 - cap) * bell((s - .47 * bias) * 1.8);
      const y = .078 + .756 * Math.sin(t * 1.47) - (.172 + .068 * bias * s) * cap * rim
        + .042 * Math.sin(t * 15 + s * 3.2 + i) * s ** 4 * shoulder;
      return polar(crown + .24 * t, R * r, R * y, (s + .14 * bias * rim) * w);
    }, (t, s) => {
      const rib = bell((s + .13 * Math.sin(3 * t)) * 2.4) * Math.sin(Math.PI * t);
      return petal(t, s).lerp(tip, .36 + .25 * t)
        .lerp(cream, .35 * (1 - smooth(t / .43)) + .19 * rib);
    }, (p, t) => {
      const bend = smooth(t / .75), rim = smooth((t - .45) / .55);
      const a = Math.atan2(p[0], p[2]);
      const r = lerp(Math.hypot(p[0], p[2]), R * (.148 - .112 * rim), bend);
      return polar(a + .21 * bend, r, lerp(p[1], R * (.07 + .70 * t), bend));
    });
  }
}

// A mophead branches into short cymes. Each showy floret carries four sepals
// on a tilted socket, surrounding a much smaller flower with its own crown.
function hydrangea(specimen: Specimen, batch: Batches, { color, petal, tint, tip, base, shade }: Palette, cut = false) {
  const R = specimen.length;
  const ivory = color('#eee9ca'), spring = color('#a2b36b');
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
  // The old table cut has flatter outer faces and a slightly taller dome.
  const rise = cut ? 0 : .02;
  for (const [ring, [count, radius, height]] of rings.entries()) {
    const panels = batch(ring, .018);
    for (let i = 0; i < count; i++) {
      const phase = (ring * 9 + i) * GOLDEN_ANGLE + specimen.rotation;
      const angle = specimen.rotation + TAU * i / count + ring * .27 + .065 * Math.sin(phase * 1.7);
      const size = (.264 + .030 * Math.sin(phase) + (ring === 2 ? .012 : 0)) * R;
      const r = R * Math.max(0, radius + .034 * Math.sin(phase * 2.6));
      const y = R * (height + rise * ring / 3 + (ring > 1 ? .029 : .051) * Math.sin(phase * 1.4));
      const center = polar(angle, r, y);
      const joint = ring > 1 ? crown : forks[Math.round((angle - specimen.rotation) * 6 / TAU + 6) % 6];
      const elbow = sum(joint, scale(sum(center, scale(joint, -1)), .60));
      elbow[1] -= R * .055;
      branches.twig(joint, elbow, .015, branchPaint);
      branches.twig(elbow, center, .009, branchPaint);

      const tilt = radius * (cut ? .83 : .76) + .14 * Math.sin(phase * 2);
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
function anemone(specimen: Specimen, batch: Batches, { color, petal, tint, tip, shade }: Palette, cut = false) {
  const R = specimen.length, { count, rotation } = specimen;
  // The v2 blade was a little wider and shallower at the lip.
  const bladeLength = cut ? .765 : .788, lipHeight = cut ? .157 : .111;
  const bladeFold: Fold = cut ? bud : (point, t) => [point[0] * .28, point[1] * .63 + t * .473, point[2] * .28];
  const petals = batch(0), eye = batch(2, .032);
  const ink = color('#21182d'), violet = color('#625173'), collar = color('#b3b99a');
  const pollen = color('#aa9b9d'), moss = color('#66704d');
  const throatFold: Fold = p => [p[0] * .28, p[1] * .63, p[2] * .28];
  const socketHeight = cut ? .074 : .062;
  petals.ellipsoid(scale([0, .043, 0], R), scale([.277, socketHeight, .277], R),
    t => tint.copy(ink).lerp(moss, .28 + .56 * t), throatFold, 6, 14);
  for (let i = 0; i < count; i++) {
    const phase = i * GOLDEN_ANGLE + rotation;
    const hand = Math.sin(phase), lean = Math.cos(phase * 2.3);
    const angle = rotation + TAU * i / count + .055 * hand;
    petals.surface(19, 16, (t, s) => {
      const edge = smooth((t - .43) / .57), belly = Math.sin(Math.PI * t);
      const width = specimen.width * profile([.084, .64, 1.01, 1.08, .70], t) * (1 + .08 * lean);
      const radius = .177 + (bladeLength + .040 * hand) * t - (.17 + .02 * lean) * s * s * t ** 3
        + .015 * Math.cos(8 * s + phase) * edge * edge;
      const wave = .022 * Math.sin(t * 19 + s * 7 + phase) * edge * s ** 4;
      const crease = .007 * Math.cos(11 * s + .7 * Math.sin(4 * t + phase)) * belly;
      const y = .041 + .053 * belly + (lipHeight + .060 * lean) * t ** 2 + .085 * s * s * belly
        + (.086 * s + .026 * hand - .055 * edge) * edge + wave + crease;
      return polar(angle + (.06 + .10 * hand) * t, R * radius, R * y, width * (s + .10 * lean * t));
    }, (t, s) => {
      const veins = Math.cos(11 * s + .7 * Math.sin(4 * t + phase)) ** 6;
      const halo = 1 - smooth((t - .017 - .024 * veins) / .39);
      const rim = smooth((t - .82) / .18) * (.76 + .24 * Math.sin(phase + s * 3));
      return petal(t, s).lerp(tip, .16 + .16 * rim + .07 * veins * Math.sin(Math.PI * t))
        .lerp(shade, .095 * (.5 + .5 * hand)).lerp(collar, .45 * halo * smooth(t / .16)).lerp(ink, .80 * halo ** 2);
    }, bladeFold);
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
    const length = (inner ? .187 : .120) + .033 * h - (cut ? 0 : .017);
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
  const count = Math.floor((cut ? 2.75 : 2.65) * specimen.count);
  // The older cut holds a tighter ball while the floret mouths unfold.
  const reach = cut ? 1 : .94;
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
    const center = sum([0, middle, 0], scale(n, radius * ((cut ? .929 : .925) + relief(y, a) * r + .011 * hand)));
    const spread = radius * (.128 + .009 * maturity + .017 * hand);
    const turn = phase * 1.64, opened = maturity > .66;
    // Run small patches of uneven growth across the globe rather than
    // roughening individual vertices. Splayed tubes keep their own sockets.
    const patch = Math.sin(4.5 * y + 2 * a) * r * r;
    const lean = .23 * hand + .27 * patch, nod = .21 * Math.cos(4 * y - a) * r;
    const local = (h: number, x: number, z: number) => sum(center, sum(scale(n, h * reach), sum(scale(u, x), scale(v, z))));
    const panel = florets[y > .12 ? 1 : 0];
    // Narrow waists rise into splayed, notched mouths. The pressed buds
    // remain small and domed, with their longest axis pointing out.
    panel.surface(3, opened ? 10 : 6, (t, s) => {
      const phi = s * Math.PI + turn;
      const tooth = (1 + Math.cos((opened ? 5 : 3) * (s * Math.PI + Math.PI))) * .5;
      const shape = opened ? profile([.24, .53, .77, .99, .94], t) : profile([.21, .75, .90, .63, .014], t);
      const rim = t * t, asymmetry = .078 * Math.sin(phi * 2 + phase);
      const width = spread * (shape * (1 + .13 * patch * t + asymmetry * t) + (opened ? .12 * tooth * rim : 0));
      const h = spread * ((opened ? 1.23 : 1.02) * t + .28 * Math.sin(Math.PI * t * .80)
        + (.25 * patch + .16 * hand) * t + (opened ? .24 * tooth * rim : .06 * tooth * t * (1 - t)));
      return local(h, Math.cos(phi) * width + spread * lean * rim, Math.sin(phi) * width + spread * nod * rim);
    }, (t, s) => {
      const edge = smooth((t - .43) / .57), voice = .5 + .5 * Math.sin(phase + s * Math.PI);
      return tint.copy(saffron).lerp(base, .22).lerp(bronze, (.43 - .27 * t) * (1 - edge) + .16 * (1 - maturity))
        .lerp(honey, (.14 + .30 * maturity + .24 * voice) * edge).lerp(tip, .20 * voice * edge);
    }, compact, opened || !cut);
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
