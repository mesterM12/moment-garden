import * as THREE from 'three';
import { ease } from './bloom-score';
import type { Specimen } from './types';

type Point = [number, number, number];
const TAU = Math.PI * 2;
const lerp = THREE.MathUtils.lerp;
const bell = (x: number) => Math.exp(-x * x);

// Uniform spline knots. Harmonic tangents preserve a maximum shoulder or a
// minimum hooked tip without overshooting as cultivars change size.
function profile(values: readonly number[], t: number) {
  const k = Math.min(values.length - 2, Math.floor(t * (values.length - 1)));
  const u = t * (values.length - 1) - k;
  const d = values[k + 1] - values[k];
  const tangent = (a: number, b: number) => a * b > 0 ? 2 * a * b / (a + b) : 0;
  const m = k ? tangent(values[k] - values[k - 1], d) : d;
  const n = k + 2 < values.length ? tangent(d, values[k + 2] - values[k + 1]) : d;
  return lerp(values[k], values[k + 1], ease(u)) + u * (1 - u) * (m * (1 - u) - n * u);
}

interface Blade {
  layer: number;
  length: number;
  radius: number;
  pitch: number;
  width: number;
  sway: number;
  phase: number;
  lean: number;
}

type InFrame = (t: number, s: number) => Point;

// Surfaces are in the socket's local frame (+Z radial, +Y outward from the
// flower). Closed blades share a hull rather than swinging into thin hooks.
// All three poses use the same first row, including its width.
function matureBlade(key: Specimen['key'], b: Blade): InFrame {
  const { length: L, width: W, layer, pitch, radius, sway, phase, lean } = b;
  const bow = (t: number) => sway * t * t + .022 * Math.sin(Math.PI * t) * Math.sin(phase);
  if (key === 'lily') return (t, s) => {
    const inner = layer !== 0;
    const flank = profile(inner ? [.035, .54, .91, 1, .61, .004] : [.04, .43, .88, .98, .61, .004], t);
    const r = profile(inner ? [0, .21, .46, .70, .90, .88] : [0, .25, .52, .74, .94, .97], t);
    const y = profile(inner ? [0, .16, .25, .22, .08, -.14] : [0, .10, .19, .16, .02, -.20], t);
    const channel = (s * s * .085 - .034 * bell(s * 5)) * flank;
    const edge = .018 * Math.sin(21 * t + phase + 2 * s) * flank * Math.abs(s) ** 4;
    return [W * s * flank * (1 + .12 * sway * s) + 1.08 * bow(t) * L,
      L * (y + channel + edge + .061 * s * t * Math.sin(phase) * flank + lean * t),
      L * (r - .025 * s * s * flank)];
  };
  if (key === 'poppy') return (t, s) => {
    const lip = ease((t - .71) / .29);
    const q = t - lip * (.115 * s * s + .067 * sway * s + .012 * (1 + Math.cos(s * 11 + phase)));
    const r = radius + L * profile([0, .16, .37, .59, .81, .909], q);
    // Signed shoulder lift makes overlaps shingle in one direction; the
    // uneven fine wrinkles at the lip are a separate scale from the pleats.
    const wing = profile([.85, 1.17, 1.19, 1.20, 1.16, 1.08], t) * pitch * .50 * Math.min(1.12, W / .86);
    const a = wing * s + bow(t) * .58;
    const fan = Math.sin(s * 10 + phase * .34 + t * 2.4) + .42 * Math.sin(s * 19 - t * 6 + phase);
    const pleat = (.051 * fan + .039 * s * s) * ease(t / .28) * (1 - .43 * lip);
    const rim = .025 * lip * (Math.sin(9 * s + phase * 1.4) + .34 * Math.sin(s * 17 - phase));
    const y = profile([0, .038, .119, .218, .31, .369], q) + pleat + rim + .072 * s * ease(t / .52) + lean * t + .041 * Math.sin(phase) * t * t;
    return [r * Math.sin(a), L * y, r * Math.cos(a) - radius];
  };
  if (key === 'cosmos') return (t, s) => {
    const lip = ease((t - .76) / .24);
    const flank = profile([.17, .43, .69, .93, 1.06, .89], t);
    const notch = bell((s - .42) / .139) + bell((s + .42) / .139);
    const groove = .023 * Math.cos(3 * Math.PI * s + t + .21 * Math.sin(phase));
    const width = Math.min(W * flank, (radius + L * t) * Math.tan(.525 * pitch));
    return [width * s + L * bow(t) * .43,
      L * (.052 * Math.sin(Math.PI * t) - .031 * t * t + .047 * s * s * flank + groove * flank + lean * t),
      L * (.948 * t - lip * (.081 * s * s + .063 * notch + .014 * Math.cos(12 * s + phase)))];
  };
  if (key === 'daisy') return (t, s) => {
    const span = profile([.30, .47, .66, .90, 1, .64], t);
    const lip = ease((t - .72) / .28);
    const reach = L * ((layer ? .93 : 1) * t - lip * (.088 * s * s + .028 * s ** 4));
    const w = Math.min(W * span, (radius + reach) * Math.tan(.49 * pitch));
    return [w * s + .29 * L * bow(t),
      L * (.036 * Math.sin(Math.PI * t) - .054 * t ** 3 + .021 * span * s * s + .011 * span * Math.cos(s * 8) + lean * t), reach];
  };
  // Disk-facing ray florets on a sunflower are lanceolate, not daisy spoons.
  // The short staggered inner rows keep their angular shoulders at the disk.
  return (t, s) => {
    const span = profile([.13, .65, 1, .89, .59, .004], t);
    const reach = L * t * (1 - .084 * layer);
    const w = Math.min(W * span, (radius + reach) * Math.tan((.59 - .012 * layer) * pitch));
    const keel = bell((s + .065 * Math.sin(t * 4 + phase)) * 4.2);
    const y = (.071 + .019 * layer) * Math.sin(Math.PI * t) - (.051 + .036 * Math.sin(phase)) * t ** 3 + .023 * keel * span
      + .021 * s * s * span + .022 * s * t * span * Math.sin(phase) + .012 * Math.sin(17 * t + phase) * s ** 4 * span;
    return [w * s + L * bow(t) * .53, L * (y + lean * t), reach - .055 * L * span * s * s];
  };
}

