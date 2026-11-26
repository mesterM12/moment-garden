// @vitest-environment node
import * as THREE from 'three';
import { expect, test } from 'vitest';
import { createSpecimen } from './botany';
import * as extras from './extra-blooms';
import * as dedicated from './petal-meshes';
import { finishPetals } from './florist-finish';
import type { MorphPetal } from './types';

const vec = (shape: THREE.BufferGeometry['attributes'][string], i: number) => new THREE.Vector3().fromBufferAttribute(shape, i);
const r = (p: THREE.Vector3) => Math.hypot(p.x, p.z);

function withSculpt(key: 'rose' | 'tulip' | 'ranunculus' | 'orchid' | 'iris', inspect: (panels: MorphPetal[], R: number) => void) {
  const specimen = { ...createSpecimen(42, key), random() { throw new Error('Sculptures must not draw another seed'); } };
  const material = new THREE.MeshStandardMaterial(), head = new THREE.Group();
  try {
    const build = extras.has(key) ? extras.build : dedicated.build;
    inspect(finishPetals(specimen, build(specimen, head, material, true), head, true), specimen.length);
  } finally {
    const materials = new Set<THREE.Material>([material]);
    for (const child of head.children) if (child instanceof THREE.Mesh) {
      child.geometry.dispose();
      materials.add(child.material);
    }
    materials.forEach(m => m.dispose());
  }
}

test('a rose guard turns outward along a shallower tangent at the lip', () => {
  withSculpt('rose', ([guard], R) => {
    const g = guard.mesh.geometry, open = g.attributes.position;
    expect(open.count).toBe(425);
    const tip = vec(open, open.count - 9), shoulder = vec(open, open.count - 77);
    const tangent = tip.clone().sub(shoulder);
    expect(r(tip) - r(shoulder)).toBeGreaterThan(.08 * R);
    expect(tangent.y).toBeLessThan(.043 * R);
    expect(Math.abs(r(vec(open, open.count - 17)) - r(vec(open, open.count - 1)))).toBeGreaterThan(.035 * R);
  });
});

test('tulip tepals curve inward from the belly and leave unequal corners at the lip', () => {
  withSculpt('tulip', (tepals, R) => {
    const asymmetric = tepals.map(({ mesh }) => {
      const { position } = mesh.geometry.attributes;
      const tip = position.count - 7, shoulder = 13 * 13 + 6;
      expect(r(vec(position, shoulder)) - r(vec(position, tip))).toBeGreaterThan(.035 * R);
      return Math.abs(position.getY(position.count - 13) - position.getY(position.count - 1)) / R;
    });
    expect(Math.max(...asymmetric)).toBeGreaterThan(.046);
  });
});

test('ranunculus laps stagger at the hem and hold the sealed eye closer than the rim in the middle pose', () => {
  withSculpt('ranunculus', (cups, R) => {
    const outer = cups[0], eye = cups.at(-1)!;
    const reach = (batch: MorphPetal) => {
      const g = batch.mesh.geometry;
      const [shut, bent] = g.morphAttributes.position!;
      return batch.blades!.map(({ end }) => ({
        asymmetry: Math.abs(r(vec(g.attributes.position, end - 11)) - r(vec(g.attributes.position, end - 1))),
        opening: r(vec(bent, end - 6)) - r(vec(shut, end - 6)),
      }));
    };
    const guards = reach(outer), heart = reach(eye);
    expect(Math.max(...guards.map(cup => cup.asymmetry))).toBeGreaterThan(.023 * R);
    expect(Math.min(...guards.map(cup => cup.opening))).toBeGreaterThan(.33 * R);
    expect(Math.max(...heart.map(cup => cup.opening))).toBeLessThan(.025 * R);
  });
});

test.each([['orchid', 1, 17, .10], ['iris', 0, 21, .04]] as const)(
  '%s curves the distal cap instead of terminating the shoulder in a point', (key, layer, stride, width) => {
    withSculpt(key, (entries, R) => {
      const { mesh, blades } = entries[layer];
      const p = mesh.geometry.attributes.position;
      for (const { first, end } of blades!.filter(blade => !blade.anchor)) {
        const tip = end - Math.ceil(stride / 2);
        expect(r(vec(p, tip)) - Math.max(r(vec(p, end - stride)), r(vec(p, end - 1)))).toBeGreaterThan(.060 * R);
        expect(vec(p, end - stride).distanceTo(vec(p, end - 1))).toBeGreaterThan(width * R);
        const uv = mesh.geometry.attributes.uv;
        for (let i = first; uv.getY(i) === 0; i++) for (const target of mesh.geometry.morphAttributes.position!) {
          expect(vec(target, i).distanceTo(vec(p, i))).toBeLessThan(1e-6);
        }
      }
    });
  },
);
