import * as THREE from 'three';

/** A tiny papery, five-ribbed cup at the end of a filler branch. Its walls
 * return into a shaded throat instead of ending in a solid polygonal cap.
 * All sections share the same stalk attachment. No second draw or texture. */
export function sprayCalyx(root: THREE.Vector3, axis: THREE.Vector3, radius: number, phase: number, opening: number) {
  const geometry = new THREE.BufferGeometry();
  const lean = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), axis.clone().normalize());
  const base = new THREE.Color('#82815a'), calyx = new THREE.Color('#b9a982');
  const paper = new THREE.Color('#e6d7c1'), well = new THREE.Color('#938052');
  const p = new THREE.Vector3(), c = new THREE.Color();
  const points: number[] = [], colors: number[] = [], indices: number[] = [];
  const around = 15, mouth = .46 + .50 * opening;
  const vertex = (r: number, y: number, a: number, tint: THREE.Color) => {
    p.set(radius * r * Math.cos(a), radius * y, radius * r * Math.sin(a));
    p.applyQuaternion(lean).add(root);
    points.push(p.x, p.y, p.z); colors.push(tint.r, tint.g, tint.b);
  };
  vertex(0, 0, 0, base);
  for (let ring = 0; ring < 4; ring++) {
    for (let i = 0; i < around; i++) {
      const a = phase + i * 2 * Math.PI / around;
      // Five real lobes, with unequal tips and a crease between them.
      const lobe = i % 3 === 0 ? 1 : 0;
      const hand = .5 + .5 * Math.cos(2.31 * Math.floor(i / 3) + phase);
      const rim = 1.22 + lobe * (.26 + .18 * hand);
      const r = ring === 0 ? .25 + .07 * lobe : ring === 1 ? .56 + .12 * lobe
        : ring === 2 ? mouth * (.72 + lobe * (.26 + .10 * hand)) : .21;
      const y = ring === 0 ? .32 : ring === 1 ? .91 : ring === 2 ? rim : .82;
      if (ring < 2) c.copy(base).lerp(calyx, (ring ? .85 : .32) - .16 * lobe);
      else if (ring === 2) c.copy(calyx).lerp(paper, .49 + .30 * lobe + .11 * opening);
      else c.copy(well);
      vertex(r, y, a + (ring === 2 ? .08 * hand : 0), c);
      const j = 1 + ring * around + i, next = 1 + ring * around + (i + 1) % around;
      if (!ring) indices.push(0, j, next);
      else indices.push(j - around, j, next - around, next - around, j, next);
    }
  }
  const end = points.length / 3;
  vertex(0, .76, 0, well);
  for (let i = 0; i < around; i++) indices.push(1 + 3 * around + i, end, 1 + 3 * around + (i + 1) % around);
  geometry.setIndex(indices);
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(points, 3));
  geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  geometry.computeVertexNormals();
  return geometry;
}
