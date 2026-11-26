import * as THREE from 'three';
import { ease } from './bloom-score';
import type { SpeciesKey, Specimen } from './types';

type Attribute = THREE.BufferGeometry['attributes'][string];
// In the custom builders a whorl is one draw. Keep the domains of its joined
// surfaces, so a blade can bend without treating a pollen grain as a petal.
export interface BladeSpan {
  first: number; end: number; voice: number;
  /** A detail attached to a blade (the iris beard) follows its host's UV. */
  anchor?: [t: number, s: number];
}

function install(g: THREE.BufferGeometry, targets: Attribute[]) {
  const position = g.getAttribute('position'), normal = g.getAttribute('normal');
  const normals = targets.map(target => {
    g.setAttribute('position', target); g.deleteAttribute('normal');
    g.computeVertexNormals();
    return g.getAttribute('normal');
  });
  g.setAttribute('position', position); g.setAttribute('normal', normal);
  g.morphAttributes.position = targets; g.morphAttributes.normal = normals;
  return { positions: targets, normals };
}

// Free blades (lily, rays, poppy) are strips along +Z. Walk the midrib ONCE
// in arc length: the base lies back before the tip releases. Merely rotating
// the finished plane about the socket cannot make this hook or folded seam.
export function foldBlade(g: THREE.BufferGeometry, key: SpeciesKey, openAngle: number, phase: number, socketRadius = 0) {
  const pos = g.getAttribute('position'), uv = g.getAttribute('uv');
  let across = 1;
  while (across < uv.count && uv.getY(across) === uv.getY(0)) across++;
  const middle = Math.floor(across / 2);
  const lily = key === 'lily', poppy = key === 'poppy';
  // Different strips store tension along different lengths of the rib. A
  // sunflower ray is a long hooked strap; a cosmos ray folds its broad fan.
  const [lift, hook, tuck, crease] = lily ? [.91, 1.25, 2.78, .72]
    : poppy ? [.91, 1.18, 1.61, .80]
    : key === 'sunflower' ? [.89, 1.04, 1.32, .56]
    : key === 'cosmos' ? [1.02, .70, 1.60, .64]
    : [.98, .97, 1.39, .65];
  const bladeLength = pos.getZ(pos.count - across + middle) - pos.getZ(middle);
  // Radius in head space, including the insertion ring. The tip of a lily
  // meets its neighbours above the pistil instead of crossing through them.
  const lilyRadius = (t: number) => socketRadius * (1 - ease(t))
    + bladeLength * (.18 * Math.sin(Math.PI * t) + .018 * t);
  const hingeSin = Math.sin(openAngle), hingeCos = Math.cos(openAngle);
  const targets = [true, false].map(sealed => {
    const shape = pos.clone();
    let y = pos.getY(middle), z = pos.getZ(middle), bend = 0;
    for (let row = 0; row < pos.count / across; row++) {
      const c = row * across + middle, t = uv.getY(c);
      if (row) {
        const dy = pos.getY(c) - pos.getY(c - across), dz = pos.getZ(c) - pos.getZ(c - across);
        const length = Math.hypot(dy, dz), rest = Math.atan2(dy, dz);
        const arch = ease((t - (key === 'cosmos' ? .12 : .23)) / .70);
        let angle = sealed ? openAngle + lift + hook * arch : rest + .10 + tuck * arch;
        if (sealed && lily) {
          const dr = lilyRadius(t) - lilyRadius(uv.getY(c - across));
          angle = openAngle + Math.acos(Math.max(-1, Math.min(1, dr / length)));
        }
        bend = angle - rest;
        y += length * Math.sin(angle); z += length * Math.cos(angle);
      }
      const sin = Math.sin(bend), cos = Math.cos(bend);
      for (let i = row * across; i < (row + 1) * across; i++) {
        const s = uv.getX(i) * 2 - 1, x = pos.getX(i) - pos.getX(c);
        if (sealed && lily) {
          // Give each tepal a face on a shared hull. A flat, pinched margin
          // leaves daylight between all six blades in the middle of the bud.
          const r = lilyRadius(t), wrap = Math.atan2(x, r) * 1.03;
          const dr = r * (Math.cos(wrap) - 1);
          shape.setXYZ(i, pos.getX(c) * (1 - ease(t)) + r * Math.sin(wrap),
            y + dr * hingeSin, z + dr * hingeCos);
          continue;
        }
        const fold = sealed ? .84 * ease(t / .16) : crease * ease((t - .12) / .82);
        // Pinched margins wrap the bud; broad petals retain corrugations as
        // their shoulders spread. The seam does not scale the entire blade.
        const pleat = poppy ? .13 * Math.sin(9 * s + phase) : 0;
        const handed = poppy || key === 'cosmos' ? .16 * Math.sin(phase) : 0;
        const rolled = (Math.abs(x) * (.78 + pleat) * Math.abs(s) - (.06 + handed) * x) * fold;
        const dy = pos.getY(i) - pos.getY(c) + rolled, dz = pos.getZ(i) - pos.getZ(c);
        shape.setXYZ(i, pos.getX(c) + x * (1 - fold * (.55 + .22 * s * s)),
          y + dy * cos + dz * sin, z + dz * cos - dy * sin);
      }
    }
    return shape;
  });
  return install(g, targets);
}