function closedBlade(key: Specimen['key'], b: Blade, t: number, s: number): Point {
  const { radius, pitch, phase, length: L, layer, sway } = b;
  const tuck = ease((t - .63) / .37), belly = Math.sin(Math.PI * t);
  let r: number, y: number, a: number;
  if (key === 'lily') {
    r = lerp(radius, L * .019, t) + L * (.19 - .036 * layer) * belly;
    a = (s * (.55 - layer * .045) * pitch + .12 * t) * (1 - .36 * tuck);
    y = L * ((.99 + .01 * layer) * t - (.039 + .011 * sway) * s * s * tuck + .011 * t * s);
  } else if (key === 'poppy') {
    r = lerp(radius, L * .067, t) + L * (.28 + .014 * sway) * Math.sin(Math.PI * t ** .94);
    a = s * pitch * (.61 - .08 * tuck) + .41 * t;
    r *= 1 + (.087 * s + .037 * Math.sin(9 * s - t * 6 + phase)) * belly;
    y = L * (.78 * t + .049 * s * t - .073 * s * s * tuck + .016 * belly * sway);
  } else {
    const sunflower = key === 'sunflower';
    const cosmos = key === 'cosmos';
    // The rays meet above the disk; longer cosmos rays make a deeper bud.
    const top = sunflower ? .46 : cosmos ? .49 : .42;
    const reach = (sunflower ? .155 : cosmos ? .169 : .14) * L;
    r = lerp(radius, L * (.037 + .013 * layer), t) + reach * belly;
    a = s * pitch * (.58 - .06 * tuck) + (.15 + .10 * sway) * t;
    y = L * (top * Math.sin(t * Math.PI * .52) + (.026 * s + .018 * Math.sin(phase)) * belly - .060 * s * s * tuck);
  }
  return [r * Math.sin(a), y, r * Math.cos(a) - radius];
}

