import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { handAttribute, petalHand } from './petal-hand';
import { foldBlade } from './petal-fold';
import type { MorphPetal, SpeciesKey } from './types';

// Keep separate textures, veins and authored shapes per blade but only a few
// draw calls per whorl of 20–30 ray florets. All targets share the same socket.
export function bladeBatches(key: SpeciesKey, head: THREE.Group, material: THREE.Material, timestamp: number) {
  const rings = new Map<number, { geometries: THREE.BufferGeometry[]; layer: number; offset: number }>();
  const matrix = new THREE.Matrix4(), normal = new THREE.Matrix3();
  const yaw = new THREE.Matrix4(), hinge = new THREE.Matrix4();
  const socket = new THREE.Vector3();
  return {
    add(g: THREE.BufferGeometry, i: number, layer: number, yawAngle: number, height: number,
      radius: number, openAngle: number, offset: number) {
      handAttribute(g)(0, g.attributes.position.count, petalHand(timestamp, layer, i));
      if (!g.morphAttributes.position) foldBlade(g, key, openAngle, yawAngle, radius);
      const { position: positions = [], normal: normals = [] } = g.morphAttributes;
      matrix.multiplyMatrices(yaw.makeRotationY(yawAngle), hinge.makeRotationX(openAngle));
      matrix.setPosition(socket.set(Math.sin(yawAngle) * radius, height, Math.cos(yawAngle) * radius));
      normal.getNormalMatrix(matrix);
      g.applyMatrix4(matrix);
      for (const target of positions) target.applyMatrix4(matrix);
      for (const target of normals) target.applyNormalMatrix(normal);
      const ray = key === 'sunflower' || key === 'daisy';
      const cohort = layer * 64 + (ray ? i % 5 : i);
      if (!rings.has(cohort)) rings.set(cohort, { geometries: [], layer, offset });
      rings.get(cohort)!.geometries.push(g);
    },
    finish(): MorphPetal[] {
      return [...rings.values()].map(({ geometries, layer, offset }) => {
        const merged = geometries.length > 1;
        const mesh = new THREE.Mesh(merged ? mergeGeometries(geometries) : geometries[0], material);
        if (merged) geometries.forEach(g => g.dispose());
        head.add(mesh);
        return { mesh, layer, offset };
      });
    },
  };
}
