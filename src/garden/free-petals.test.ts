// @vitest-environment node
import * as THREE from 'three';
import { describe, expect, test } from 'vitest';
import { headEnvelope, createBouquet, createSpecimen } from './botany';
import { buildBouquet, disposeBouquet, pose } from './engine';
import { buildCenter } from './floral-centers';
import { freePetal } from './free-petals';
import { petalFields } from './petal-surface';

const keys = ['lily', 'poppy', 'cosmos', 'daisy', 'sunflower'] as const;
type Key = typeof keys[number];
const seed = 1748091600123;
const vector = new THREE.Vector3();
const gFor = (key: Key, layer = 0) => {
  const s = createSpecimen(seed, key);
  return freePetal(s, layer, s.recipe.disk * .8 - layer * .025, s.length, .67, .29, .42);
};
type Attr = THREE.BufferGeometry['attributes'][string];
function point(g: THREE.BufferGeometry, a: Attr, u: number, t: number) {
  const uv = g.attributes.uv;
  for (let i = 0; i < uv.count; i++) {
    if (Math.abs(uv.getX(i) - u) < 1e-6 && Math.abs(uv.getY(i) - t) < 1e-6) return new THREE.Vector3().fromBufferAttribute(a, i);
  }
  throw new Error(`No sample at ${u},${t}`);
}

describe.each(keys)('%s authored blade', key => {
  test('keeps the socket fixed and spreads its shoulder before its lip, within the old strip budget', () => {
    const g = gFor(key), { uv, position } = g.attributes;
    const [shut, hinge] = g.morphAttributes.position!;
    expect(g.getIndex()!.count / 3).toBeLessThanOrEqual(1188);
    for (const a of [...g.morphAttributes.normal!, shut, hinge]) expect(a.array.every(Number.isFinite)).toBe(true);
    const spread = (i: number) => (hinge.getZ(i) - shut.getZ(i)) / (position.getZ(i) - shut.getZ(i));
    let shoulder = 0, lip = 0;
    for (let i = 0; i < uv.count; i++) {
      if (!uv.getY(i)) {
        const open = vector.fromBufferAttribute(position, i);
        expect(open.distanceTo(new THREE.Vector3().fromBufferAttribute(shut, i))).toBe(0);
        expect(open.distanceTo(new THREE.Vector3().fromBufferAttribute(hinge, i))).toBe(0);
      }
      if (uv.getX(i) === .5 && uv.getY(i) > .31 && uv.getY(i) < .37) shoulder = spread(i);
      if (uv.getX(i) === .5 && uv.getY(i) === 1) lip = spread(i);
    }
    expect(shoulder).toBeGreaterThan(lip + .17);
    g.dispose();
  });
});

test('cosmos has two distal notches, daisy has a spatulate cap, and sunflower has a fine point', () => {
  const cosmos = gFor('cosmos'), daisy = gFor('daisy'), sunflower = gFor('sunflower');
  const tip = (g: THREE.BufferGeometry, u: number) => point(g, g.attributes.position, u, 1);
  for (const u of [2 / 7, 5 / 7]) expect(tip(cosmos, u).z).toBeLessThan(tip(cosmos, .5).z - .06);
  expect(tip(daisy, .5).z).toBeGreaterThan(tip(daisy, 1).z + .10);
  const tipWidth = (g: THREE.BufferGeometry) => tip(g, 1).x - tip(g, 0).x;
  expect(tipWidth(daisy)).toBeGreaterThan(.15);
  expect(tipWidth(sunflower)).toBeLessThan(.005);
  [cosmos, daisy, sunflower].forEach(g => g.dispose());
});

test('lily inner tepals broaden and reflex above the three outer tepals', () => {
  const outer = gFor('lily'), inner = gFor('lily', 1);
  const at = (g: THREE.BufferGeometry, u: number, t: number) => point(g, g.attributes.position, u, t);
  expect(at(inner, 1, .5).x - at(inner, 0, .5).x).toBeGreaterThan((at(outer, 1, .5).x - at(outer, 0, .5).x) * 1.26);
  expect(at(inner, .5, 1).z).toBeLessThan(at(inner, .5, 25 / 26).z);
  expect(at(outer, .5, 1).y).toBeLessThan(at(outer, .5, .5).y - .4);
  outer.dispose(); inner.dispose();
});

test('poppy silk pleats are geometry, not painted lines', () => {
  const g = gFor('poppy'), p = g.attributes.position;
  const samples = Array.from({ length: 17 }, (_, i) => point(g, p, (i + 2) / 20, .5).y);
  const reversals = samples.slice(1, -1).filter((y, i) => (y - samples[i]) * (y - samples[i + 2]) > 0);
  expect(reversals.length).toBeGreaterThanOrEqual(4);
  expect(Math.max(...samples) - Math.min(...samples)).toBeGreaterThan(.12);
  g.dispose();
});