export function freePetal(specimen: Specimen, layer: number, radius: number, length: number, swayDraw: number, phaseDraw: number, angleDraw: number) {
  const { key, palette, count } = specimen;
  const sway = (swayDraw - .5) * .19;
  const phase = phaseDraw * TAU;
  const b: Blade = { layer, radius, length, sway, phase, pitch: TAU / count,
    width: specimen.width * (1 - layer * specimen.recipe.shrink) * (key === 'lily' && !layer ? .76 : 1),
    lean: (angleDraw - .5) * -.039 };
  const open = matureBlade(key, b);
  const along = key === 'lily' || key === 'poppy' ? 26 : key === 'cosmos' ? 20 : 16;
  const across = key === 'lily' ? 22 : key === 'poppy' ? 20 : key === 'cosmos' ? 14 : 8;
  const positions: number[] = [], sealed: number[] = [], bent: number[] = [], colors: number[] = [], uvs: number[] = [], index: number[] = [];
  const tip = new THREE.Color(palette.tip), base = new THREE.Color(palette.base), root = new THREE.Color(palette.root);
  const fleck = new THREE.Color(palette.fleck), throat = new THREE.Color('#dcd384'), ink = new THREE.Color('#382333');
  const tint = new THREE.Color();
  // Sparse, basal, slightly elongated freckles. Locations are keyed to the
  // blade's phase, not tessellation or extra draws from the specimen RNG.
  const freckles = key === 'lily' ? Array.from({ length: layer ? 23 : 16 }, (_, i) => {
    const wave = (n: number) => .5 + .5 * Math.sin(i * n + phase);
    return [.13 + .44 * wave(2.39996), .85 * (2 * wave(8.7285) - 1), .013 + .022 * wave(5.913)];
  }) : [];
  for (let j = 0; j <= along; j++) {
    const t = j / along, lock = ease(t / .23), lip = ease((t - .42) / .58);
    for (let i = 0; i <= across; i++) {
      const u = i / across, s = 2 * u - 1;
      const [x, y, z] = open(t, s);
      const [bx, by, bz] = closedBlade(key, b, t, s);
      const sx = lerp(x, bx, lock), sy = lerp(y, by, lock), sz = lerp(z, bz, lock);
      const lily = key === 'lily', poppy = key === 'poppy';
      // A shoulder opens from the insertion ring while the tilted tip stays
      // tucked. The asymmetric lip then releases instead of scaling outward.
      const dense = key === 'daisy' || key === 'sunflower';
      const spread = lily ? .91 - .59 * lip + .17 * s * lip
        : poppy ? .86 - .57 * lip + .23 * s * lip : dense ? .83 - .23 * lip + .10 * s * lip : .90 - .39 * lip + .10 * s * lip;
      const lift = (lily ? .17 : poppy ? .13 : dense ? .076 : .10) * length * lock * lip;
      positions.push(x, y, z);
      sealed.push(sx, sy, sz);
      bent.push(lerp(sx, x, spread), lerp(sy, y, spread) + lift, lerp(sz, z, spread));

      tint.copy(root).lerp(base, ease(t / (poppy ? .49 : .36)))
        .lerp(tip, (.49 + .10 * Math.cos(phase)) * ease((t - .33) / .67));
      if (lily) {
        tint.lerp(throat, (.57 - .23 * s * s) * (1 - ease((t - .09) / .45)));
        let spot = 0;
        for (const [at, as, size] of freckles) spot = Math.max(spot, bell((t - at) / (.69 * size)) * bell((s - as) / (size * 2.9)));
        tint.lerp(fleck, .88 * ease(spot * 1.45));
      } else if (poppy) {
        const mask = .32 + .053 * Math.sin(s * 8 + phase) - .08 * s * s;
        tint.lerp(ink, .86 * (1 - ease((t - .052) / mask)));
        tint.multiplyScalar(.95 + .055 * Math.sin(10 * s + phase * .34 + t * 2.4) * lock);
      } else {
        const ribs = Math.cos((key === 'cosmos' ? 10 : 7) * s + .78 * t);
        tint.multiplyScalar(.99 - .088 * ribs ** 4 * lock - .049 * s * s);
      }
      uvs.push(u, t);
      colors.push(tint.r, tint.g, tint.b);
      if (j < along && i < across) {
        const a = j * (across + 1) + i, b = a + across + 1;
        index.push(a, b, a + 1, b, b + 1, a + 1);
      }
    }
  }
  const g = new THREE.BufferGeometry();
  g.setIndex(index);
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  g.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  const normalFor = (position: THREE.BufferAttribute) => {
    g.setAttribute('position', position);
    g.deleteAttribute('normal');
    g.computeVertexNormals();
    return g.attributes.normal;
  };
  const targets = [sealed, bent].map(points => new THREE.Float32BufferAttribute(points, 3));
  g.morphAttributes.normal = targets.map(normalFor);
  g.morphAttributes.position = targets;
  normalFor(new THREE.Float32BufferAttribute(positions, 3));
  return g;
}
