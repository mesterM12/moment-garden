import { Mesh, Vector3 } from 'three';
import { expect, it } from 'vitest';
import { createBouquet } from './botany';
import { buildFiller } from './filler';
import { sprayCalyx } from './spray-calyx';

it('roots each papery filler cup on its twig and keeps the throat below the five rim tips', () => {
  const root = new Vector3(-.8, .7, 1.4), axis = new Vector3(.7, .2, -.1).normalize();
  const g = sprayCalyx(root, axis, .055, 1.37, .72);
  try {
    const pos = g.getAttribute('position'), p = new Vector3();
    const height = (i: number) => p.fromBufferAttribute(pos, i).sub(root).dot(axis);
    expect(p.fromBufferAttribute(pos, 0).distanceTo(root)).toBeLessThan(1e-6);
    const rim = Array.from({ length: 15 }, (_, i) => height(31 + i));
    expect(rim.filter((y, i) => y > rim[(i + 14) % 15] + .001 && y > rim[(i + 1) % 15] + .001)).toHaveLength(5);
    expect(height(pos.count - 1)).toBeLessThan(Math.min(...rim));
    expect(g.index!.count / 3).toBeLessThanOrEqual(120);
  } finally { g.dispose(); }
});

it('keeps foliage reproducible without consuming the flower geometry RNG', () => {
  const plan = createBouquet(1748091600123), control = createBouquet(plan.timestamp);
  const first = buildFiller(plan), repeat = buildFiller(control);
  expect(first.group.children).toHaveLength(4);
  for (const [i, child] of first.group.children.entries()) {
    const g = (child as Mesh).geometry;
    const positions = g.getAttribute('position').array;
    expect(positions.length).toBeGreaterThan(0);
    expect(positions.every(Number.isFinite)).toBe(true);
    expect(positions).toEqual(((repeat.group.children[i] as Mesh).geometry.getAttribute('position').array));
  }
  expect(plan.flowers[0].specimen.random()).toBe(createBouquet(plan.timestamp).flowers[0].specimen.random());
});

it('replays from the binding and ends exactly at the same rest pose', () => {
  const { group, pose } = buildFiller(createBouquet(1728000000000));
  const bases = group.children.map(child => child.position.clone());
  pose(1); pose(.25);
  const [leafy, , , late] = group.children as Mesh[];
  expect(leafy.morphTargetInfluences![0]).toBeGreaterThan(0);
  expect(leafy.morphTargetInfluences![0]).toBeLessThan(1);
  expect(late.morphTargetInfluences).toEqual([1, 0]);
  const tucked = leafy.geometry.morphAttributes.position![0], rest = leafy.geometry.getAttribute('position');
  expect(Array.from(tucked.array).some((x, i) => Math.abs(x - rest.array[i]) > .5)).toBe(true);
  for (let i = 0; i < rest.count; i++) {
    if (Math.abs(rest.getY(i)) < .025) {
      expect(Math.abs(tucked.getX(i) - rest.getX(i))).toBeLessThan(.001);
    }
  }
  pose(.66);
  expect(leafy.morphTargetInfluences![1]).toBeGreaterThan(.1);
  // The spray has already sprung outward; the turning blade faces still
  // catch the light differently here than in the mature keepsake.
  const restNormal = leafy.geometry.getAttribute('normal'), recoilNormal = leafy.geometry.morphAttributes.normal![1];
  let turning = 0;
  for (let i = 0; i < restNormal.count; i++) {
    const x = restNormal.getX(i), y = restNormal.getY(i), z = restNormal.getZ(i);
    if (x * x + y * y + z * z < .99) continue; // coincident vertices at a leaf tip
    if (x * recoilNormal.getX(i) + y * recoilNormal.getY(i) + z * recoilNormal.getZ(i) < Math.cos(Math.PI / 6)) turning++;
  }
  expect(turning).toBeGreaterThan(restNormal.count * .25);
  pose(1);
  for (const [i, mesh] of group.children.entries()) {
    expect(mesh.position.equals(bases[i])).toBe(true);
    expect((mesh as Mesh).morphTargetInfluences).toEqual([0, 0]);
    expect(mesh.scale.toArray()).toEqual([1, 1, 1]);
    expect(Math.abs(mesh.rotation.z)).toBe(0);
  }
});
