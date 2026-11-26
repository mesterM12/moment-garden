import { Mesh } from 'three';
import { expect, it } from 'vitest';
import { createBouquet } from './botany';
import { buildFiller } from './filler';

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
  const tucked = leafy.geometry.morphAttributes.position[0], rest = leafy.geometry.getAttribute('position');
  expect(Array.from(tucked.array).some((x, i) => Math.abs(x - rest.array[i]) > .5)).toBe(true);
  for (let i = 0; i < rest.count; i++) {
    if (Math.abs(rest.getY(i)) < .025) {
      expect(Math.abs(tucked.getX(i) - rest.getX(i))).toBeLessThan(.001);
    }
  }
  pose(.66);
  expect(leafy.morphTargetInfluences![1]).toBeGreaterThan(.1);
  pose(1);
  for (const [i, mesh] of group.children.entries()) {
    expect(mesh.position.equals(bases[i])).toBe(true);
    expect((mesh as Mesh).morphTargetInfluences).toEqual([0, 0]);
    expect(mesh.scale.toArray()).toEqual([1, 1, 1]);
    expect(Math.abs(mesh.rotation.z)).toBe(0);
  }
});