// Head-space shells already have an authored sealed pose. Build a second
// *pose*, not an average of the other two: spread the shoulder, hold in the
// lip, and arch/twist the rolling edge. The renderer blends all three poses.
export function foldShell(g: THREE.BufferGeometry, specimen: Specimen, layer: number, phase: number, spans: BladeSpan[]) {
  const { key, length: R } = specimen;
  const open = g.getAttribute('position'), uv = g.getAttribute('uv');
  const shut = g.morphAttributes.position?.[0], bent = open.clone();
  if (!shut) throw new Error('Shell folding requires an authored closed pose.');
  // The anemone's dark eye, filaments, and receptacle already form one
  // continuous throat at rest. Leave that support in place and reveal it
  // by opening the cup rather than expanding it across an empty ring.
  if (key === 'anemone') {
    let from = 0;
    for (const { first, end } of spans) {
      for (let i = from; i < first; i++) shut.setXYZ(i, open.getX(i), open.getY(i), open.getZ(i));
      from = end;
    }
    for (let i = from; i < open.count; i++) shut.setXYZ(i, open.getX(i), open.getY(i), open.getZ(i));
  } else {
    // Other non-blades (receptacles, stamens, spadix) ride the sheet's rise.
    for (let i = 0; i < open.count; i++) bent.setXYZ(i,
      .5 * (shut.getX(i) + open.getX(i)), .5 * (shut.getY(i) + open.getY(i)), .5 * (shut.getZ(i) + open.getZ(i)));
  }
  const cup = key === 'tulip', roll = key === 'dahlia';
  const inner = 1 / (1 + layer * .33);
  const hosts = new Map<number, BladeSpan>();
  for (const span of spans) {
    const { first, end, voice, anchor } = span;
    if (anchor) continue;
    hosts.set(voice, span);
    const variation = Math.sin(phase + voice * 2.39996);
    let eye = 0, eyeX = 0, eyeZ = 0;
    if (roll && layer >= 1) {
      // Identify the tight eye and its adjoining turn by the mature tip.
      // The longer outer spoons keep their original fold.
      let stride = 1;
      while (first + stride < end && uv.getY(first + stride) === 0) stride++;
      const tip = end - stride + Math.floor(stride / 2);
      const r = Math.hypot(open.getX(tip), open.getZ(tip)) || 1;
      eye = 1 - ease((r / R - .19) / .32);
      eyeX = open.getX(tip) / r;
      eyeZ = open.getZ(tip) / r;
    }
    for (let i = first; i < end; i++) {
      const t = uv.getY(i), s = uv.getX(i) * 2 - 1;
      const x = open.getX(i), y = open.getY(i), z = open.getZ(i);
      const lip = ease((t - .37) / .61), belly = Math.sin(Math.PI * t);
      const free = ease(t / .24);
      if (key === 'calla') {
        // The spathe is ONE sheet around a spadix. Wind the high lip into a
        // quill and bring the low front lip up over the core. At half-open,
        // the outer lap already flares while the inner lap stays furled.
        const outer = ease((s + 1) / 2), radius = Math.hypot(x, z) || 1;
        const furled = radius * .34 * (1 - .75 * lip) + R * .055 * belly;
        const rise = ease(t) * (.29 * R + .12 * (R - y));
        const a = Math.atan2(x, z), winding = (.20 + .96 * outer) * ease(t);
        const q = radius + (furled - radius) * free, closedAngle = a + winding;
        shut.setXYZ(i, q * Math.sin(closedAngle), y + rise, q * Math.cos(closedAngle));
        // One lap clears the spadix and takes its own weight. The inner lap
        // remains a rolled upright quill, not a smaller final funnel.
        const unwind = .19 + .68 * outer, rm = q + (radius - q) * unwind;
        const sweep = a + winding * (1 - unwind) + .24 * lip * (1 - outer);
        bent.setXYZ(i, rm * Math.sin(sweep), y + rise * (1 - unwind) - .13 * R * lip * outer,
          rm * Math.cos(sweep));
        continue;
      }
      // Taper the authored bud back to the same insertion as the open blade.
      // This is a bend above its socket, not radial expansion from the axis.
      const sx = x + (shut.getX(i) - x) * free, sy = y + (shut.getY(i) - y) * free, sz = z + (shut.getZ(i) - z) * free;
      const hook = eye ? eye * R * ease((t - .16) / .62) : 0;
      if (hook) {
        // The closed eye tucks across the axis, but its insertion stays fixed.
        const wrap = .117 * s * hook * (1 - .46 * lip);
        shut.setXYZ(i, sx - .155 * eyeX * hook + eyeZ * wrap, sy - .038 * hook, sz - .155 * eyeZ * hook - eyeX * wrap);
      } else shut.setXYZ(i, sx, sy, sz);
      if (key === 'ranunculus') {
        // Broad paper-thin cups stay lapped as they spread. Let the whole
        // shoulder open before lifting its hem, with a shallow bank toward
        // the uncovered side. Leave the tight eye gathered over the centre.
        const r = Math.hypot(x, z), sealedR = Math.hypot(sx, sz);
        const eye = 1 - ease((r / R - .10) / .33);
        const spread = (.79 - .34 * lip + variation * (.094 * lip + .046 * s)) * (1 - .49 * eye);
        const rm = sealedR + (r - sealedR) * spread + R * .038 * belly * (1 - eye);
        const a = Math.atan2(x, z) + .061 * lip * (1 + s * variation);
        bent.setXYZ(i, rm * Math.sin(a), sy + (y - sy) * spread + R * (.094 * belly + .039 * lip * (1 - eye)), rm * Math.cos(a));
        continue;
      }
      if (cup) {
        // The tulip's shoulder bows OUT while its lip is still folded back
        // over the centre. One corner peels off the next tepal before its
        // opposite corner; the three inner sails keep the smaller cup.
        const reach = .95 - .55 * lip + .30 * s * lip;
        const r = Math.hypot(x, z), sealedR = Math.hypot(sx, sz);
        const arch = .14 * inner * belly;
        const rm = sealedR + (r - sealedR) * reach + R * arch;
        const a = Math.atan2(x, z) + (.15 + .22 * s) * lip * inner;
        bent.setXYZ(i, rm * Math.sin(a), sy + (y - sy) * reach + R * (.12 * lip - .08 * belly), rm * Math.cos(a));
        continue;
      }
      if (key === 'iris' || key === 'orchid' || key === 'anemone') {
        const fall = key === 'iris' && layer === 0, wing = key === 'orchid' && layer === 1;
        const sepal = key === 'orchid' && layer === 0, standard = key === 'iris' && layer === 1;
        // A fall nods outward from the throat; a standard barely tips and
        // keeps the upper rim pinched. Orchid wings bank toward the column
        // in opposite directions, with a fold across their broad shoulder.
        const spread = fall ? .87 - .28 * lip : standard ? .63 - .35 * lip
          : wing ? .83 - .39 * lip : .74 - .35 * lip;
        const roll = wing ? (voice === 0 ? -1 : 1) * (.16 + .13 * s)
          : (fall ? .12 : .065) * variation;
        const angle = roll * lip, c = Math.cos(angle), d = Math.sin(angle);
        const bx = sx + (x - sx) * spread, bz = sz + (z - sz) * spread;
        const curl = (fall ? .035 * belly + .08 * lip : standard ? .06 * belly + .12 * lip
          : wing ? .11 * (belly + .70 * s * lip) : sepal ? .18 * belly + .10 * lip : .085 * (belly + lip)) * R;
        bent.setXYZ(i, bx * c + bz * d, sy + (y - sy) * spread + curl, bz * c - bx * d);
        continue;
      }
      const seam = .055 * s * variation;
      const spread = .81 + .095 * variation - (roll ? .48 : .52) * lip + seam * lip;
      const bx = sx + (x - sx) * spread, bz = sz + (z - sz) * spread;
      const twist = (roll ? .22 : .13 * variation) * lip;
      const c = Math.cos(twist), d = Math.sin(twist);
      const lift = (roll ? .12 : .19) * inner * R * (belly + .65 * lip);
      let mx = bx * c + bz * d, my = sy + (y - sy) * spread + lift, mz = bz * c - bx * d;
      if (roll) {
        // A dahlia floret is a tube, not a shrunken spoon. Curl its two
        // margins *toward each other* above the midrib before they peel out.
        const r = Math.hypot(x, z) || 1, curl = s * inner * (.47 * belly + .75 * lip) * R * .062;
        mx -= z / r * curl; mz += x / r * curl; my += Math.abs(curl) * .96;
        // The margins of the eye's hooked rolls overlap while the shoulder
        // opens, then peel back with the existing blend to the mature mesh.
        const side = .135 * s * hook * (1 - .35 * lip);
        mx += -eyeX * .211 * hook + eyeZ * side;
        mz += -eyeZ * .211 * hook - eyeX * side;
        my -= .052 * hook;
      }
      bent.setXYZ(i, mx, my, mz);
    }
  }
  const root = new THREE.Vector3();
  const sample = new THREE.Vector3(), a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3();
  for (const { first, end, voice, anchor } of spans) {
    if (!anchor) continue;
    const host = hosts.get(voice);
    if (!host) throw new Error('Blade detail requires a host surface.');
    let stride = 1;
    while (host.first + stride < host.end && uv.getY(host.first + stride) === 0) stride++;
    const rows = (host.end - host.first) / stride;
    const u = (anchor[1] + 1) * .5 * (stride - 1), v = anchor[0] * (rows - 1);
    const col = Math.min(stride - 2, Math.floor(u)), row = Math.min(rows - 2, Math.floor(v));
    const s = u - col, t = v - row, corner = host.first + row * stride + col;
    const surface = (shape: Attribute, at: THREE.Vector3) => {
      // Use the actual triangle under the detail, not an averaged panel or
      // the angular field evaluated at the bead's own UV.
      if (s + t <= 1) return at.fromBufferAttribute(shape, corner).multiplyScalar(1 - s - t)
        .addScaledVector(a.fromBufferAttribute(shape, corner + 1), s).addScaledVector(b.fromBufferAttribute(shape, corner + stride), t);
      return at.fromBufferAttribute(shape, corner + stride + 1).multiplyScalar(s + t - 1)
        .addScaledVector(a.fromBufferAttribute(shape, corner + 1), 1 - t).addScaledVector(b.fromBufferAttribute(shape, corner + stride), 1 - s);
    };
    surface(open, root);
    for (const shape of [shut, bent]) {
      const delta = surface(shape, sample).sub(root);
      for (let i = first; i < end; i++) {
        c.fromBufferAttribute(open, i).add(delta);
        shape.setXYZ(i, c.x, c.y, c.z);
      }
    }
  }
  if (key === 'orchid' && layer === 1 && spans.length === 2) {
    // Split targets, not draws. Each pair differs from the base only in its
    // own wing; this permits independent clocks in the existing wing batch.
    const isolate = (shape: Attribute, { first, end }: BladeSpan) => {
      const target = open.clone();
      for (let i = first; i < end; i++) target.setXYZ(i, shape.getX(i), shape.getY(i), shape.getZ(i));
      return target;
    };
    install(g, spans.flatMap(span => [isolate(shut, span), isolate(bent, span)]));
  } else install(g, [shut, bent]);
}

