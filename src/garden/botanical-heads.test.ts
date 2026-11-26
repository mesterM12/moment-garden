// @vitest-environment node
import * as THREE from 'three';
import { expect, test } from 'vitest';
import { createSpecimen, headEnvelope } from './botany';
import { build as extraBlooms } from './extra-blooms';
import { finishPetals } from './florist-finish';
import { build as petalMeshes } from './petal-meshes';

const keys = ['tulip', 'dahlia', 'ranunculus'] as const;
type Kind = typeof keys[number];
const stamps = [0, 1, 1748091600123, 1748091600153, 4294967296];
const sample = new THREE.Vector3(), other = new THREE.Vector3();
const radius = (p: THREE.BufferGeometry['attributes'][string], i: number) => Math.hypot(p.getX(i), p.getZ(i));

function heads(timestamp: number, key: Kind, cut: boolean) {
  const specimen = {
    ...createSpecimen(timestamp, key),
    random() { throw Error('Sculpting must not consume recipe randomness.'); },
  };
  const material = new THREE.MeshStandardMaterial({ vertexColors: true, side: THREE.DoubleSide });
  const head = new THREE.Group();
  const build = key === 'ranunculus' ? extraBlooms : petalMeshes;
  const raw = build(specimen, head, material, cut);
  return { specimen, material, head, raw, finish: () => finishPetals(specimen, raw, head, cut) };
}

function dispose(head: THREE.Group, material: THREE.Material) {
  const materials = new Set([material]);
  for (const child of head.children) {
    if (!(child instanceof THREE.Mesh)) continue;
    child.geometry.dispose();
    materials.add(child.material);
  }
  materials.forEach(m => m.dispose());
}

for (const cut of [false, true]) {
  for (const key of keys) {
    test(`${key} ${cut ? 'v3' : 'legacy'}: finished petals stay bounded and buds expand around pinned sockets`, () => {
      for (const stamp of stamps) {
        const { specimen, material, head, finish } = heads(stamp, key, cut);
        try {
          const petals = finish();
          const e = headEnvelope({ specimen, position: [0, 0, 0], delay: 0, scale: 1, turn: 0 });
          const offset = e.center.reduce((dot, x, i) => dot + x * e.axis[i], 0);
          let largestOpen = 0, largestBud = 0, vertices = 0;
          for (const { mesh } of petals) {
            const { position, uv } = mesh.geometry.attributes;
            const [bud, middle] = mesh.geometry.morphAttributes.position!;
            expect(bud?.count).toBe(position.count);
            expect(middle?.count).toBe(position.count);
            vertices += position.count;
            let clearance = 0, socketDrift = 0;
            for (let i = 0; i < position.count; i++) {
              const r = radius(position, i), b = radius(bud, i);
              largestOpen = Math.max(largestOpen, r);
              largestBud = Math.max(largestBud, b);
              clearance = Math.max(clearance, (r / e.radius) ** 2 + ((position.getY(i) - offset) / e.halfHeight) ** 2);
              if (uv.getY(i) === 0) socketDrift = Math.max(socketDrift,
                sample.fromBufferAttribute(position, i).distanceTo(other.fromBufferAttribute(bud, i)));
            }
            expect(clearance).toBeLessThanOrEqual(1);
            expect(socketDrift).toBeLessThan(1e-6);
          }
          const limit = key === 'tulip' ? 6 : key === 'ranunculus' ? 7 : 12;
          const vertexLimit = key === 'tulip' ? 1794 : key === 'ranunculus' ? 12000 : (cut ? 97 : 140) * 299;
          expect(petals.length).toBeLessThanOrEqual(limit);
          expect(vertices).toBeLessThanOrEqual(vertexLimit);
          expect(largestBud).toBeLessThan(largestOpen * .55);
        } finally { dispose(head, material); }
      }
    });
  }
}

test('tulip has distinct, alternating guard and inner rims in the finished cut', () => {
  const { material, head, specimen, finish } = heads(1748091600137, 'tulip', true);
  try {
    const petals = finish();
    expect(petals.map(p => p.layer)).toEqual([0, 0, 0, 1, 1, 1]);
    const angles: number[] = [], heights: number[] = [];
    for (const { mesh } of petals) {
      const { position, uv } = mesh.geometry.attributes;
      const lip = Array.from({ length: position.count }, (_, i) => i).filter(i => uv.getY(i) === 1);
      const mid = lip[Math.floor(lip.length / 2)];
      angles.push(Math.atan2(position.getX(mid), position.getZ(mid)));
      heights.push(position.getY(mid));
      for (const edge of [lip[0], lip.at(-1)!]) {
        expect(position.getY(mid) - position.getY(edge)).toBeGreaterThan(.09 * specimen.length);
      }
    }
    for (let i = 0; i < 3; i++) {
      expect(Math.cos(angles[i + 3] - angles[i])).toBeGreaterThan(.39);
      expect(Math.cos(angles[i + 3] - angles[i])).toBeLessThan(.60);
    }
    expect(Math.min(...heights.slice(3))).toBeGreaterThan(Math.max(...heights.slice(0, 3)));
  } finally { dispose(head, material); }
});

test.each([true, false])('dahlia (%s cut) grades inward rolls into broad outward spoons', cut => {
  const { material, head, raw } = heads(1748091600123, 'dahlia', cut);
  try {
    const crossSection = (petal: typeof raw[number]) => {
      const { position, uv } = petal.mesh.geometry.attributes;
      const row = Array.from({ length: position.count }, (_, i) => i).filter(i => Math.abs(uv.getY(i) - 2 / 3) < 1e-6);
      // At the same point along the midrib, these inboard gauges are the
      // widest point of a quill. A spoon keeps opening all the way to the edge.
      const dist = (a: number, b: number) => sample.fromBufferAttribute(position, row[a])
        .distanceTo(other.fromBufferAttribute(position, row[b]));
      return { margin: dist(0, 12), shoulder: dist(3, 9) };
    };
    const quill = crossSection(raw[0]), spoon = crossSection(raw.at(-1)!);
    expect(quill.margin).toBeLessThan(quill.shoulder * .7);
    expect(spoon.margin).toBeGreaterThan(spoon.shoulder * 1.5);
    expect(spoon.margin).toBeGreaterThan(quill.margin * 3);
  } finally { dispose(head, material); }
});

test('ranunculus spreads broad lapped cups with staggered outer reach', () => {
  const { material, head, raw, specimen } = heads(1748091600153, 'ranunculus', true);
  try {
    const panel = raw[0], { position, uv } = panel.mesh.geometry.attributes;
    const reaches = [];
    for (const { first, end } of panel.blades!) {
      const lip = Array.from({ length: end - first }, (_, i) => first + i).filter(i => uv.getY(i) === 1);
      const mid = lip[Math.floor(lip.length / 2)];
      reaches.push(radius(position, mid));
      const a = (i: number) => Math.atan2(position.getX(i), position.getZ(i));
      const span = Math.acos(Math.cos(a(lip[0]) - a(lip.at(-1)!)));
      expect(span).toBeGreaterThan((2 * Math.PI) / panel.blades!.length);
    }
    expect(Math.max(...reaches) - Math.min(...reaches)).toBeGreaterThan(.085 * specimen.length);
  } finally { dispose(head, material); }
});
