// @vitest-environment node
import * as THREE from 'three';
import { expect, test } from 'vitest';
import { createBouquet } from './botany';
import { BLOOM_DURATION, leadingGuard } from './bloom-score';
import { bloomGifFrames } from './bloom-gif-format';
import { buildBouquet, disposeBouquet, pose } from './engine';
import { petalFields } from './petal-surface';
import type { MorphPetal, SpeciesKey } from './types';

const base = 1748091600123;
type Bouquet = ReturnType<typeof buildBouquet>;
type Bloom = Bouquet['blooms'][number];
const grafts = [
  [0, 0, 'dahlia'], [0, 4, 'billyButton'], [0, 9, 'anemone'],
  [1, 0, 'calla'], [1, 4, 'poppy'], [2, 9, 'cosmos'], [3, 8, 'daisy'],
  [5, 0, 'hydrangea'], [9, 0, 'tulip'], [10, 0, 'ranunculus'],
  [11, 0, 'iris'], [19, 0, 'orchid'], [32, 1, 'lily'], [91, 0, 'sunflower'],
] as const satisfies readonly (readonly [number, number, SpeciesKey])[];

function withBouquet(offset: number, index: number, fn: (b: Bouquet, head: Bloom, at: (local: number) => void) => void) {
  const textures = { petal: petalFields(1), leaf: new THREE.CanvasTexture() };
  const b = buildBouquet(createBouquet(base + offset, 3), textures);
  const head = b.blooms[index];
  try { fn(b, head, local => pose(b, head.startBeat + (head.endBeat - head.startBeat) * local)); }
  finally { disposeBouquet(b); textures.petal.dispose(); textures.leaf.dispose(); }
}

const v = (position: THREE.BufferGeometry['attributes'][string], i: number) => new THREE.Vector3().fromBufferAttribute(position, i);
const point = ({ mesh }: MorphPetal, i: number) => mesh.getVertexPosition(i, new THREE.Vector3());
function tip({ mesh, blades }: MorphPetal, blade = 0) {
  const uv = mesh.geometry.attributes.uv;
  const from = blades?.[blade].first ?? 0, end = blades?.[blade].end ?? uv.count;
  for (let i = from; i < end; i++) if (uv.getY(i) === 1 && Math.abs(uv.getX(i) - .5) < .034) return i;
  throw new Error('No distal vertex in blade.');
}

function snapshot(head: Bloom) {
  return [head.head.matrix.toArray(), ...head.petals.map(p => [
    p.mesh.morphTargetInfluences!.slice(), point(p, tip(p)).toArray(),
  ])];
}

test.each(grafts)('cut +%i stem %i: %s samples continuous, repeatable motion and ends at rest', (seed, index, key) => {
  withBouquet(seed, index, (b, head) => {
    expect(head.entry.specimen.key).toBe(key);
    const tracks = head.petals.filter(p => !p.blades || p.blades.length);
    const samples = tracks.map(p => ({ p, i: tip(p) }));
    const vertices = () => samples.map(({ p, i }) => point(p, i));
    pose(b, 0);
    const sealed = vertices();
    const opening = head.startBeat + .28 * (head.endBeat - head.startBeat);
    const gif = bloomGifFrames().reduce((near, next) => Math.abs(next.progress - opening) < Math.abs(near.progress - opening) ? next : near);
    pose(b, gif.progress); b.plant.updateMatrixWorld(true);
    const shoulder = vertices();
    expect(shoulder.some((p, i) => p.distanceTo(sealed[i]) > .08 * head.entry.specimen.length)).toBe(true);
    const shot = snapshot({ ...head, petals: tracks });
    const scale = head.entry.scale;
    expect(head.head.scale.toArray()).toEqual([scale, scale, scale]);
    for (const p of [gif.progress - 1 / BLOOM_DURATION, gif.progress + 1 / BLOOM_DURATION]) {
      pose(b, p);
      expect(Math.max(...vertices().map((v, i) => v.distanceTo(shoulder[i])))).toBeLessThan(.012 * head.entry.specimen.length);
    }
    pose(b, 1);
    expect(tracks.every(p => p.mesh.morphTargetInfluences!.every(weight => weight === 0))).toBe(true);
    expect(samples.every(({ p, i }) => point(p, i).equals(v(p.mesh.geometry.attributes.position, i)))).toBe(true);
    pose(b, gif.progress); b.plant.updateMatrixWorld(true);
    expect(snapshot({ ...head, petals: tracks })).toEqual(shot);
  });
});

