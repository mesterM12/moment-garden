import * as THREE from 'three';
import { expect, test } from 'vitest';
import { createSpecimen } from './botany';
import { finishPetals, tieBouquet } from './florist-finish';
import { build } from './petal-meshes';
import * as extras from './extra-blooms';

function finish(key: 'tulip' | 'dahlia') {
  const specimen = { ...createSpecimen(1636211948124, key), random() { throw Error('finish must not draw another seed'); } };
  const head = new THREE.Group(), material = new THREE.MeshStandardMaterial();
  const entries = finishPetals(specimen, build(specimen, head, material), head);
  return entries.map(p => p.mesh.geometry);
}

test('six distinct tulip tepal lips share a reproducible curved bud and smooth finite normals', () => {
  const petals = finish('tulip');
  expect(petals).toHaveLength(6);
  const heights = petals.map(g => {
    const open = g.getAttribute('position'), bud = g.morphAttributes.position[0];
    let radius = 0, budRadius = 0, high = 0;
    for (let i = 0; i < open.count; i++) {
      high = Math.max(high, open.getY(i));
      radius = Math.max(radius, Math.hypot(open.getX(i), open.getZ(i)));
      budRadius = Math.max(budRadius, Math.hypot(bud.getX(i), bud.getZ(i)));
    }
    expect(radius).toBeGreaterThan(2 * budRadius);
    expect(g.getAttribute('normal').array.every(Number.isFinite)).toBe(true);
    expect(g.morphAttributes.normal[0].array.every(Number.isFinite)).toBe(true);
    return high;
  });
  expect(Math.min(...heights.slice(3))).toBeGreaterThan(Math.max(...heights.slice(0, 3)));
  const replay = finish('tulip');
  for (let i = 0; i < petals.length; i++) {
    expect(petals[i].getAttribute('position').array).toEqual(replay[i].getAttribute('position').array);
    petals[i].dispose(); replay[i].dispose();
  }
});

test('the 140 dahlia rolls remain articulated but render in at most 12 cohorts', () => {
  const florets = finish('dahlia');
  expect(florets.length).toBeGreaterThan(3);
  expect(florets.length).toBeLessThanOrEqual(12);
  for (const g of florets) {
    expect(g.morphAttributes.position[0].count).toBe(g.getAttribute('position').count);
    g.dispose();
  }
});

test('ranunculus petals within each baked whorl have different halfway openings, without additional draws', () => {
  const specimen = createSpecimen(1636211948124, 'ranunculus');
  const head = new THREE.Group(), material = new THREE.MeshStandardMaterial();
  const petals = extras.build(specimen, head, material);
  const batches = finishPetals(specimen, petals, head);
  expect(batches.length).toBe(petals.length);
  const g = batches[1].mesh.geometry;
  const open = g.getAttribute('position'), [bud, mid] = g.morphAttributes.position;
  const uv = g.getAttribute('uv');
  const radii = (a: typeof mid, i: number) => Math.hypot(a.getX(i), a.getZ(i));
  const fraction = (i: number) => (radii(mid, i) - radii(bud, i)) / (radii(open, i) - radii(bud, i));
  const lips = [];
  for (const { first, end } of batches[1].blades!) {
    let shoulder = 0, lip = 0;
    for (let i = first; i < end; i++) {
      if (uv.getX(i) !== .5) continue;
      if (uv.getY(i) === .25) shoulder = fraction(i);
      if (uv.getY(i) === 1) lip = fraction(i);
    }
    expect(shoulder - lip).toBeGreaterThan(.45);
    lips.push(lip);
  }
  expect(Math.max(...lips) - Math.min(...lips)).toBeGreaterThan(.13);
});

test.each(['twine', 'wrap', 'bow'] as const)('%s binding stays modest, three-dimensional and inexpensive', style => {
  const tie = new THREE.Group(); tieBouquet(tie, style, '#ad7c75');
  const bounds = new THREE.Box3().setFromObject(tie);
  expect(tie.children.length).toBeLessThanOrEqual(6);
  expect(bounds.max.x).toBeGreaterThan(.26);
  expect(bounds.min.y).toBeGreaterThan(-.9);
  expect(bounds.max.z).toBeGreaterThan(.14);
});