test('centers have real flared corollas, a poppy capsule, and six lily anthers', () => {
  const head = new THREE.Group();
  for (const key of keys) {
    const center = buildCenter(createSpecimen(seed, key), head);
    if (key === 'lily') {
      expect((center.getObjectByName('Six lily anthers') as THREE.InstancedMesh).count).toBe(6);
      expect(center.children.filter(obj => obj.name === 'Stigma lobe')).toHaveLength(3);
    } else if (key === 'poppy') {
      expect(center.getObjectByName('Fluted poppy capsule with nine stigmatic rays')).toBeInstanceOf(THREE.Mesh);
      expect((center.getObjectByName('Poppy anthers') as THREE.InstancedMesh).count).toBe(32);
    } else {
      const tubes = center.getObjectByName('Open tubular disc florets') as THREE.InstancedMesh;
      expect(tubes).toBeInstanceOf(THREE.InstancedMesh);
      const p = tubes.geometry.attributes.position;
      expect(p.getY(20)).toBeGreaterThan(p.getY(21) + .15); // five lobes
      expect(p.getY(20)).toBeGreaterThan(p.getY(50) + .6); // bore is below the lip
      expect(p.getZ(20)).toBeGreaterThan(p.getZ(40) * 3); // hollow corolla, not a sphere pole
    }
  }
  const geometries = new Set<THREE.BufferGeometry>(), materials = new Set<THREE.Material>();
  head.traverse(obj => {
    if (obj instanceof THREE.InstancedMesh) obj.dispose();
    if (obj instanceof THREE.Mesh) { geometries.add(obj.geometry); materials.add(obj.material); }
  });
  geometries.forEach(g => g.dispose()); materials.forEach(m => m.dispose());
});

// These real v3 cuts include all five species, a three-whorl sunflower,
// and late accents. Assert the old per-stem stream length as well as geometry.
test.each([3, 32, 51, 608])('cut +%i keeps attachment order, random budgets and all booked mature bounds', offset => {
  const plan = createBouquet(seed + offset, 3);
  const draws: number[] = [];
  plan.flowers.forEach(({ specimen }, i) => {
    draws[i] = 0;
    const random = specimen.random;
    specimen.random = () => { draws[i]++; return random(); };
  });
  const textures = { leaf: new THREE.CanvasTexture(), petal: petalFields(1) };
  const b = buildBouquet(plan, textures);
  try {
    pose(b, 1); b.plant.updateMatrixWorld(true);
    for (const [i, { entry, petals, center }] of b.blooms.entries()) {
      const { specimen: s } = entry;
      if (!keys.includes(s.key as Key)) continue;
      const leafCount = entry.leafCount ?? (s.recipe.leaf === 'strap' ? 2 : 3);
      const sepals = s.recipe.sepalCount ?? (s.key === 'lily' || s.key === 'poppy' ? 0 : 5);
      const floretDraws = s.key === 'sunflower' ? 2400 : 780;
      const stamenDraws = s.key === 'lily' ? 6 : s.key === 'poppy' ? 32 : 0;
      expect(draws[i]).toBe(1 + leafCount * 5 + s.count * s.layers * 5 + sepals * 2 + floretDraws + stamenDraws);
      const cohorts = s.key === 'daisy' || s.key === 'sunflower' ? 5 : s.count;
      expect(petals.map(p => p.layer)).toEqual(Array.from({ length: cohorts * s.layers }, (_, j) => Math.floor(j / cohorts)));
      const e = headEnvelope(entry), c = new THREE.Vector3(...e.center), n = new THREE.Vector3(...e.axis);
      const count = (point: THREE.Vector3) => {
        point.sub(c);
        const h = point.dot(n) ** 2;
        return (point.lengthSq() - h) / e.radius ** 2 + h / e.halfHeight ** 2;
      };
      let max = 0;
      for (const { mesh } of petals) for (let j = 0; j < mesh.geometry.attributes.position.count; j++) {
        max = Math.max(max, count(mesh.getVertexPosition(j, vector).applyMatrix4(mesh.matrixWorld)));
      }
      center.traverse(mesh => {
        if (!(mesh instanceof THREE.Mesh)) return;
        const attr = mesh.geometry.attributes.position, matrix = new THREE.Matrix4();
        const instanced = mesh instanceof THREE.InstancedMesh;
        for (let k = 0; k < (instanced ? mesh.count : 1); k++) {
          if (instanced) mesh.getMatrixAt(k, matrix);
          for (let j = 0; j < attr.count; j++) max = Math.max(max,
            count(vector.fromBufferAttribute(attr, j).applyMatrix4(matrix).applyMatrix4(mesh.matrixWorld)));
        }
      });
      expect(max, `${s.key} at ${offset}/${i}`).toBeLessThanOrEqual(1);
    }
  } finally { disposeBouquet(b); textures.petal.dispose(); textures.leaf.dispose(); }
});
