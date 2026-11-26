import * as THREE from 'three';
import { ease } from './bloom-score';
import type { Random, Specimen } from './types';

const TAU = Math.PI * 2;
const GOLDEN_ANGLE = 2.3999632297;
const up = new THREE.Vector3(0, 1, 0);
const material = (color: string, roughness = .82) => new THREE.MeshStandardMaterial({ color, roughness });
const tintMaterial = () => new THREE.MeshStandardMaterial({ vertexColors: true, roughness: .84, side: THREE.DoubleSide });

// Preserve the old three draws per disc floret, even on hidden centers. The
// new silhouettes and stamens can be repriced without changing the stream.
function centerDraws(random: Random, count: number) {
  return Array.from({ length: count }, () => [random(), random(), random()] as const);
}

function radialMesh(sides: number, rows: number, sample: (row: number, angle: number) => [number, number, THREE.Color]) {
  const positions: number[] = [], colors: number[] = [], index: number[] = [];
  for (let j = 0; j < rows; j++) for (let i = 0; i < sides; i++) {
    const a = i * TAU / sides;
    const [r, y, color] = sample(j, a);
    positions.push(r * Math.sin(a), y, r * Math.cos(a));
    colors.push(color.r, color.g, color.b);
    if (j === rows - 1) continue;
    const first = j * sides, next = (i + 1) % sides;
    index.push(first + i, first + next, first + sides + i, first + next, first + sides + next, first + sides + i);
  }
  const g = new THREE.BufferGeometry();
  g.setIndex(index);
  g.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  g.computeVertexNormals();
  return g;
}

// A tubular corolla with a darker well below its five turned lobes. Stacked
// rings give a real cavity even without shadow maps, one instanced draw.
function diskFloret(expanded: boolean) {
  const levels = expanded
    ? [[.53, -.22, .58], [.68, .75, .93], [1, 1.22, 1.32], [.59, 1.10, .60], [.32, .86, .29], [.005, .82, .29]]
    : [[.59, -.2, .63], [.71, .47, .80], [.83, .70, 1.23], [.43, .69, .75], [.06, .61, .26]];
  const color = new THREE.Color();
  return radialMesh(10, levels.length, (j, a) => {
    const [r, h, shade] = levels[j];
    const lobes = Math.cos(5 * a);
    return [r * (1 + (j === 2 ? .20 : .065) * lobes), h + (j === 2 ? .26 : j === 3 ? .05 : 0) * lobes,
      color.setScalar(shade * (1 + .11 * lobes))];
  });
}

function disc(center: THREE.Group, specimen: Specimen, draws: ReturnType<typeof centerDraws>) {
  const { recipe, key, rotation } = specimen;
  const sunflower = key === 'sunflower', cosmos = key === 'cosmos';
  const R = recipe.disk, rise = R * (sunflower ? .29 : .39);
  const bed = new THREE.Mesh(new THREE.SphereGeometry(1, 32, 12), material(sunflower ? '#57351e' : cosmos ? '#997020' : '#b58524'));
  const floor = sunflower ? .069 : .094;
  bed.position.y = floor;
  bed.scale.set(R, rise, R);
  center.add(bed);
  const count = sunflower ? 416 : cosmos ? 97 : 133;
  const closed = sunflower ? 251 : 0, opened = count - closed;
  const tight = closed ? new THREE.InstancedMesh(diskFloret(false), tintMaterial(), closed) : undefined;
  const tubes = new THREE.InstancedMesh(diskFloret(true), tintMaterial(), opened);
  const dummy = new THREE.Object3D(), normal = new THREE.Vector3(), spin = new THREE.Quaternion(), color = new THREE.Color();
  const bronze = new THREE.Color('#825328'), ochre = new THREE.Color('#dda64e');
  for (let i = 0; i < count; i++) {
    const [size, hue, value] = draws[i];
    const u = .979 * Math.sqrt((i + .45) / count);
    const angle = i * GOLDEN_ANGLE + rotation;
    const x = Math.cos(angle), z = Math.sin(angle), shoulder = Math.sqrt(1 - u * u);
    const r = R * u;
    const pitch = R / Math.sqrt(count), spread = pitch * (sunflower ? 1.09 : 1.18) * (.87 + .22 * size);
    dummy.position.set(x * r, floor + rise * shoulder, z * r);
    normal.set(x * u * .39, shoulder + .24, z * u * .39).normalize();
    dummy.quaternion.setFromUnitVectors(up, normal).multiply(spin.setFromAxisAngle(up, angle));
    const expanded = i >= closed;
    dummy.scale.set(spread, spread * (expanded ? 1 + (sunflower ? .44 : .14) * ease((u - .73) / .25) : .87), spread);
    dummy.updateMatrix();
    const mesh = expanded ? tubes : tight!, at = expanded ? i - closed : i;
    mesh.setMatrixAt(at, dummy.matrix);
    if (sunflower) color.copy(bronze).lerp(ochre, ease((u - .68) / .30) * (.79 + .21 * hue)).multiplyScalar(.63 + .53 * value);
    else color.setHSL((cosmos ? .100 : .116) + hue * .025, .78 + size * .15, .42 + value * .16);
    mesh.setColorAt(at, color);
  }
  if (tight) { tight.name = 'Tight inner disc florets'; center.add(tight); }
  tubes.name = 'Open tubular disc florets';
  center.add(tubes);
}

