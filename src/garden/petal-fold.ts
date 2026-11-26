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
}

// Free blades (lily, rays, poppy) are strips along +Z. Walk the midrib ONCE
// in arc length: the base lies back before the tip releases. Merely rotating
// the finished plane about the socket cannot make this hook or folded seam.
export function foldBlade(g: THREE.BufferGeometry, key: SpeciesKey, openAngle: number, phase: number) {
  const pos = g.getAttribute('position'), uv = g.getAttribute('uv');
  let across = 1;
  while (across < uv.count && uv.getY(across) === uv.getY(0)) across++;
  const middle = Math.floor(across / 2);
  const lily = key === 'lily', poppy = key === 'poppy', ray = !lily && !poppy;
  const targets = [true, false].map(sealed => {
    const shape = pos.clone();
    let y = pos.getY(middle), z = pos.getZ(middle), bend = 0;
    for (let row = 0; row < pos.count / across; row++) {
      const c = row * across + middle, t = uv.getY(c);
      if (row) {
        const dy = pos.getY(c) - pos.getY(c - across), dz = pos.getZ(c) - pos.getZ(c - across);
        const length = Math.hypot(dy, dz), rest = Math.atan2(dy, dz);
        const arch = ease((t - .23) / .70);
        const angle = sealed
          ? openAngle + (ray ? .98 : .91) + (ray ? .97 : 1.25) * arch
          : rest + .10 + (lily ? 2.18 : poppy ? 1.61 : 1.32) * arch;
        bend = angle - rest;
        y += length * Math.sin(angle); z += length * Math.cos(angle);
      }
      const sin = Math.sin(bend), cos = Math.cos(bend);
      for (let i = row * across; i < (row + 1) * across; i++) {
        const s = uv.getX(i) * 2 - 1, x = pos.getX(i) - pos.getX(c);
        const fold = sealed ? .84 : .72 * ease((t - .12) / .82);
        // Pinched margins wrap the bud; broad petals retain corrugations as
        // their shoulders spread. The seam does not scale the entire blade.
        const pleat = poppy ? .13 * Math.sin(9 * s + phase) : 0;
        const rolled = (Math.abs(x) * (.78 + pleat) * Math.abs(s) - .06 * x) * fold;
        const dy = pos.getY(i) - pos.getY(c) + rolled, dz = pos.getZ(i) - pos.getZ(c);
        shape.setXYZ(i, pos.getX(c) + x * (1 - fold * (.55 + .22 * s * s)),
          y + dy * cos + dz * sin, z + dz * cos - dy * sin);
      }
    }
    return shape;
  });
  install(g, targets);
}

// Head-space shells already have an authored sealed pose. Build a second
// *pose*, not an average of the other two: spread the shoulder, hold in the
// lip, and arch/twist the rolling edge. The renderer blends all three poses.
export function foldShell(g: THREE.BufferGeometry, specimen: Specimen, layer: number, phase: number, spans: BladeSpan[]) {
  const { key, length: R } = specimen;
  const open = g.getAttribute('position'), uv = g.getAttribute('uv');
  const shut = g.morphAttributes.position[0], bent = open.clone();
  // Non-blades (receptacles, stamens, spadix) simply ride the flower.
  for (let i = 0; i < open.count; i++) bent.setXYZ(i,
    .5 * (shut.getX(i) + open.getX(i)), .5 * (shut.getY(i) + open.getY(i)), .5 * (shut.getZ(i) + open.getZ(i)));
  const cup = key === 'tulip' || key === 'calla', roll = key === 'dahlia';
  const inner = 1 / (1 + layer * .33);
  for (const { first, end, voice, anchor } of spans) {
    const variation = Math.sin(phase + voice * 2.39996);
    for (let i = first; i < end; i++) {
      const t = anchor ? anchor[0] : uv.getY(i), s = anchor ? anchor[1] : uv.getX(i) * 2 - 1;
      const x = open.getX(i), y = open.getY(i), z = open.getZ(i);
      const lip = ease((t - .37) / .61), belly = Math.sin(Math.PI * t);
      if (key === 'rose') {
        const r = Math.hypot(x, z) || 1;
        const budR = R * (.12 + .20 * belly + .10 * t) * inner + .06 * r;
        shut.setXYZ(i, x / r * budR, .84 * R * t + y * (.57 - .32 * t), z / r * budR);
      }
      const sx = shut.getX(i), sy = shut.getY(i), sz = shut.getZ(i);
      // A calla unwraps at one lap of its seam; rolled florets lift from
      // narrow tubes; the rose's overlapping guards turn aside like spoons.
      const seam = key === 'calla' ? .19 * s : .055 * s * variation;
      const spread = .81 + .095 * variation - (cup ? .55 : roll ? .48 : .52) * lip + seam * lip;
      const bx = sx + (x - sx) * spread, bz = sz + (z - sz) * spread;
      const twist = (key === 'calla' ? .56 * (1 - .5 * s) : key === 'rose' ? .30 : roll ? .22 : .13 * variation) * lip;
      const c = Math.cos(twist), d = Math.sin(twist);
      const lift = (cup ? .09 : roll ? .12 : .19) * inner * R * (belly + .65 * lip);
      let mx = bx * c + bz * d, my = sy + (y - sy) * spread + lift, mz = bz * c - bx * d;
      if (roll) {
        // A dahlia floret is a tube, not a shrunken spoon. Curl its two
        // margins *toward each other* above the midrib before they peel out.
        const r = Math.hypot(x, z) || 1, curl = s * inner * (.47 * belly + .75 * lip) * R * .062;
        mx -= z / r * curl; mz += x / r * curl; my += Math.abs(curl) * .96;
      }
      bent.setXYZ(i, mx, my, mz);
    }
  }
  install(g, [shut, bent]);
}

// Compact heads first expand their shared structure. At that pose every
// floret is still cupped *about its own node*, not the axis of the bouquet.
// Unfolding the tiny blades afterwards never detaches them from that scaffold.
export function foldCluster(g: THREE.BufferGeometry, specimen: Specimen, spans: BladeSpan[]) {
  const open = g.getAttribute('position'), uv = g.getAttribute('uv');
  const shut = g.morphAttributes.position[0], bent = open.clone();
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
