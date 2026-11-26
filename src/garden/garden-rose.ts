import * as THREE from 'three';
import { ease } from './bloom-score';
import { ROSE_HEAD_PROFILE } from './botany';
import { petalHand } from './petal-hand';
import type { MorphPetal, Specimen } from './types';

export const ROSE_GUARDS = 8;
const TAU = 2 * Math.PI;
const mix = THREE.MathUtils.lerp;
const bell = (x: number) => Math.exp(-x * x);

type Point = [number, number, number];

// Unequal outer guards, irregular shoulder folds, then four off-axis pockets.
// A pocket's curled lips face its own shallow hollow, not the axis of the head.
const shoulder = [
  // angle, reach, rise, width, sweep
  [.16, .69, .46, .36, -.30], [.95, .64, .50, .27, .22], [1.84, .73, .43, .37, .19],
  [2.69, .64, .47, .31, -.27], [3.35, .70, .47, .30, .22], [4.09, .65, .48, .32, -.18],
  [4.93, .71, .43, .34, .21], [5.65, .63, .48, .29, -.18],
];
const pockets = [
  // angle of centre, distance, rim height, local reach, hand and breadth
  [.51, .233, .54, .302, 1, 1.18], [2.49, .267, .49, .260, -1, .83],
  [3.82, .207, .53, .254, 1, .72], [5.20, .218, .48, .278, -1, 1.14],
];

