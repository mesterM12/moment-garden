/* Dedicated botanical surfaces: rose cups, tulip tepals, and rolled dahlia florets. */
import * as THREE from 'three';
import { gardenRose } from './garden-rose';
import { petalHand } from './petal-hand';
import type { MorphPetal, Specimen } from './types';

const TAU = 2 * Math.PI;
const GOLDEN_ANGLE = Math.PI * (3 - Math.sqrt(5));
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const smooth = (t: number) => { t = Math.max(0, Math.min(1, t)); return t * t * (3 - 2 * t); };
type Sample = (t: number, s: number) => number[];
type Paint = (t: number, s: number) => THREE.Color;

function surface(sample: Sample, sealed: Sample, paint: Paint, along: number, across: number) {
  const positions: number[] = [], bud: number[] = [], colors: number[] = [], uvs: number[] = [], indices: number[] = [];
  for (let j = 0; j <= along; j++) {
    const t = j / along;
    for (let i = 0; i <= across; i++) {
      const s = i / across * 2 - 1;
      positions.push(...sample(t, s));
      bud.push(...sealed(t, s));
      const color = paint(t, s);
      colors.push(color.r, color.g, color.b);
      uvs.push(i / across, t);
      if (j < along && i < across) {
        const a = j * (across + 1) + i, b = a + across + 1;
        indices.push(a, b, a + 1, b, b + 1, a + 1);
      }
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geometry.setIndex(indices);
  const closed = new THREE.Float32BufferAttribute(bud, 3);
  geometry.setAttribute('position', closed);
  geometry.computeVertexNormals();
  geometry.morphAttributes.position = [closed];
  geometry.morphAttributes.normal = [geometry.getAttribute('normal')];
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.deleteAttribute('normal');
  geometry.computeVertexNormals();
  return geometry;
}

function pigment({ palette, pattern }: Specimen) {
  const base = new THREE.Color(palette.base), tip = new THREE.Color(palette.tip);
  const root = new THREE.Color(palette.root), tint = new THREE.Color();
  const picotee = pattern === 'picotee';
  return { base, tip, root, tint, picotee };
}

function add(head: THREE.Group, material: THREE.Material, geometry: THREE.BufferGeometry, layer: number): MorphPetal {
  const mesh = new THREE.Mesh(geometry, material);
  head.add(mesh);
  return { mesh, layer, offset: 0 };
}

function tulip(specimen: Specimen, head: THREE.Group, material: THREE.Material, cut: boolean) {
  const R = specimen.length;
  const { base, tip, root, tint, picotee } = pigment(specimen);
  const ivory = new THREE.Color('#fff0d4');
  return Array.from({ length: 6 }, (_, i) => {
    const layer = Math.floor(i / 3), inner = layer === 1;
    const angle = specimen.rotation + (i % 3) * TAU / 3 + layer * TAU / 6;
    const word = petalHand(specimen.timestamp, i, 0);
    const hand = (word >>> 16) / 32767.5 - 1, turn = (word & 255) / 127.5 - 1;
    const top = (inner ? 1.065 : .935) + hand * .027;
    function tepal(t: number, s: number, closed: boolean) {
      const lip = smooth((t - .62) / .38), edge = Math.abs(s) ** 2.4;
      // Round, slightly hooded sails inside three lower, reflexed guards.
      // Vary the lip height, but evaluate the cup radius at actual height:
      // shortening a corner cannot turn it into a spike through its neighbor.
      const y = .013 + (closed ? (inner ? 1.038 : 1.008) + hand * .015 : top) * t
        - (closed ? .129 : inner ? .127 : .180) * lip * edge
        + (closed ? .013 : .036) * s * lip * turn + .005 * Math.sin(s * 6 + hand) * lip;
      const shoulder = Math.sin(Math.PI * Math.min(1, y / 1.105) * .91) ** .89;
      const lap = smooth(t / .18) * s;
      const span = closed
        ? .105 + .60 * Math.sin(Math.PI * t * .71) ** .74
        : .105 + (inner ? .63 : .62) * Math.sin(Math.PI * t * .84) ** .84 + .034 * lip;
      const aim = angle + span * s + (inner ? .09 : .053) * t + turn * .04 * t * t;
      let radius: number;
      if (closed) {
        // Imbricated bud, with a broad belly and the seam continuing to its neck.
        const hull = Math.max(0, Math.sin(Math.PI * (y - .013) / 1.11));
        radius = .049 * (1 - t) + (.207 + .012 * (1 - layer)) * hull ** .77 - .046 * smooth((y - .83) / .23)
          + .007 * lap * t;
      } else {
        const dome = .047 + (.484 - layer * .073) * shoulder;
        const opening = smooth((y - .66) / .34);
        const flare = opening * (inner ? -.037 + .024 * hand : .112 + .058 * hand);
        const channel = Math.sin(Math.PI * t) * (.024 * (1 - s * s) - .020 * edge);
        radius = (dome + flare + channel + .028 * lap * t + .024 * turn * lip * edge) * (cut ? .96 : 1);
      }
      // Both forms share the stem socket; only the free tepal can peel.
      radius = lerp(.049 + (1 - layer) * .006, Math.max(.022, radius), smooth(t / .15));
      return [R * radius * Math.sin(aim), R * y, R * radius * Math.cos(aim)];
    }
    const geometry = surface((t, s) => tepal(t, s, false), (t, s) => tepal(t, s, true), (t, s) => {
      const rim = smooth((t - .73) / .27), edge = smooth((Math.abs(s) - .67) / .33);
      const rib = Math.exp(-((4 * s - .18 * t) ** 2));
      return tint.copy(root).lerp(base, .38 + .62 * smooth(t / .49))
        .lerp(tip, (.32 + .08 * hand) * t + (picotee ? .32 : .12) * rim)
        .lerp(root, (.10 * rib + .07 * Math.max(0, -s)) * (1 - smooth((t - .32) / .65)))
        .lerp(ivory, (.025 + .052 * rim + .061 * edge * t) * (inner ? .72 : 1.3));
    }, 22, 12);
    return add(head, material, geometry, layer);
  });
}

function dahlia(specimen: Specimen, head: THREE.Group, material: THREE.Material, cut: boolean) {
  const R = specimen.length, { base, tip, root, tint, picotee } = pigment(specimen);
  // The existing pose scales this first mesh differently in old and new cuts.
  // In both modes it is a low receptacle, not a colored dome behind the face.
  const receptacle = new THREE.SphereGeometry(R * (cut ? 1 : .33), 24, 14);
  if (!cut) receptacle.scale(1, .69, 1);
  const backing = new THREE.Mesh(receptacle, new THREE.MeshStandardMaterial({ color: '#637547', roughness: .84 }));
  backing.position.y = .035 * R;
  head.add(backing);
  const total = cut ? 97 : 140;
  return Array.from({ length: total }, (_, i) => {
    // Pack individual sockets on a spiral rather than aligning tips in rows.
    // Compact, involute quills retire into open, spooned outer florets.
    const u = Math.sqrt((i + .34) / total);
    const spoon = smooth((u - .16) / .78);
    const layer = Math.min(3, Math.floor((1 - u) * 4));
    const word = petalHand(specimen.timestamp, 0, i);
    const hand = (word >>> 16) / 32767.5 - 1, tilt = (word & 255) / 127.5 - 1;
    const angle = specimen.rotation + i * GOLDEN_ANGLE + .085 * hand;
    const reach = .010 + u * (.944 + .023 * hand);
    const high = .155 + .596 * (1 - u * u) ** .64 - .038 * (1 - u) ** 10 + .016 * tilt;
    const socket = .012 + .198 * u ** 1.2, foot = .048 + .182 * (1 - u) ** 3;
    const curve = (t: number) => [lerp(socket, reach, t ** 1.06), lerp(foot, high, t) + .125 * spoon * Math.sin(Math.PI * t)];
    const floret: Sample = (t, s) => {
      const lip = smooth((t - .62) / .38);
      const arch = t - (.071 + .021 * spoon) * Math.abs(s) ** 2.6 * lip;
      const [r, y] = curve(arch);
      // Roll the ribbon about its curved midrib. The cup normal points back
      // into the face on upright quills, and upward on the spreading spoons.
      const dr = (reach - socket) * 1.06 * Math.max(.001, arch) ** .06;
      const dy = high - foot + .125 * spoon * Math.PI * Math.cos(Math.PI * arch);
      const normal = Math.hypot(dr, dy);
      const roll = lerp(2.69, .90, spoon) + .28 * (1 - smooth(t / .76)) - .17 * spoon * lip;
      const breadth = (.032 + .101 * u ** .77) * (cut ? 1.04 : .90) * (1 + .10 * tilt);
      const narrow = .08 + .92 * smooth(t / .73);
      const spatulate = narrow * (1 - .16 * smooth((t - .87) / .13));
      const quill = narrow * (1 - .12 * smooth((t - .91) / .09));
      const width = breadth * lerp(quill, spatulate, spoon);
      const side = width * Math.sin(roll * s);
      const cup = width * (1 - Math.cos(roll * s)) * lerp(1, .85, spoon);
      const a = angle + (.11 + .08 * hand) * t * t + .03 * tilt * s * lip;
      const radial = r - cup * dy / normal, height = y + cup * dr / normal + .023 * tilt * s * t * t;
      return [R * (radial * Math.sin(a) + side * Math.cos(a)), R * height,
        R * (radial * Math.cos(a) - side * Math.sin(a))];
    };
    const geometry = surface(floret, (t, s) => {
      // The outer florets sheath the inner ones on a closed ovoid, with tips
      // converging over the eye; neither endpoint has a central backing disc.
      const lip = smooth((t - .63) / .37), size = .105 + .153 * spoon;
      const r = socket * (1 - t) + size * Math.sin(Math.PI * t) + (.024 + .037 * u) * t;
      const wrap = (.045 + .20 * spoon) * Math.sin(Math.PI * (.03 + .92 * t)) ** .65;
      const a = angle + s * wrap + .13 * t;
      const y = foot + (.65 + .08 * spoon - foot) * t - .075 * s * s * lip + .016 * hand * t;
      const point = [R * r * Math.sin(a), R * y, R * r * Math.cos(a)];
      // Preserve the tiny insertion strip, including its cross-section.
      return t >= .16 ? point : floret(t, s).map((v, j) => lerp(v, point[j], smooth(t / .16)));
    }, (t, s) => tint.copy(root).lerp(base, .32 + .68 * smooth(t / .54))
      .lerp(tip, smooth((t - .39) / .61) * (.33 + hand * .11 + (picotee ? .18 : 0)))
      .lerp(root, smooth((Math.abs(s) - .53) / .47) * (1 - spoon) * .12)
      .multiplyScalar(1 + .09 * hand), 18, 12);
    return add(head, material, geometry, layer);
  });
}

export function build(specimen: Specimen, head: THREE.Group, material: THREE.Material, cut = false): MorphPetal[] {
  if (specimen.key === 'rose') return gardenRose(specimen, head, material);
  if (specimen.key === 'tulip') return tulip(specimen, head, material, cut);
  if (specimen.key === 'dahlia') return dahlia(specimen, head, material, cut);
  return [];
}