function sphere(group: THREE.Group, point: THREE.Vector3, scale: THREE.Vector3Tuple, mat: THREE.Material, detail = 16) {
  const mesh = new THREE.Mesh(new THREE.SphereGeometry(1, detail, 10), mat);
  mesh.position.copy(point);
  mesh.scale.fromArray(scale);
  group.add(mesh);
  return mesh;
}

function filament(group: THREE.Group, points: THREE.Vector3[], radius: number, mat: THREE.Material) {
  const mesh = new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(points), 10, radius, 6, false), mat);
  group.add(mesh);
  return mesh;
}

function lily(center: THREE.Group, specimen: Specimen) {
  sphere(center, new THREE.Vector3(0, .035, 0), [.153, .071, .153], material('#aba060'));
  const pale = material('#c8d38b', .70);
  const rust = new THREE.Color('#91501f'), seam = new THREE.Color('#50291f'), tone = new THREE.Color();
  // A grooved pair of pollen sacs, attached at its midpoint to a curved
  // pale filament. Reorient the same mesh for each of the six anthers.
  const pollen = radialMesh(12, 9, (j, a) => {
    const t = j / 8, groove = Math.abs(Math.cos(a));
    return [(.001 + .040 * Math.sin(Math.PI * t) ** .65) * (.76 + .24 * groove), (t - .5) * .224,
      tone.copy(rust).lerp(seam, .69 * (1 - groove) ** 3)];
  });
  const anthers = new THREE.InstancedMesh(pollen, tintMaterial(), 6);
  anthers.name = 'Six lily anthers';
  const dummy = new THREE.Object3D();
  for (let i = 0; i < 6; i++) {
    const a = specimen.rotation + (i + .52) * TAU / 6;
    const x = Math.sin(a), z = Math.cos(a);
    const r = (i % 2 ? .39 : .30) + .043 * Math.cos(a * 2);
    const height = .48 + specimen.random() * .125 + (i % 2 ? 0 : .085);
    const tip = new THREE.Vector3(x * r, height, z * r);
    filament(center, [new THREE.Vector3(x * .047, .066, z * .047), new THREE.Vector3(x * r * .54, height * .49, z * r * .54), tip], .012, pale);
    dummy.position.copy(tip);
    dummy.quaternion.setFromUnitVectors(up, new THREE.Vector3(x * .76 + z * .39, .19 + .23 * Math.sin(a), z * .76 - x * .39).normalize());
    dummy.updateMatrix();
    anthers.setMatrixAt(i, dummy.matrix);
  }
  center.add(anthers);
  const pistil = new THREE.Vector3(-.095, .83, .035);
  filament(center, [new THREE.Vector3(0, .05, 0), new THREE.Vector3(-.018, .46, .015), pistil], .018, pale).name = 'Lily style';
  const stigma = material('#ddd28a');
  for (let i = 0; i < 3; i++) {
    const a = i * TAU / 3;
    sphere(center, pistil.clone().add(new THREE.Vector3(.03 * Math.cos(a), 0, .025 * Math.sin(a))), [.036, .029, .039], stigma, 9).name = 'Stigma lobe';
  }
}

