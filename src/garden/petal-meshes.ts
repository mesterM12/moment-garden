/* Dedicated botanical surfaces: rose cups, tulip shells, and rolled dahlia florets. */
import * as THREE from 'three';
import { gardenRose } from './garden-rose';
import type { MorphPetal, Specimen } from './types';

type Sample = (t: number, s: number) => number[];

const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const smooth = (t: number) => { t = Math.max(0, Math.min(1, t)); return t * t * (3 - 2 * t); };
function profile(values: readonly number[], t: number) {
  const stops = [0, 0.22, 0.50, 0.78, 1];
  let i = 0;
  while (i < 3 && t > stops[i + 1]) i++;
  const slope = (k: number) => (values[k + 1] - values[k]) / (stops[k + 1] - stops[k]);
  const tangent = (k: number) => {
    if (k === 0) return slope(0);
    if (k === 4) return slope(3);
    const a = slope(k - 1), b = slope(k);
    return a * b <= 0 ? 0 : 2 * a * b / (a + b);
  };
  const width = stops[i + 1] - stops[i];
  const u = (t - stops[i]) / width;
  return (2 * u ** 3 - 3 * u * u + 1) * values[i] + (u ** 3 - 2 * u * u + u) * width * tangent(i)
    + (-2 * u ** 3 + 3 * u * u) * values[i + 1] + (u ** 3 - u * u) * width * tangent(i + 1);
}
function surface(specimen: Specimen, sample: Sample, sealed?: Sample) {
  const positions: number[] = [], bud: number[] = [], colors: number[] = [], uvs: number[] = [], indices: number[] = [];
  const across = 12, along = 22;
  const base = new THREE.Color(specimen.palette.base);
  const tip = new THREE.Color(specimen.palette.tip);
  const dark = new THREE.Color(specimen.palette.root);
  for (let j = 0; j <= along; j++) {
    const t = j / along;
    for (let i = 0; i <= across; i++) {
      const s = i / across * 2 - 1;
      const point = sample(t, s);
      positions.push(...point);
      // All panels close toward the bloom axis as one coherent bud.
      if (sealed) bud.push(...sealed(t, s));
      else bud.push(point[0] * (0.24 + 0.20 * (1 - t)), point[1] * 0.48 + t * specimen.length * 0.70, point[2] * (0.24 + 0.20 * (1 - t)));
      const color = dark.clone().lerp(base, smooth(t / 0.28));
      const rim = specimen.pattern === 'picotee' ? smooth((t - 0.85) / 0.15) : smooth((t - 0.4) / 0.6) * 0.48;
      color.lerp(tip, rim);
      colors.push(color.r, color.g, color.b);
      uvs.push(i / across, t);
      if (j < along && i < across) {
        const a = j * (across + 1) + i, b = a + across + 1;
        indices.push(a, b, a + 1, b, b + 1, a + 1);
      }
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  const closed = geometry.clone();
  closed.setAttribute('position', new THREE.Float32BufferAttribute(bud, 3));
  closed.computeVertexNormals();
  geometry.morphAttributes.position = [closed.getAttribute('position').clone()];
  geometry.morphAttributes.normal = [closed.getAttribute('normal').clone()];
  closed.dispose();
  return geometry;
}
// Decorative dahlia: tight quills at the eye grade into reflexed, overlapping
// guard petals. All roots insert on one small receptacle (including in bud).
function cutDahlia(specimen: Specimen, head: THREE.Group, material: THREE.Material) {
  const R = specimen.length, entries: MorphPetal[] = [];
  const backing = new THREE.Mesh(new THREE.SphereGeometry(R, 24, 14),
    new THREE.MeshStandardMaterial({ color: '#637547', roughness: .84 }));
  backing.position.y = .032 * R;
  head.add(backing);
  // Radius of each row at its lip, in head lengths. Pitch varies with girth:
  // the outside has broad spoons, not another uniform ring of little tubes.
  const rows = [[5, .075], [8, .18], [11, .31], [14, .46], [17, .62], [20, .79], [22, .96]];
  rows.forEach(([count, reach], row) => {
    const u = row / (rows.length - 1);
    for (let i = 0; i < count; i++) {
      const a = specimen.rotation + row * 2.39996 + i * Math.PI * 2 / count;
      const hand = Math.sin(i * 7.13 + row * 4.79 + specimen.rotation);
      const root = .005 + u * .218, rise = .73 - .48 * u ** 1.55;
      const geometry = surface(specimen, (t, s) => {
        const lip = smooth((t - .55) / .45), belly = Math.sin(Math.PI * t);
        const midrib = t * (1 - .11 * s * s * lip);
        const aim = a + (.17 + hand * .065) * t + .043 * hand * lip;
        const width = (.055 + .144 * u) * (.085 + .915 * Math.sin(Math.PI * (.035 + .81 * t)) ** .8);
        const roll = 2.38 - 1.55 * u - .29 * lip;
        const side = width * Math.sin(s * roll) / Math.sin(Math.min(roll, Math.PI / 2));
        const r = root + (reach * (1 + hand * .035) - root) * midrib ** 1.26
          - (1 - u) ** 5 * .076 * lip;
        const y = .044 + (rise + .027 * hand) * midrib + .22 * u * belly - .25 * u ** 2 * lip
          + width * (1 - Math.cos(s * roll)) + .034 * s * t * (1 + hand * .5);
        return [R * (Math.sin(aim) * r + Math.cos(aim) * side), R * y,
          R * (Math.cos(aim) * r - Math.sin(aim) * side)];
      }, (t, s) => {
        // Imbricated sheaths around the same fixed receptacle. A compact
        // outer row rises around the heart rather than threading through it.
        const r = root + (.045 + .19 * u) * Math.sin(Math.PI * t) - .75 * root * t;
        const width = (.10 + .51 * Math.sin(Math.PI * (.03 + .90 * t))) * 2 * Math.PI / count;
        const aim = a + width * s + .15 * t;
        return [R * r * Math.sin(aim), R * (.044 + (.85 - .17 * u) * t - .034 * s * s * t), R * r * Math.cos(aim)];
      });
      const mesh = new THREE.Mesh(geometry, material);
      head.add(mesh); entries.push({ mesh, layer: Math.floor((1 - u) * 3), offset: 0 });
    }
  });
  return entries;
}

function build(specimen: Specimen, head: THREE.Group, material: THREE.Material, cut = false): MorphPetal[] {
  if (specimen.key === 'rose') return gardenRose(specimen, head, material);
  if (cut && specimen.key === 'dahlia') return cutDahlia(specimen, head, material);
  const meshes: MorphPetal[] = [];
  function add(geometry: THREE.BufferGeometry, layer: number) {
    const mesh = new THREE.Mesh(geometry, material);
    head.add(mesh);
    meshes.push({ mesh, layer, offset: 0 });
  }
  const R = specimen.length;
  if (specimen.key === 'tulip') {
    const scale = R * 0.64;
    for (let layer = 0; layer < 2; layer++) {
      for (let i = 0; i < 3; i++) {
        const angle = specimen.rotation + i * Math.PI * 2 / 3 + layer * Math.PI / 3;
        add(surface(specimen, (t, s) => {
          const radius = profile([.07, .54, .95, 1, .79], t) * scale * (layer ? .93 : 1);
          const halfSpan = profile([.10, .49, .65, .65, .49], t) * (layer ? .95 : 1);
          const theta = angle + s * halfSpan;
          const height = (profile([0, .28, .72, 1.24, 1.60], t) - .11 * s * s * smooth((t - .72) / .28)) * scale * (layer ? 1.03 : 1);
          return [Math.sin(theta) * radius, height, Math.cos(theta) * radius];
        }), layer);
      }
    }
  } else if (specimen.key === 'dahlia') {
    const backing = new THREE.Mesh(new THREE.SphereGeometry(R, 32, 20), new THREE.MeshStandardMaterial({ color: specimen.palette.root, roughness: .9 }));
    backing.scale.set(.88, .39, .88);
    backing.position.y = .10 * R;
    head.add(backing);
    const total = 140;
    for (let i = 0; i < total; i++) {
      const u = Math.sqrt((i + .5) / total);
      const angle = i * 2.3999632297 + specimen.rotation;
      const radius = (.035 + .965 * u) * R;
      const height = (.12 + .70 * Math.sqrt(1 - u * u)) * R;
      const baseRadius = radius * (.40 + .18 * u);
      const baseHeight = height - (.24 - .08 * u) * R;
      add(surface(specimen, (t, s) => {
        const envelope = profile([.12, .55, 1, .92, .52], t);
        const width = (.067 + .064 * u) * R * envelope;
        const beta = 1.75;
        const lateral = width * Math.sin(beta * s);
        const cup = width * (1 - Math.cos(beta * s));
        const r = lerp(baseRadius, radius, t) - .025 * R * s * s * smooth((t - .7) / .3);
        const y = lerp(baseHeight, height, t) + cup;
        return [Math.sin(angle) * r + Math.cos(angle) * lateral, y, Math.cos(angle) * r - Math.sin(angle) * lateral];
      }), Math.floor((1 - u) * 4));
    }
  }
  return meshes;
}

export { build };
