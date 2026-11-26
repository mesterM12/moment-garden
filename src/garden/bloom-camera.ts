import * as THREE from 'three';
import { BLOOM_DURATION, ease } from './bloom-score';

export const BLOOM_FOV = 34;
export const BLOOM_FRONT_YAW = -.10;
export const FOCAL_HOLD_MS = 1800;
export const PULLBACK_END_MS = 4800;
const FULL_DISTANCE = 12.3;
const PRESENTATION_ANGLE = Math.atan2(2.10, FULL_DISTANCE);
const CAMERA_RISE = Math.sin(PRESENTATION_ANGLE);
const CAMERA_DEPTH = Math.cos(PRESENTATION_ANGLE);
const TAN = Math.tan(THREE.MathUtils.degToRad(BLOOM_FOV / 2));
const FULL_TARGET = new THREE.Vector3(0, .05, 0);
const X_AXIS = new THREE.Vector3(1, 0, 0);
export type HeldBloomLens = { anchor: THREE.Vector3; distance: number };

interface FramedBouquet {
  plant: THREE.Group;
  framePoints: readonly THREE.Vector3[];
  focalPoints: readonly THREE.Vector3[];
  focus: THREE.Vector3;
  plan: { version: 2 | 3 };
}

// Use the same geometry clock in the live postcard and deterministic export.
export function bloomPullback(progress: number) {
  return ease((progress * BLOOM_DURATION - FOCAL_HOLD_MS) / (PULLBACK_END_MS - FOCAL_HOLD_MS));
}

/** DOM-free, state-independent framing. Set the camera's aspect/projection and
 * the plant's rotation before framing. Targets are cached, never integrated. */
export function createBloomFramer(camera: THREE.PerspectiveCamera) {
  const toView = new THREE.Matrix4(), plantRotation = new THREE.Matrix4();
  const viewRotation = new THREE.Matrix4().makeRotationX(PRESENTATION_ANGLE);
  const point = new THREE.Vector3(), target = new THREE.Vector3(), viewTarget = new THREE.Vector3();
  const focal = new THREE.Vector3();
  let cache: { plant: THREE.Group; aspect: number; pitch: number; yaw: number; roll: number; fullDistance: number; focalDistance: number } | undefined;

  function distanceToFit(points: readonly THREE.Vector3[], center: THREE.Vector3, margin: number) {
    viewTarget.copy(center).applyMatrix4(viewRotation);
    const halfH = margin * TAN, halfW = halfH * camera.aspect;
    let max = .2;
    for (const p of points) {
      point.copy(p).applyMatrix4(toView).sub(viewTarget);
      max = Math.max(max, point.z + Math.abs(point.x) / halfW, point.z + Math.abs(point.y) / halfH);
    }
    return max;
  }

  function fit({ plant, framePoints, focalPoints }: FramedBouquet) {
    const { aspect } = camera, { x: pitch, y: yaw, z: roll } = plant.rotation;
    if (cache && cache.plant === plant && cache.aspect === aspect && cache.pitch === pitch && cache.yaw === yaw && cache.roll === roll) return cache;
    toView.multiplyMatrices(viewRotation, plantRotation.makeRotationFromEuler(plant.rotation));
    if (focalPoints.length) {
      // The cloud contains real posed head extrema, not the stem or leaf sockets.
      let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity, minZ = Infinity, maxZ = -Infinity;
      for (const p of focalPoints) {
        point.copy(p).applyMatrix4(toView);
        minX = Math.min(minX, point.x); maxX = Math.max(maxX, point.x);
        minY = Math.min(minY, point.y); maxY = Math.max(maxY, point.y);
        minZ = Math.min(minZ, point.z); maxZ = Math.max(maxZ, point.z);
      }
      focal.set((minX + maxX) / 2, (minY + maxY) / 2, (minZ + maxZ) / 2).applyAxisAngle(X_AXIS, -PRESENTATION_ANGLE);
    } else focal.copy(FULL_TARGET);
    const fullDistance = Math.max(Math.hypot(FULL_DISTANCE, 2.10), 5.62 / (2 * TAN * aspect), distanceToFit(framePoints, FULL_TARGET, .96));
    const focalDistance = focalPoints.length ? distanceToFit(focalPoints, focal, .83) : fullDistance;
    cache = { plant, aspect, pitch, yaw, roll, fullDistance, focalDistance };
    return cache;
  }

  function positionCamera(distance: number) {
    camera.position.set(target.x, target.y + CAMERA_RISE * distance, target.z + CAMERA_DEPTH * distance);
    camera.lookAt(target);
  }

  return {
    clear() { cache = undefined; },
    frameBloom(bouquet: FramedBouquet, progress: number) {
      const { fullDistance, focalDistance } = fit(bouquet);
      const t = bloomPullback(progress);
      target.copy(focal).lerp(FULL_TARGET, t);
      positionCamera(THREE.MathUtils.lerp(focalDistance, fullDistance, t));
    },
    frameFull(bouquet: FramedBouquet) {
      const { fullDistance } = fit(bouquet);
      target.copy(FULL_TARGET);
      positionCamera(fullDistance);
    },
    holdBloom(bouquet: FramedBouquet, progress: number): HeldBloomLens {
      const { fullDistance, focalDistance } = fit(bouquet);
      const t = bloomPullback(progress);
      const anchor = focal.clone().lerp(FULL_TARGET, t).applyQuaternion(bouquet.plant.quaternion.clone().invert());
      return { anchor, distance: THREE.MathUtils.lerp(focalDistance, fullDistance, t) };
    },
    frameView(bouquet: FramedBouquet, detail: number, held?: HeldBloomLens) {
      // In a held lens the subject is the pivot, not the centre of the canvas
      // or the bounding-box centre of the rotated flowers. No auto-zoom on drag.
      if (held && detail === 1) {
        target.copy(held.anchor).applyEuler(bouquet.plant.rotation);
        positionCamera(held.distance);
        return;
      }
      const { fullDistance } = fit(bouquet);
      target.copy(FULL_TARGET);
      let distance = fullDistance;
      if (detail > 0) {
        if (held) point.copy(held.anchor).applyEuler(bouquet.plant.rotation);
        else point.copy(bouquet.focus).applyEuler(bouquet.plant.rotation).add(FULL_TARGET);
        target.lerp(point, detail);
        const width = bouquet.plan.version === 3 ? 3.96 : 5.26;
        const detailDistance = held?.distance ?? Math.max(Math.hypot(8.65, 2.10), width / (2 * TAN * camera.aspect));
        distance = THREE.MathUtils.lerp(fullDistance, detailDistance, detail);
      }
      positionCamera(distance);
    },
  };
}