// Compact heads first expand their shared structure. At that pose every
// floret is still cupped *about its own node*, not the axis of the bouquet.
// Unfolding the tiny blades afterwards never detaches them from that scaffold.
export function foldCluster(g: THREE.BufferGeometry, specimen: Specimen, spans: BladeSpan[]) {
  const open = g.getAttribute('position'), uv = g.getAttribute('uv');
  const shut = g.morphAttributes.position?.[0], bent = open.clone();
  if (!shut) throw new Error('Cluster folding requires an authored closed pose.');
  const globe = specimen.key === 'billyButton';
  for (const { first, end, voice } of spans) {
    let last = first;
    while (last + 1 < end && uv.getY(last + 1) === 0) last++;
    let x = 0, y = 0, z = 0;
    for (let j = first; j <= last; j++) { x += open.getX(j); y += open.getY(j); z += open.getZ(j); }
    const n = last + 1 - first; x /= n; y /= n; z /= n;
    const ny = globe ? y - specimen.length * .82 * 1.16 : specimen.length;
    const norm = Math.hypot(x, ny, z) || 1;
    const amount = .60 + .19 * Math.sin(voice * 2.4 + specimen.rotation);
    for (let i = first; i < end; i++) {
      const t = uv.getY(i), fold = amount * ease(t / .64);
      const ox = open.getX(i), oy = open.getY(i), oz = open.getZ(i);
      const height = (globe ? .066 : .135) * specimen.length * t / norm;
      bent.setXYZ(i, ox + fold * (x - ox + x * height), oy + fold * (y - oy + ny * height), oz + fold * (z - oz + z * height));
    }
  }
  install(g, [shut, bent]);
}