test.each([[9, 0], [32, 1], [1, 4]] as const)('cut +%i: an outer tepal or silk fold parts before the inner edge', (seed, index) => {
  withBouquet(seed, index, (_, b, at) => {
    const { key, rotation, count, length } = b.entry.specimen;
    const first = leadingGuard(key, rotation, count);
    const lead = b.petals[first], answer = b.petals[key === 'poppy' ? (first + 2) % count : 3];
    const edge = [tip(lead), tip(answer)];
    at(0);
    const origins = [point(lead, edge[0]), point(answer, edge[1])];
    at(.20);
    expect(point(lead, edge[0]).distanceTo(origins[0]) - point(answer, edge[1]).distanceTo(origins[1])).toBeGreaterThan(.13 * length);
    at(.72);
    expect(point(answer, edge[1]).distanceTo(origins[1])).toBeGreaterThan(.115 * length);
    for (const { mesh } of b.petals) {
      const { position, uv } = mesh.geometry.attributes;
      for (let i = 0; i < position.count && uv.getY(i) === 0; i++) {
        expect(mesh.getVertexPosition(i, new THREE.Vector3()).distanceTo(v(position, i))).toBeLessThan(1e-6);
      }
    }
  });
});

test('the calla lap uncurls around a stationary insertion; the quill follows', () => {
  withBouquet(1, 0, (_, b, at) => {
    const [spathe] = b.petals, { first, end } = spathe.blades![0], uv = spathe.mesh.geometry.attributes.uv;
    let inner = -1, outer = -1;
    for (let i = first; i < end; i++) if (uv.getY(i) === 1) {
      if (uv.getX(i) === 0) inner = i;
      if (uv.getX(i) === 1) outer = i;
    }
    const radius = (p: THREE.Vector3) => Math.hypot(p.x, p.z);
    const measured = () => [radius(point(spathe, inner)), radius(point(spathe, outer))];
    at(0); const bud = measured();
    at(.35); const hinge = measured();
    at(1); const rest = measured();
    const gains = hinge.map((n, i) => (n - bud[i]) / (rest[i] - bud[i]));
    expect(gains[1] - gains[0]).toBeGreaterThan(.30);
    at(.35);
    expect(point(spathe, first).distanceTo(v(spathe.mesh.geometry.attributes.position, first))).toBeLessThan(1e-7);
  });
});

test('two orchid wings retain one draw while spreading at different moments', () => {
  withBouquet(19, 0, (_, b, at) => {
    const wings = b.petals.find(p => p.layer === 1)!;
    const [left, right] = [tip(wings, 0), tip(wings, 1)];
    at(0); const bud = [point(wings, left), point(wings, right)];
    at(.23);
    expect(Math.abs(point(wings, left).distanceTo(bud[0]) - point(wings, right).distanceTo(bud[1]))).toBeGreaterThan(.22 * b.entry.specimen.length);
    at(.50);
    expect(point(wings, left).distanceTo(bud[0])).toBeGreaterThan(.18 * b.entry.specimen.length);
    expect(point(wings, right).distanceTo(bud[1])).toBeGreaterThan(.18 * b.entry.specimen.length);
    expect(b.petals.filter(p => p.layer === 1)).toHaveLength(1);
    expect(wings.mesh.geometry.morphAttributes.normal!.every(attr => attr.array.every(Number.isFinite))).toBe(true);
  });
});

// Compare a beard grain against the same triangle-under-UV at every pose.
// This exercises the real joined spans, including the bead's normalized UVs
// being removed after folding, rather than reimplementing its shape function.
function atUV(p: MorphPetal, first: number, stride: number, rows: number, [t, s]: [number, number]) {
  const x = (s + 1) * .5 * (stride - 1), y = t * (rows - 1);
  const u = x % 1, v = y % 1, a = first + Math.floor(x) + stride * Math.floor(y);
  return u + v <= 1 ? point(p, a).multiplyScalar(1 - u - v).addScaledVector(point(p, a + 1), u).addScaledVector(point(p, a + stride), v)
    : point(p, a + stride + 1).multiplyScalar(u + v - 1).addScaledVector(point(p, a + 1), 1 - v).addScaledVector(point(p, a + stride), 1 - u);
}

test('iris falls reveal their attached beards while all three standards stay cupped', () => {
  withBouquet(11, 0, (_, b, at) => {
    const [falls, standards] = b.petals;
    const detail = falls.blades!.find(span => span.anchor)!;
    const host = falls.blades!.find(span => !span.anchor && span.voice === detail.voice)!;
    const uv = falls.mesh.geometry.attributes.uv;
    let stride = 1;
    while (uv.getY(host.first + stride) === 0) stride++;
    const relative = () => point(falls, detail.first).sub(atUV(falls, host.first, stride, (host.end - host.first) / stride, detail.anchor!));
    at(1); const rest = relative();
    at(0); const buds = [point(falls, tip(falls)), point(standards, tip(standards))];
    at(.26);
    expect(point(falls, tip(falls)).distanceTo(buds[0]) - point(standards, tip(standards)).distanceTo(buds[1])).toBeGreaterThan(.15 * b.entry.specimen.length);
    for (const frame of [0, .12, .25, .43, .61, .83, 1]) {
      at(frame);
      expect(relative().distanceTo(rest)).toBeLessThan(3e-7);
    }
  });
});