function poppy(center: THREE.Group, specimen: Specimen) {
  const moss = new THREE.Color('#758b49'), lime = new THREE.Color('#afbb74'), ridge = new THREE.Color('#d3c68c');
  const shadow = new THREE.Color('#4c6747'), color = new THREE.Color();
  sphere(center, new THREE.Vector3(0, .025, 0), [.290, .088, .290], material('#58343b'));
  const rings = [[.124, .018], [.140, .057], [.150, .127], [.164, .227], [.171, .310], [.206, .333], [.188, .379], [.157, .386], [.116, .366], [.055, .358], [.001, .378]];
  const foot = new THREE.Color('#512d38');
  const capsule = new THREE.Mesh(radialMesh(54, rings.length, (j, a) => {
    const [r, y] = rings[j];
    const ray = Math.cos(9 * a), crown = j >= 5;
    color.copy(j < 5 ? moss : shadow).lerp(lime, crown ? .32 : .36 + ray * .23);
    if (j < 3) color.lerp(foot, j < 2 ? 1 : .30);
    if (crown) color.lerp(ridge, .89 * Math.max(0, ray) ** 4 * (j === 5 ? .45 : 1));
    return [r * (1 + (crown ? .045 : .095) * ray), y + (crown ? .019 : .007) * ray * Math.sin(Math.PI * Math.min(1, r / .25)), color];
  }), tintMaterial());
  capsule.name = 'Fluted poppy capsule with nine stigmatic rays';
  capsule.rotation.y = specimen.rotation;
  center.add(capsule);
  // Two ranks of near-black stamens wrap the green capsule, not a second disk.
  const count = 32;
  const fibers = new THREE.InstancedMesh(new THREE.CylinderGeometry(.012, .009, 1, 5), material('#533440'), count);
  const grains = new THREE.InstancedMesh(new THREE.SphereGeometry(1, 8, 6), material('#36272e'), count);
  fibers.name = 'Poppy filaments'; grains.name = 'Poppy anthers';
  const dummy = new THREE.Object3D(), delta = new THREE.Vector3();
  for (let i = 0; i < count; i++) {
    const ring = i % 2;
    const a = specimen.rotation + (i + ring * .31) * TAU / count;
    const x = Math.cos(a), z = Math.sin(a), r = .265 + .085 * ring;
    const h = .205 + .092 * specimen.random() + .016 * ring;
    const from = new THREE.Vector3(x * .085, .042, z * .085);
    const to = new THREE.Vector3(x * r, h, z * r);
    delta.copy(to).sub(from);
    dummy.position.copy(from).lerp(to, .5);
    dummy.scale.set(1, delta.length(), 1);
    dummy.quaternion.setFromUnitVectors(up, delta.normalize());
    dummy.updateMatrix();
    fibers.setMatrixAt(i, dummy.matrix);
    dummy.position.copy(to);
    dummy.scale.set(.025, .041, .029);
    dummy.updateMatrix();
    grains.setMatrixAt(i, dummy.matrix);
  }
  center.add(fibers, grains);
}

// Keep the original tulip center; its hidden pollen still consumed RNG.
function tulip(center: THREE.Group, specimen: Specimen) {
  const fiber = material('#bed27e', .70), grains = material('#b77d20', .85);
  const anther = new THREE.SphereGeometry(1, 10, 8);
  for (let i = 0; i < 6; i++) {
    const a = i / 6 * Math.PI * 2, x = Math.cos(a), z = Math.sin(a);
    const from = new THREE.Vector3(x * .1, .05, z * .1);
    const to = new THREE.Vector3(x * .2, .55 + specimen.random() * .2, z * .2);
    const stem = new THREE.Mesh(new THREE.CylinderGeometry(.008, .012, from.distanceTo(to), 5), fiber);
    stem.position.copy(from).lerp(to, .5);
    stem.quaternion.setFromUnitVectors(up, to.clone().sub(from).normalize());
    const pollen = new THREE.Mesh(anther, grains);
    pollen.position.copy(to); pollen.scale.set(.035, .025, .09); pollen.rotation.y = a;
    center.add(stem, pollen);
  }
  const style = new THREE.Mesh(new THREE.CylinderGeometry(.012, .015, .83, 7), material('#b9cf79', .80));
  style.position.y = .44;
  center.add(style);
  const stigma = new THREE.Mesh(new THREE.SphereGeometry(.04, 8, 6), material('#d7db95', .80));
  stigma.position.y = .87;
  center.add(stigma);
}

export function buildCenter(specimen: Specimen, head: THREE.Group) {
  const center = new THREE.Group();
  head.add(center);
  const { key, recipe, random } = specimen;
  const composite = key === 'sunflower' || key === 'cosmos' || key === 'daisy';
  const budget = recipe.center === 'seeds' ? 800 : 260;
  if (composite) {
    const draws = centerDraws(random, budget);
    disc(center, specimen, draws);
  } else {
    for (let i = 0; i < budget; i++) { random(); random(); random(); }
    if (key === 'lily') lily(center, specimen);
    else if (key === 'poppy') poppy(center, specimen);
    else if (key === 'tulip') tulip(center, specimen);
  }
  return center;
}