export function gardenRose(specimen: Specimen, head: THREE.Group, material: THREE.Material): MorphPetal[] {
  const { length: R, rotation, timestamp, palette } = specimen;
  const root = new THREE.Color(palette.root), base = new THREE.Color(palette.base), tip = new THREE.Color(palette.tip);
  const color = new THREE.Color(), entries: MorphPetal[] = [];

  function petal(layer: number, angle: number, reach: number, rise: number, span: number, sweep: number, pocket?: Point) {
    const index = entries.length;
    const word = petalHand(timestamp, index, 0);
    const skew = ((word >>> 16) / 32767.5) - 1;
    const softness = (word & 255) / 255;
    const wave = .5 + (word >>> 8 & 255) / 60;
    const guard = layer === 0;
    const fold = !!pocket;
    const hand = Math.sign(sweep) || 1;
    const [cx, floor, cz] = pocket ?? [0, .015, 0];
    const socket = guard ? .12 : fold ? .018 : .095;
    const positions: number[] = [], closed: number[] = [], bent: number[] = [];
    const colors: number[] = [], uv: number[] = [], indices: number[] = [];
    // Tucked inner petals are smaller on screen. Spend the finer grid on the silhouette.
    const across = guard ? 16 : 12, along = guard ? 24 : 18;
    for (let j = 0; j <= along; j++) {
      const t = j / along, body = Math.sin(Math.PI * t), lip = ease((t - .62) / .38);
      const side = ease(t / .50);
      for (let i = 0; i <= across; i++) {
        const u = i / across, s = 2 * u - 1;
        const wing = Math.abs(s) ** 2.4;
        const midrib = t - (fold ? .18 : .23) * lip * wing;
        const lobe = bell((s + .28 + .18 * skew) * 3.1) - .58 * bell((s - .30) * 4.1);
        const turn = angle + sweep * t ** 1.35 + .14 * skew * t;
        const loosen = ease((t - .73) / .27);
        const curled = fold ? (1.12 + .29 * softness + .23 * hand * s) * s : (.85 + .26 * softness) * s;
        const width = span * (.08 + .92 * Math.sin(Math.PI * (.018 + .75 * t)) ** .70);
        const flank = width * (Math.sin(curled) + .08 * s * skew * side);
        const cup = width * (1 - Math.cos(curled)) * (fold ? .66 : .72);
        // Rose petals first grow out from the receptacle, then turn up the
        // wall of the cup. The distal edge rolls back at a different rate per side.
        const rim = lip * (.40 + .49 * lobe + .25 * skew * s);
        const r = mix(socket, reach, Math.sin(Math.PI * midrib * .51) ** (guard ? 1.83 : 1.32)) - cup
          + (guard ? .068 : fold ? -.077 : -.062) * rim - wing * .024 * loosen;
        const crimp = (fold ? .006 : .016 + .007 * softness) * loosen * (Math.sin(s * 5 + wave) - .37 * Math.sin(s * 9 + wave));
        const y = floor + rise * midrib ** (guard ? 1.28 : fold ? .95 : 1.26) + cup * (fold ? .68 : .69)
          + rim * (guard ? -.058 : fold ? -.015 : -.032) + crimp + (fold ? .049 * hand : .051 * skew) * s * t;
        const x = cx + r * Math.sin(turn) + flank * Math.cos(turn);
        const z = cz + r * Math.cos(turn) - flank * Math.sin(turn);
        // Preserve the booked rose envelope rather than repacking its neighbours.
        const [radius, height, offset] = ROSE_HEAD_PROFILE;
        const axial = (R * y - offset) / height;
        const radial = Math.hypot(x, z) * R / radius;
        const available = Math.sqrt(Math.max(.001, .995 - axial * axial));
        // Soften the limit across the last 12% to avoid a kink on the lip.
        const excess = Math.max(0, radial / available - .88) / .12;
        const radialFit = excess ? (.88 + .12 * Math.tanh(excess)) * available / radial : 1;
        positions.push(R * x * radialFit, R * y, R * z * radialFit);

        // The same sockets support all poses. A sealed guard wraps round the
        // folded heart; its shoulder leaves the seam before the top rolls down.
        const sockLock = ease(t / .37);
        const a = Math.atan2(x, z), openR = Math.hypot(x, z) * radialFit;
        const budR = (.10 + .24 * Math.sin(Math.PI * t * .86) - .10 * t ** 3) * (guard ? 1 : fold ? .60 : .79);
        const budA = a + (.53 + .25 * s) * t * (fold ? .60 : 1);
        const shutR = mix(openR, fold ? mix(openR, budR, .59) : budR, sockLock);
        const shutY = mix(y, floor * .63 + t * (guard ? .83 : fold ? .45 : .68) - .071 * s * s * lip, sockLock);
        closed.push(R * shutR * Math.sin(budA), R * shutY, R * shutR * Math.cos(budA));
        const peel = sockLock * (guard ? .88 - lip * (.39 - .30 * s) : .63 - lip * (.42 - .12 * s));
        const bendR = mix(shutR, openR, peel) + (guard ? .066 : .028) * body * sockLock;
        const bendA = mix(budA, a, peel) + .12 * s * lip;
        bent.push(R * bendR * Math.sin(bendA), R * (mix(shutY, y, peel) + (guard ? .053 : .035) * lip), R * bendR * Math.cos(bendA));

        // Pigment follows the buried face and tucked margin; the free edge
        // keeps the cultivar's color rather than getting a separate white outline.
        const tuck = ease((s * (skew < 0 ? -1 : 1) - .16) / .84) * side;
        const well = (1 - ease((t - .15) / .72)) * (fold ? .56 : .49);
        const edge = ease((t - .68 - .075 * skew) / .31);
        color.copy(base).lerp(root, well + tuck * (.28 - .19 * lip))
          .lerp(tip, (.32 + softness * .37) * edge * (1 - tuck * .61))
          .multiplyScalar((.91 + .14 * softness) * (1 - .29 * well - .14 * tuck + .018 * body * Math.cos(s * 7 + wave)));
        colors.push(color.r, color.g, color.b);
        uv.push(u, t);
        if (j < along && i < across) {
          const a = j * (across + 1) + i, b = a + across + 1;
          indices.push(a, b, a + 1, b, b + 1, a + 1);
        }
      }
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setIndex(indices);
    const attribute = (data: number[]) => new THREE.Float32BufferAttribute(data, 3);
    const normalFor = (position: THREE.BufferAttribute) => {
      geometry.setAttribute('position', position);
      geometry.deleteAttribute('normal');
      geometry.computeVertexNormals();
      return geometry.getAttribute('normal');
    };
    const targets = [attribute(closed), attribute(bent)];
    const normals = targets.map(normalFor);
    normalFor(attribute(positions));
    geometry.setAttribute('color', attribute(colors));
    geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    geometry.morphAttributes.position = targets;
    geometry.morphAttributes.normal = normals;
    const mesh = new THREE.Mesh(geometry, material);
    head.add(mesh);
    entries.push({ mesh, layer, offset: 0 });
  }

  for (let i = 0; i < ROSE_GUARDS; i++) {
    const phase = i * 2.39996 + rotation;
    const a = rotation + i * TAU / ROSE_GUARDS + .14 * Math.sin(phase);
    petal(0, a, .868 + .062 * Math.sin(phase), .445 + .083 * Math.cos(phase - .85),
      .43 + .083 * Math.sin(phase + .67), .23 * Math.sin(phase - .8));
  }
  for (const [a, r, y, w, sweep] of shoulder) petal(1, a + rotation, r, y, w, sweep);
  // Each small group curls about its own point. Adjacent groups overlap like
  // fingers, rather than feeding all their lips into one high vortex.
  for (const [a, r, y, radius, hand, breadth] of pockets) {
    const angle = a + rotation;
    const x = r * Math.sin(angle), z = r * Math.cos(angle);
    petal(2, angle + hand * .25, radius, y - .11, radius * .83 * breadth, hand * .31, [x, .11, z]);
    petal(2, angle + hand * (1.70 + .37 * breadth), radius * .84, y - .16, radius * .75, hand * .45, [x, .12, z]);
    petal(2, angle - hand * (1.87 * breadth), radius * (.77 + .24 * breadth), y - .13, radius * .90, hand * .23, [x, .093, z]);
    petal(3, angle - hand * 2.62, radius * .67, y - .26, radius * .72 / breadth, hand * .51, [x * .92, .178, z * .92]);
    petal(3, angle + hand * .88, radius * .54, y - .25, radius * .61, -hand * .48, [x * 1.06, .191, z * 1.06]);
  }
  // Cover the stem insertion and the back of the folds with a buried base.
  const baseMaterial = new THREE.MeshStandardMaterial({ color: palette.root, roughness: 1 });
  const receptacle = new THREE.Mesh(new THREE.SphereGeometry(R * .224, 18, 10), baseMaterial);
  receptacle.scale.y = .52;
  receptacle.position.y = R * .11;
  head.add(receptacle);
  petal(3, rotation + 1.75, .181, .283, .174, .33, [.039, .178, -.013]);
  petal(3, rotation + 3.02, .207, .314, .187, -.45, [.023, .154, -.071]);
  petal(3, rotation + 5.71, .187, .284, .158, -.21, [-.061, .185, .031]);
  return entries;
}