test.each([[0, 0, 12], [91, 0, 15], [3, 8, 10]] as const)('cut +%i: grouped ray or tube batches relay without breaking their sockets', (seed, index, budget) => {
  withBouquet(seed, index, (_, b, at) => {
    expect(b.petals.length).toBeLessThanOrEqual(budget);
    const outer = b.petals.filter(p => p.layer === 0);
    expect(outer.length).toBeGreaterThan(1);
    const bract = b.sepals[0];
    at(1); const matureBract = bract.rotation.x;
    at(0); const closedBract = bract.rotation.x;
    at(.18);
    if (b.entry.specimen.key !== 'dahlia') expect(bract.rotation.x).toBeGreaterThan(closedBract + .5 * (matureBract - closedBract));
    expect(Math.max(...outer.map(p => p.mesh.morphTargetInfluences![1])) - Math.min(...outer.map(p => p.mesh.morphTargetInfluences![1]))).toBeGreaterThan(.14);
    at(.43);
    for (const p of outer) {
      const { position, uv } = p.mesh.geometry.attributes;
      const firstRows = Array.from({ length: uv.count }, (_, i) => i).filter(i => uv.getY(i) === 0 && uv.getX(i) === .5);
      expect(firstRows.length).toBeGreaterThan(1);
      expect(firstRows.every(i => point(p, i).distanceTo(v(position, i)) < 1e-6)).toBe(true);
    }
  });
});

test.each([[9, 0], [19, 0], [91, 0]] as const)('cut +%i: the opening head stays clear of its support below the socket', (seed, index) => {
  withBouquet(seed, index, (bouquet, b, at) => {
    const ray = new THREE.Raycaster(), previous = new THREE.Vector3(), direction = new THREE.Vector3();
    const targets = b.petals.map(p => p.mesh);
    for (const frame of [0, .14, .26, .42, .60, .82, 1]) {
      at(frame); bouquet.plant.updateMatrixWorld(true);
      // Exclude the final two tube segments, where the head and stem are
      // intentionally joined. Check the moving support, not the rest path.
      for (let ring = 0; ring < 39; ring++) {
        const next = new THREE.Vector3();
        for (let j = 0; j < 7; j++) next.add(b.stem.getVertexPosition(ring * 8 + j, new THREE.Vector3()));
        next.multiplyScalar(1 / 7).applyMatrix4(b.stem.matrixWorld);
        if (ring) {
          ray.far = direction.subVectors(next, previous).length();
          ray.set(previous, direction.normalize());
          const hits = ray.intersectObjects(targets, false).filter(({ object, face }) => {
            // A receptacle is supposed to overlap the stem. Test its blades,
            // not the support geometry packed into the same morph batch.
            const batch = b.petals.find(p => p.mesh === object)!;
            if (!face || !batch.blades) return true;
            return batch.blades.some(span => face.a >= span.first && face.a < span.end);
          });
          const hit = hits[0];
          expect(hit, hit && `local frame ${frame}, ring ${ring}, petal UV ${hit.uv?.toArray()}`).toBeUndefined();
        }
        previous.copy(next);
      }
    }
  });
});

test.each([[5, 0], [0, 4]] as const)('cut +%i: floret bases keep up with the scaffold while lips unfold later', (seed, index) => {
  withBouquet(seed, index, (_, b, at) => {
    const [scaffold, low, upper] = b.petals;
    const root = low.blades![0].first, edge = tip(low);
    const lift = () => scaffold.mesh.morphTargetInfluences![0];
    const { position } = low.mesh.geometry.attributes, [shut] = low.mesh.geometry.morphAttributes.position!;
    for (const frame of [0, .19, .37, .58, .80, 1]) {
      at(frame);
      expect(point(low, root).distanceTo(v(position, root).lerp(v(shut, root), lift()))).toBeLessThan(1e-6);
      expect(upper.mesh.morphTargetInfluences![0]).toBe(lift());
    }
    at(.40);
    const carried = v(position, edge).lerp(v(shut, edge), lift());
    expect(point(low, edge).distanceTo(carried)).toBeGreaterThan(.045 * b.entry.specimen.length);
    expect(low.mesh.morphTargetInfluences![1]).toBeLessThan(upper.mesh.morphTargetInfluences![1]);
  });
});
