import * as THREE from 'three';
import * as Botany from './botany';
import * as ExtraBlooms from './extra-blooms';
import * as PetalMeshes from './petal-meshes';
import { BouquetRotation } from './rotation';
import { CloseView } from './close-view';
import type { ExpandedBouquetPlan as BouquetPlan, GardenEngine, GardenEngineOptions, MorphPetal, Specimen, StemEntry } from './types';

import { BLOOM_DURATION as DURATION, bloomStart, clamp, ease, flexAt, foldWeights, hingePeak, leadingGuard, petalOpening, petalPace, petalWave, stemTension } from './bloom-score';
import { finishPetals, tieBouquet } from './florist-finish';
import { buildFiller } from './filler';
import { bladeBatches } from './blade-batches';
import { petalFields, petalSurface } from './petal-surface';
const BRAND = 'Flowers for You';
const GIFT_NOTE = 'I picked these flowers for you.';
const WEBGL_ERROR = 'These flowers need WebGL 2 to bloom. Try a current browser with hardware acceleration enabled.';
const RENDER_ERROR = 'These flowers couldn’t open. Try reloading the page.';
const CONTEXT_ERROR = 'The 3D preview paused. You can still send this bouquet, or reload it if the preview doesn’t return.';
const formatDate = new Intl.DateTimeFormat('en-US', { month: 'long', day: 'numeric', year: 'numeric' });

type PetalPalette = { base: string; tip: string; root: string; fleck?: string };
type Random = () => number;
type HeadEnvelope = { center: THREE.Vector3; axis: THREE.Vector3; radius: number; halfHeight: number };
type Bloom = ReturnType<typeof buildBloom>;
type Textures = { petal: ReturnType<typeof petalFields>; leaf: THREE.CanvasTexture };
type BuiltBouquet = { framePoints: THREE.Vector3[]; focus: THREE.Vector3; plant: THREE.Group; blooms: Bloom[]; ribbon: THREE.Group; filler?: ReturnType<typeof buildFiller>; plan: BouquetPlan; materials: Set<THREE.Material> };

function leafVeins(document: Document, anisotropy: number) {
  const surface = document.createElement('canvas');
  surface.width = 256;
  surface.height = 512;
  const ctx = surface.getContext('2d');
  if (!ctx) throw new Error('Could not draw the leaf texture.');
  ctx.fillStyle = '#999';
  ctx.fillRect(0, 0, 256, 512);
  ctx.lineWidth = 1.6;
  ctx.strokeStyle = '#d6d6d6';
  for (let i = 0; i < 16; i++) {
    const y = i * 31;
    ctx.beginPath();
    ctx.moveTo(128, y);
    ctx.quadraticCurveTo(i % 2 ? 190 : 65, y + 28, i % 2 ? 253 : 3, y + 105);
    ctx.stroke();
  }
  ctx.lineWidth = 3;
  ctx.beginPath(); ctx.moveTo(128, 0); ctx.lineTo(128, 512); ctx.stroke();
  const texture = new THREE.CanvasTexture(surface);
  texture.anisotropy = anisotropy;
  return texture;
}

// A petal is a cupped, gently ruffled surface, not a flat billboard.
function botanicalGeometry(length: number, width: number, palette: PetalPalette, random: Random, specimen: Specimen, isLeaf = false) {
  const across = 18;
  const along = 28;
  const positions = [];
  const colors = [];
  const uvs = [];
  const indices = [];
  const base = new THREE.Color(palette.base);
  const tip = new THREE.Color(palette.tip);
  const root = new THREE.Color(palette.root);
  const asymmetry = (random() - 0.5) * 0.15;
  const phase = random() * Math.PI * 2;
  const recipe = specimen.recipe;
  const fleck = new THREE.Color(palette.fleck || palette.root);
  const tint = new THREE.Color();
  const broadLip = !isLeaf && (specimen.key === 'cosmos' || specimen.key === 'poppy' || specimen.key === 'daisy');
  const poppy = !isLeaf && specimen.key === 'poppy';
  const ink = new THREE.Color('#442131');
  for (let j = 0; j <= along; j++) {
    const t = j / along;
    const profile = Math.pow(Math.max(0, Math.sin(Math.PI * t)), isLeaf ? (recipe.leaf === 'broad' ? 0.5 : 0.8) : recipe.shape);
    const serration = isLeaf && recipe.leaf === 'serrated' ? 1 - 0.12 * Math.abs(Math.sin(t * 55)) : 1;
    // Keep a finite distal lip on blunt ray florets, not a collapsed point.
    const silhouette = (broadLip ? Math.max(profile, ease(t) * (poppy ? .63 : .52)) : profile) * serration;
    for (let i = 0; i <= across; i++) {
      const u = i / across;
      const s = u * 2 - 1;
      const ruffle = Math.sin(t * 23 + phase + s * 3) * (isLeaf ? 0.014 : recipe.ruffle) * Math.pow(Math.abs(s), 3) * t;
      const x = s * width * silhouette * (1 + asymmetry * s) + Math.sin(t * 4) * asymmetry * t;
      const cosmosNotch = !isLeaf && specimen.key === 'cosmos' ? (Math.exp(-(((s - 0.42) / 0.10) ** 2)) + Math.exp(-(((s + 0.42) / 0.10) ** 2))) * 0.07 * ease((t - 0.78) / 0.22) : 0;
      const z = length * t - cosmosNotch - (broadLip ? length * .094 * s * s * ease((t - .70) / .30) : 0);
      const ridge = Math.exp(-s * s * 26) * silhouette;
      const folds = Math.cos(s * (poppy ? 10 : 6) + t * 1.2 + phase) * silhouette;
      const y = isLeaf
        ? .17 * Math.sin(Math.PI * t) + .055 * ridge - .15 * s * s * silhouette + .09 * s * t * silhouette + ruffle
        : .16 * Math.sin(t * Math.PI) + recipe.curl * t * t + recipe.cup * s * s * silhouette + ruffle + (poppy ? .067 : .018) * folds;
      positions.push(x, y, z);
      uvs.push(u, t);
      const color = tint.copy(root).lerp(base, ease(t / 0.42));
      const pattern = isLeaf ? 'gradient' : specimen.pattern;
      const tipBlend = pattern === 'picotee'
        ? ease((Math.abs(s) - 0.65) / 0.35) * 0.85 + ease((t - 0.82) / 0.18) * 0.5
        : ease((t - 0.35) / 0.65) * 0.86;
      color.lerp(tip, Math.min(1, tipBlend));
      if (!isLeaf && (pattern === 'speckled' || specimen.key === 'lily') && t > 0.15 && t < 0.7) {
        const spots = Math.sin(u * 93 + phase) * Math.sin(t * 127 + phase);
        if (spots > 0.87) color.lerp(fleck, 0.75);
      }
      if (poppy) color.lerp(ink, .82 * (1 - ease((t - .06) / .24)) * (1 - .6 * s * s));
      if (isLeaf) color.lerp(tip, .24 * ridge);
      const vein = 1 - Math.pow(Math.cos(s * 15 + t * 2 + phase), 8) * .068;
      color.multiplyScalar(vein * (.98 - .09 * s * s + .04 * folds));
      colors.push(color.r, color.g, color.b);
      if (j < along && i < across) {
        const a = j * (across + 1) + i;
        const b = a + across + 1;
        indices.push(a, b, a + 1, b, b + 1, a + 1);
      }
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('normal', new THREE.Float32BufferAttribute(new Float32Array(positions.length), 3));
  geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return geometry;
}

type RouteScore = (points: THREE.Vector3[]) => number;
function routedStem(bottom: THREE.Vector3, knot: THREE.Vector3, middle: THREE.Vector3, top: THREE.Vector3, obstacles: HeadEnvelope[], earlierStems: THREE.Vector3[][], poseCost?: RouteScore) {
  const offsets = [0, 0.25, -0.25, 0.50, -0.50, 0.82, -0.82];
  let best: THREE.CatmullRomCurve3 | undefined;
  let bestScore = Infinity;
  for (const depth of offsets) {
    for (const side of [0, 0.22, -0.22, 0.42, -0.42]) {
      const bend = middle.clone();
      bend.x += side;
      bend.z += depth;
      const shoulder = top.clone().lerp(bend, 0.35);
      shoulder.z += depth * 0.45;
      const curve = new THREE.CatmullRomCurve3([bottom, knot, bend, shoulder, top]);
      const samples = curve.getPoints(40).filter(point => point.y > -1.65);
      let score = Math.abs(depth) * 0.3 + Math.abs(side) * 0.45 + (poseCost?.(samples) ?? 0);
      for (const point of samples) {
        for (const head of obstacles) {
          const offset = point.clone().sub(head.center);
          const axial = offset.dot(head.axis);
          const radialSq = Math.max(0, offset.lengthSq() - axial * axial);
          const clearance = radialSq / (head.radius + 0.034) ** 2 + axial ** 2 / (head.halfHeight + 0.034) ** 2;
          if (clearance < 1) score += 12 + 14 * (1 - clearance);
        }
        for (const points of earlierStems) {
          if (points.some(other => other.distanceToSquared(point) < 0.061 ** 2)) score += 1.8;
        }
        if (score >= bestScore) break;
      }
      if (score < bestScore) { best = curve; bestScore = score; }
      if (bestScore === 0) return curve;
    }
  }
  if (!best) throw new Error('Could not route a bouquet stem.');
  return best;
}

function buildBloom(entry: StemEntry, index: number, bouquet: BouquetPlan, envelopes: HeadEnvelope[], earlierStems: THREE.Vector3[][], plant: THREE.Group, materials: Set<THREE.Material>, textures: Textures) {
  const specimen = entry.specimen;
  const { random, palette, recipe } = specimen;
  const petals: MorphPetal[] = [];
  const leaves: THREE.Group[] = [];
  const sepals: THREE.Mesh[] = [];
  const group = new THREE.Group();
  plant.add(group);
  const green = new THREE.MeshStandardMaterial({ color: `hsl(${specimen.greenHue - 13}, 33%, 32%)`, roughness: .79 });
  const petalMaterial = petalSurface(specimen, textures.petal);
  const leafMaterial = new THREE.MeshPhysicalMaterial({
    vertexColors: true, side: THREE.DoubleSide, roughness: 0.56,
    clearcoat: 0.3, clearcoatRoughness: 0.6, bumpMap: textures.leaf, bumpScale: 0.045,
  });
  // The sepal or foliage material may not have any mesh in some recipes.
  materials.add(green).add(petalMaterial).add(leafMaterial);
  const top = new THREE.Vector3(...entry.position);
  const bottom = new THREE.Vector3(entry.turn * 0.6, -3.2 + random() * 0.25, -entry.turn * 0.3);
  const knot = new THREE.Vector3(entry.turn * 0.2, -1.9, 0);
  const middle = new THREE.Vector3(top.x * 0.65 + specimen.bend, (top.y - 1.9) / 2, top.z * 0.65);
  // Give each stem its own position inside the binding instead of sending them
  // through the same point. Keep the ordering from the binding to the cut ends.
  const angle = index * Math.PI * (3 - Math.sqrt(5));
  const radius = 0.105 * Math.sqrt((index + 0.5) / bouquet.flowers.length);
  knot.x = radius * Math.cos(angle);
  knot.z = radius * Math.sin(angle);
  bottom.x = knot.x * 1.32;
  bottom.z = knot.z * 1.32;
  middle.x = top.x * 0.57 + specimen.bend * 0.55;
  middle.z = top.z * 0.6 + knot.z;
  const curve = routedStem(bottom, knot, middle, top, envelopes.filter((_, other) => other !== index), earlierStems);
  earlierStems.push(curve.getPoints(40).filter(point => point.y > -1.65));
  const stem = new THREE.Mesh(new THREE.TubeGeometry(curve, 40, 0.024, 7, false), green);
  group.add(stem);
  const bendX = -.37 * top.x + .10 * Math.sin(specimen.rotation);
  const bendZ = -.26 * top.z + .12;
  const drop = -.36 - .13 * Math.abs(top.x);
  const flexStem = () => {
    const rest = stem.geometry.getAttribute('position'), folded = rest.clone();
    for (let i = 0; i < folded.count; i++) {
      const y = rest.getY(i), weight = flexAt(y, top.y);
      folded.setXYZ(i, rest.getX(i) + bendX * weight, y + drop * weight, rest.getZ(i) + bendZ * weight);
    }
    stem.geometry.morphAttributes.position = [folded];
    stem.updateMorphTargets();
  };
  flexStem();

  const leafColors = { base: `hsl(${specimen.greenHue - 5}, 32%, 31%)`, tip: `hsl(${specimen.greenHue - 18}, 34%, 51%)`, root: '#264435' };
  const leafWidths = { slender: 0.12, broad: 0.47, serrated: 0.31, strap: 0.22 };
  const leafWidth = leafWidths[recipe.leaf];
  const leafLength = recipe.leaf === 'strap' ? 1.9 : 1.15;
  const leafCount = entry.leafCount ?? (recipe.leaf === 'strap' ? 2 : 3);
  for (let i = 0; i < leafCount; i++) {
    const pivot = new THREE.Group();
    const stemPosition = (recipe.leaf === 'strap' ? 0.43 : 0.46) + i * 0.14;
    pivot.position.copy(curve.getPoint(stemPosition));
    pivot.userData.stemPosition = stemPosition;
    pivot.rotation.y = i % 2 ? 1.45 : -1.45;
    pivot.rotation.x = 0.8;
    const leaf = new THREE.Mesh(botanicalGeometry(leafLength + random() * 0.3, leafWidth * (0.9 + random() * 0.2), leafColors, random, specimen, true), leafMaterial);
    leaf.rotation.x = recipe.leaf === 'strap' ? -1.4 : -0.12 - random() * 0.15;
    pivot.add(leaf);
    pivot.scale.setScalar(0.55);
    group.add(pivot);
    leaves.push(pivot);
  }

  const head = new THREE.Group();
  head.position.copy(top);
  head.rotation.set(recipe.tilt + (entry.tiltOffset ?? 0), entry.turn, -entry.turn * 0.5);
  group.add(head);
  const custom = ExtraBlooms.has(specimen.key);
  const dedicated = custom || ['rose', 'tulip', 'dahlia'].includes(specimen.key);
  if (dedicated) {
    const cut = bouquet.version === 3;
    const panels = (custom ? ExtraBlooms.build : PetalMeshes.build)(specimen, head, petalMaterial, cut);
    petals.push(...finishPetals(specimen, panels, head, cut));
  }
  const blades = dedicated ? null : bladeBatches(specimen.key, head, petalMaterial, specimen.timestamp);
  for (let layer = 0; blades && layer < specimen.layers; layer++) {
    const count = Math.max(3, specimen.count);
    const size = 1 - layer * recipe.shrink;
    for (let i = 0; i < count; i++) {
      const stagger = layer * Math.PI / count;
      const angle = i / count * Math.PI * 2 + specimen.rotation + stagger;
      const geometry = botanicalGeometry(specimen.length * size * (0.94 + random() * 0.12), specimen.width * size * (specimen.key === 'lily' && layer === 0 ? .76 : 1), palette, random, specimen);
      const offset = random() * .04, openAngle = recipe.open - layer * .035 + (random() - .5) * .05;
      blades.add(geometry, i, layer, angle, layer * recipe.lift + .009 * Math.sin(angle),
        Math.max(.025, recipe.disk * .8 - layer * .025), openAngle, offset);
    }
  }
  if (blades) petals.push(...blades.finish());
  const sepalCount = recipe.sepalCount ?? (['tulip', 'lily', 'poppy'].includes(specimen.key) ? 0 : 5);
  for (let i = 0; i < sepalCount; i++) {
    const ring = new THREE.Group();
    ring.rotation.y = i * Math.PI * 2 / sepalCount;
    ring.position.y = -0.07;
    const sepal = new THREE.Mesh(botanicalGeometry(0.40, 0.07, leafColors, random, specimen, true), leafMaterial);
    ring.add(sepal);
    head.add(ring);
    sepals.push(sepal);
  }

  const center = new THREE.Group();
  head.add(center);
  const diskRadius = recipe.disk;
  const dark = recipe.center === 'seeds' || recipe.center === 'poppy';
  const disk = new THREE.Mesh(new THREE.SphereGeometry(diskRadius, 32, 20), new THREE.MeshStandardMaterial({ color: dark ? '#3c281c' : '#a47720', roughness: 0.9 }));
  disk.scale.set(1, 0.50, 1);
  disk.position.y = 0.1;
  if (['gold', 'seeds'].includes(recipe.center)) center.add(disk);
  else { disk.geometry.dispose(); disk.material.dispose(); }
  // Golden-angle phyllotaxis gives daisies and sunflowers real disk structure.
  const pollenCount = recipe.center === 'seeds' ? 800 : 260;
  const pollen = new THREE.InstancedMesh(new THREE.SphereGeometry(1, 6, 5), new THREE.MeshStandardMaterial({ roughness: 0.8 }), pollenCount);
  const dummy = new THREE.Object3D();
  const color = new THREE.Color();
  const honey = new THREE.Color('#c7913f');
  for (let i = 0; i < pollenCount; i++) {
    const radius = diskRadius * 0.97 * Math.sqrt(i / pollenCount);
    const a = i * 2.3999632297;
    const height = Math.sqrt(Math.max(0, 1 - (radius / diskRadius) ** 2));
    dummy.position.set(Math.cos(a) * radius, 0.1 + height * diskRadius * 0.5, Math.sin(a) * radius);
    const size = diskRadius / Math.sqrt(pollenCount) * (0.70 + random() * 0.12);
    dummy.scale.set(size, size * 1.5, size);
    dummy.updateMatrix();
    pollen.setMatrixAt(i, dummy.matrix);
    color.setHSL(0.10 + random() * 0.035, dark ? 0.40 : 0.85, dark ? 0.12 + random() * 0.13 : 0.4 + random() * 0.22);
    if (dark) color.lerp(honey, .62 * ease((radius / diskRadius - .76) / .18));
    pollen.setColorAt(i, color);
  }
  if (['gold', 'seeds'].includes(recipe.center)) center.add(pollen);
  else { pollen.dispose(); pollen.geometry.dispose(); pollen.material.dispose(); }
  if (recipe.center === 'poppy') {
    const capsule = new THREE.Mesh(new THREE.SphereGeometry(0.14, 16, 12), new THREE.MeshStandardMaterial({ color: '#7b9567', roughness: 0.9 }));
    capsule.position.y = 0.17;
    capsule.scale.y = 1.2;
    center.add(capsule);
    const capMaterial = new THREE.MeshStandardMaterial({ color: '#536b43', roughness: 0.95 });
    for (let i = 0; i < 9; i++) {
      const ridge = new THREE.Mesh(new THREE.CylinderGeometry(0.009, 0.009, 0.20, 5), capMaterial);
      ridge.position.y = 0.33;
      ridge.rotation.set(Math.PI / 2, 0, i * Math.PI / 9);
      center.add(ridge);
    }
  }
  if (recipe.center === 'stamens' || recipe.center === 'poppy') {
    const stamenCount = recipe.center === 'poppy' ? 32 : 6;
    const filamentMaterial = new THREE.MeshStandardMaterial({ color: recipe.center === 'poppy' ? '#443136' : '#bed27e', roughness: 0.7 });
    const antherMaterial = new THREE.MeshStandardMaterial({ color: recipe.center === 'poppy' ? '#302532' : '#b77d20', roughness: 0.85 });
    const antherGeometry = new THREE.SphereGeometry(1, 10, 8);
    for (let i = 0; i < stamenCount; i++) {
      const a = i / stamenCount * Math.PI * 2;
      const radius = recipe.center === 'poppy' ? 0.31 : 0.2;
      const height = recipe.center === 'poppy' ? 0.22 + random() * 0.08 : 0.55 + random() * 0.2;
      const from = new THREE.Vector3(Math.cos(a) * radius * 0.5, 0.05, Math.sin(a) * radius * 0.5);
      const to = new THREE.Vector3(Math.cos(a) * radius, height, Math.sin(a) * radius);
      const filament = new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.012, from.distanceTo(to), 5), filamentMaterial);
      filament.position.copy(from).lerp(to, 0.5);
      filament.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), to.clone().sub(from).normalize());
      center.add(filament);
      const anther = new THREE.Mesh(antherGeometry, antherMaterial);
      anther.position.copy(to);
      anther.scale.set(0.035, 0.025, recipe.center === 'poppy' ? 0.035 : 0.09);
      anther.rotation.y = a;
      center.add(anther);
    }
  }
  if (recipe.center === 'stamens') {
    const style = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.015, 0.83, 7), new THREE.MeshStandardMaterial({ color: '#b9cf79', roughness: 0.8 }));
    style.position.y = 0.44;
    center.add(style);
    const stigma = new THREE.Mesh(new THREE.SphereGeometry(0.04, 8, 6), new THREE.MeshStandardMaterial({ color: '#d7db95', roughness: 0.8 }));
    stigma.position.y = 0.87;
    center.add(stigma);
  }
  center.visible = recipe.center !== 'hidden' && specimen.key !== 'dahlia';
  // Keep insertion rhythms and the exact rest sockets out of the frame loop.
  const guard = leadingGuard(specimen.key, specimen.rotation, specimen.count);
  petals.forEach((p, i) => {
    if (i === guard) { p.offset = 0; p.pace = 1.88; return; }
    p.pace = petalPace(specimen.key, p.layer, i, specimen.rotation);
    // Cluster branches and the florets at their tips share the initial lift.
    p.offset = specimen.key === 'hydrangea' || specimen.key === 'billyButton' ? .035
      : p.offset + petalWave(specimen.key, p.layer, i, specimen.rotation);
  });
  const backing = specimen.key === 'dahlia' ? head.children[0] : undefined;
  const cutDahlia = !!backing && bouquet.version === 3;
  const nod = bouquet.version === 2 && specimen.key === 'ranunculus' ? .29 * Math.sin(specimen.rotation * 1.6) : 0;
  const peak = hingePeak(specimen.key);
  const diskHead = specimen.key === 'sunflower' || specimen.key === 'daisy';
  const neck = (specimen.key === 'lily' || specimen.key === 'poppy' ? .29 : .16) * Math.cos(specimen.rotation + index);
  const focal = bouquet.flowers[0].position;
  const distance = Math.hypot(top.x - focal[0], top.y - focal[1], top.z - focal[2]);
  const startBeat = bouquet.version === 2 ? bloomStart(index, entry.delay) : index === 0 ? .075
    : .22 + Math.min(.20, distance * .055) + (index > 3 ? .091 : 0) + entry.delay * .42;
  const endBeat = bouquet.version === 2 ? 1 : index === 0 ? .69 : index > 3 ? 1 : .88 + entry.delay;
  return { head, center, petals, leaves, sepals, backing, cutDahlia, nod, peak, neck, diskHead, entry, curve, stem, flexStem, top, bendX, bendZ, drop, startBeat, endBeat };
}

// Lay out foliage once at full bloom, not every frame. The thin leaf surfaces
// may overlap in projection, but don't send them into another plant's volume.
function settleFoliage(bouquet: BuiltBouquet) {
  const { plant, blooms } = bouquet;
  pose(bouquet, 1);
  plant.updateMatrixWorld(true);
  const headBounds = blooms.map(({ head }) => new THREE.Box3().setFromObject(head).expandByScalar(0.018));
  const stemPoints = blooms.map(({ curve }) => curve.getPoints(32));
  const placed: THREE.Box3[] = [];
  const bounds = new THREE.Box3();
  blooms.forEach(({ leaves, curve, entry }, index) => {
    leaves.forEach(leaf => {
      const initialYaw = leaf.rotation.y;
      const initialT = leaf.userData.stemPosition;
      const scale = entry.leafScale ?? 0.55;
      const sign = Math.sign(entry.position[0]) || Math.sign(initialYaw);
      for (const size of [1, 0.8, 0.63]) {
        leaf.scale.setScalar(scale * size);
        for (const t of [initialT, initialT - 0.08, initialT + 0.045, initialT - 0.15]) {
          leaf.position.copy(curve.getPoint(t));
          for (const angle of [initialYaw, sign * 1.29, sign * 2.12, sign * 0.54]) {
            leaf.rotation.y = angle;
            leaf.updateWorldMatrix(false, true);
            bounds.setFromObject(leaf).expandByScalar(0.009);
            if (bounds.min.y < -1.72 || headBounds.some(box => box.intersectsBox(bounds)) || placed.some(box => box.intersectsBox(bounds))) continue;
            if (stemPoints.some((points, other) => other !== index && points.some(point => bounds.containsPoint(point)))) continue;
            leaf.userData.clearanceScale = size;
            leaf.userData.rest = leaf.position.clone();
            leaf.userData.flex = flexAt(leaf.position.y, entry.position[1]);
            placed.push(bounds.clone());
            return;
          }
        }
      }
      leaf.visible = false;
    });
  });
}

export function pose({ blooms, filler }: BuiltBouquet, p: number) {
  filler?.pose(p);
  blooms.forEach(({ head, center, petals, leaves, sepals, backing, cutDahlia, nod, peak, neck, diskHead, entry, stem, top, bendX, bendZ, drop, startBeat, endBeat }) => {
    const local = clamp((p - startBeat) / (endBeat - startBeat));
    const tension = stemTension(local);
    stem.morphTargetInfluences![0] = tension;
    head.position.set(top.x + bendX * tension, top.y + drop * tension, top.z + bendZ * tension);
    // The neck presents the opening flower, then takes its weight again. A
    // second, quieter release happens after the stem is already in place.
    const lift = ease(local / .44) - ease((local - .52) / .48);
    head.rotation.x = entry.specimen.recipe.tilt + (entry.tiltOffset ?? 0) + nod - .53 * tension + .14 * lift;
    head.rotation.y = entry.turn + nod * .82 + neck * (1 - ease((local - .12) / .78));
    head.rotation.z = -.5 * entry.turn - .13 * bendX * tension + neck * .72 * lift;
    const unfurl = ease((local - .03) / .9);
    head.scale.setScalar(entry.scale); // the petal surface opens, not the silhouette's scale
    if (backing) {
      const girth = cutDahlia ? .09 + .15 * unfurl : .88 * (.20 + .80 * unfurl);
      backing.scale.set(girth, cutDahlia ? .082 : .39, girth);
    }
    petals.forEach(petal => {
      const opening = clamp(petalOpening(local, petal.offset) * (petal.pace ?? 1));
      const weights = petal.mesh.morphTargetInfluences!;
      if (weights.length === 2) foldWeights(weights, opening, peak);
      else weights[0] = 1 - ease(opening);
    });
    leaves.forEach((leaf, i) => {
      if (!leaf.visible) return;
      const rest = leaf.userData.rest as THREE.Vector3 | undefined;
      if (rest) {
        const w = tension * leaf.userData.flex;
        leaf.position.set(rest.x + w * bendX, rest.y + w * drop, rest.z + w * bendZ);
      }
      leaf.rotation.x = .8 - .58 * (1 - ease((local - i * .045) / .53));
      leaf.scale.setScalar((entry.leafScale ?? .55) * (leaf.userData.clearanceScale ?? 1) * (.73 + .27 * unfurl));
    });
    sepals.forEach((sepal, i) => { sepal.rotation.x = -1.3 + 1.5 * ease((local - i * .013) / .38); });
    // The throat exists inside the bud; it does not pop into a vacant disk.
    const throat = ease((local - .13) / .69);
    const coreWidth = diskHead ? .78 + .22 * throat : .31 + .69 * throat;
    center.scale.set(coreWidth, .52 + .48 * throat, coreWidth);
  });
  // The binding and cut ends stay still throughout.
}

// A mature ray head is a disk; its bud is a much taller volume, on a bent
// neck. Check the dressed curves against other *moving* heads once at setup.
// Sample at most 96 vertices per petal batch, at four beats, in head space.
// The padded ellipses are routing guides, not per-frame triangle collisions.
function clearOpeningStems(bouquet: BuiltBouquet, envelopes: HeadEnvelope[]) {
  const { blooms } = bouquet, point = new THREE.Vector3(), probe = new THREE.Vector3();
  const phases = [0, .42, .58, .74].map(p => {
    pose(bouquet, p);
    return blooms.map(b => {
      const bounds = new THREE.Box3();
      for (const { mesh } of b.petals) {
        const count = mesh.geometry.attributes.position.count, step = Math.max(1, Math.ceil(count / 96));
        for (let i = 0; i < count; i += step) bounds.expandByPoint(mesh.getVertexPosition(i, point));
      }
      const center = bounds.getCenter(new THREE.Vector3());
      const size = bounds.getSize(new THREE.Vector3()).multiplyScalar(.5 * b.entry.scale);
      const q = b.head.quaternion;
      return { center: center.multiplyScalar(b.entry.scale).applyQuaternion(q).add(b.head.position),
        axis: new THREE.Vector3(0, 1, 0).applyQuaternion(q), radial: (Math.max(size.x, size.z) + .055) ** 2,
        axial: (size.y + .065) ** 2, tension: b.stem.morphTargetInfluences![0] };
    });
  });
  blooms.forEach((b, i) => {
    const cost = (points: THREE.Vector3[]) => {
      let score = 0;
      for (const frame of phases) for (const point of points) {
        const w = frame[i].tension * flexAt(point.y, b.top.y);
        const x = point.x + w * b.bendX, y = point.y + w * b.drop, z = point.z + w * b.bendZ;
        for (let j = 0; j < frame.length; j++) if (i !== j) {
          const h = frame[j]; probe.set(x - h.center.x, y - h.center.y, z - h.center.z);
          const a = probe.dot(h.axis) ** 2, d = (probe.lengthSq() - a) / h.radial + a / h.axial;
          if (d < 1) score += 2 + 14 * (1 - d);
        }
      }
      return score;
    };
    if (!cost(b.curve.getPoints(40))) return;
    const [bottom, knot, middle] = b.curve.points;
    b.curve = routedStem(bottom, knot, middle, b.top, envelopes.filter((_, j) => j !== i),
      blooms.filter(other => other !== b).map(other => other.curve.getPoints(40).filter(p => p.y > -1.65)), cost);
    b.stem.geometry.dispose(); b.stem.geometry = new THREE.TubeGeometry(b.curve, 40, .024, 7, false);
    b.flexStem();
  });
}

export function disposeBouquet({ plant, materials }: BuiltBouquet): void {
  const geometries = new Set<THREE.BufferGeometry>();
  plant.traverse(object => {
    if (object instanceof THREE.InstancedMesh) object.dispose();
    if (!(object instanceof THREE.Mesh)) return;
    geometries.add(object.geometry);
    if (Array.isArray(object.material)) object.material.forEach(material => materials.add(material));
    else materials.add(object.material);
  });
  plant.removeFromParent();
  geometries.forEach(geometry => geometry.dispose());
  materials.forEach(material => material.dispose());
}

export function buildBouquet(plan: BouquetPlan, textures: Textures): BuiltBouquet {
  const plant = new THREE.Group();
  const ribbon = new THREE.Group();
  const materials = new Set<THREE.Material>();
  const bouquet: BuiltBouquet = { plant, ribbon, plan, materials, blooms: [], framePoints: [], focus: new THREE.Vector3(0, 1.08, 0) };
  try {
    const envelopes = plan.flowers.map(entry => {
      const envelope = Botany.headEnvelope(entry);
      return { ...envelope, center: new THREE.Vector3(...envelope.center), axis: new THREE.Vector3(...envelope.axis) };
    });
    const earlierStems: THREE.Vector3[][] = [];
    bouquet.blooms = plan.flowers.map((entry, index) => buildBloom(entry, index, plan, envelopes, earlierStems, plant, materials, textures));
    // A real binding point makes the stems read as a hand-tied bouquet.
    ribbon.position.set(0, -1.9, 0);
    plant.add(ribbon);
    tieBouquet(ribbon, plan.tie.style, plan.tie.color);
    bouquet.filler = buildFiller(plan);
    plant.add(bouquet.filler.group);
    if (plan.version === 3) clearOpeningStems(bouquet, envelopes);
    settleFoliage(bouquet);
    if (plan.version === 3) bouquet.focus.copy(envelopes[0].center).multiplyScalar(.82);
    // The tips travel with a flexing neck: morph bounds in a rest-world
    // transform alone miss that travel. Cache swept boxes for camera/PNG
    // once, not a scan of animated vertices while the recipient turns it.
    const pieces = [ribbon, ...bouquet.filler.group.children,
      ...bouquet.blooms.flatMap(b => [b.head, b.stem, ...b.leaves.filter(l => l.visible)])];
    const swept = pieces.map(() => new THREE.Box3());
    const sample = new THREE.Box3();
    for (const beat of [0, .40, .62, 1]) {
      pose(bouquet, beat); plant.updateMatrixWorld(true);
      pieces.forEach((piece, i) => swept[i].union(sample.setFromObject(piece)));
    }
    for (const { min, max } of swept) {
      for (const x of [min.x, max.x]) for (const y of [min.y, max.y]) for (const z of [min.z, max.z])
        bouquet.framePoints.push(new THREE.Vector3(x, y, z));
    }
    return bouquet;
  } catch (error) {
    disposeBouquet(bouquet);
    throw error;
  }
}

function createRenderer(canvas: HTMLCanvasElement): THREE.WebGLRenderer {
  // Check WebGL 2 support before Three attaches any canvas listeners.
  const attributes: WebGLContextAttributes = { alpha: true, antialias: true, depth: true, stencil: true };
  const context = canvas.getContext('webgl2', attributes);
  if (!context) throw new Error(WEBGL_ERROR);
  const renderer = new THREE.WebGLRenderer({ canvas, context });
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;
  return renderer;
}

function createScene(): THREE.Scene {
  const scene = new THREE.Scene();
  scene.add(new THREE.HemisphereLight(0xfff2dc, 0xcfb6a0, 1.02));
  // A broad feeling of side light, with cream paper bounce in the folds. No
  // shadow-map passes or post-processing: this light also prints in the PNG.
  const sun = new THREE.DirectionalLight(0xffe7c7, 2.70);
  sun.position.set(-5, 4, 3);
  scene.add(sun);
  const fill = new THREE.DirectionalLight(0xfff0dc, 0.64);
  fill.position.set(5, 2, 2);
  scene.add(fill);
  const backlight = new THREE.DirectionalLight(0xffdda8, 1.25);
  backlight.position.set(1, 4, -4);
  scene.add(backlight);
  return scene;
}

/** An imperative scene owned by one mounted canvas. React owns the postcard UI. */
export function createGarden(canvas: HTMLCanvasElement, options: GardenEngineOptions): GardenEngine {
  const { ownerDocument: document, parentElement: stage } = canvas;
  const window = document.defaultView;
  if (!window || !stage) {
    options.onError?.(RENDER_ERROR);
    throw new Error('The bouquet needs a canvas inside a stage.');
  }
  const view = window;
  let renderer: THREE.WebGLRenderer;
  try {
    renderer = createRenderer(canvas);
  } catch (error) {
    options.onError?.(WEBGL_ERROR);
    throw error;
  }

  const scene = createScene();
  const camera = new THREE.PerspectiveCamera(34, 1, 0.1, 60);
  const rotation = new BouquetRotation();
  const closeView = new CloseView();
  const canopy = new THREE.Vector3(), projected = new THREE.Vector3();
  const eyeFromPlant = new THREE.Matrix4(), plantRotation = new THREE.Matrix4();
  let lastFit: { plant: THREE.Group; aspect: number; pitch: number; yaw: number; extra: number } | undefined;
  const gl = renderer.getContext();
  const cleanups: (() => void)[] = [];
  let petalTexture: Textures['petal'] | undefined;
  let leafTexture: THREE.CanvasTexture | undefined;
  let current: BuiltBouquet | null = null;
  let frame: number | null = null;
  let drag: { id: number; pointerType: string; sensitivity: number } | null = null;
  let phase: 'ready' | 'blooming' | 'mature' = 'ready';
  let progress = 0;
  let start: number | null = null;
  let width = 0;
  let height = 0;
  let pixelRatio = 0;
  let status: string | undefined;
  let reducedMotion = false;
  let contextLost = false;
  let failed = false;
  let disposed = false;

  function announce(next: string): void {
    if (disposed || next === status) return;
    status = next;
    options.onStatus?.(next);
  }

  function announceProgress(): void {
    announce(phase === 'ready' ? 'Ready to bloom' : progress < 0.22 ? 'Buds loosening'
      : progress < 0.45 ? 'Stems unfolding' : progress < 1 ? 'Opening up' : 'In full bloom');
  }

  function cancelFrame(): void {
    if (frame !== null) view.cancelAnimationFrame(frame);
    frame = null;
  }

  function eventTime(event: Event): number {
    const stamp = event.timeStamp;
    if (stamp > 0) {
      // Older Safari event timestamps may be epoch-based rather than relative to navigation.
      const time = stamp > 1e12 ? stamp - view.performance.timeOrigin : stamp;
      if (Number.isFinite(time) && time >= 0) return time;
    }
    return view.performance.now();
  }

  function endDrag(time: number, cancelled: boolean): void {
    if (!drag) return;
    const { id } = drag;
    drag = null;
    rotation.release(time, cancelled);
    canvas.classList.remove('is-dragging');
    if (canvas.hasPointerCapture(id)) canvas.releasePointerCapture(id);
  }

  function available(): boolean {
    return !disposed && !failed && !contextLost && !gl.isContextLost();
  }

  function failRender(): void {
    if (disposed || failed) return;
    failed = true;
    cancelFrame();
    endDrag(view.performance.now(), true);
    rotation.stop();
    announce('Taking a break');
    options.onError?.(RENDER_ERROR);
  }

  function frameCamera(amount: number) {
    // With pitch and yaw unconstrained, track the actual rotated canopy, not
    // a fixed world-Y offset that would lose the heads on an upside-down turn.
    if (current) canopy.copy(current.focus).applyEuler(current.plant.rotation);
    const x = canopy.x * amount, y = .05 + canopy.y * amount, z = canopy.z * amount;
    const tan = Math.tan(THREE.MathUtils.degToRad(17));
    const detailWidth = current?.plan.version === 3 ? 1.66 : .36;
    const distance = Math.max(12.3 - 3.65 * amount, (5.62 - detailWidth * amount) / (2 * tan * camera.aspect));
    camera.position.set(x, y + 2.10, z + distance);
    camera.lookAt(x, y, z);
    if (!current?.framePoints.length || amount === 1) return;
    const { plant, framePoints } = current;
    const { x: pitch, y: yaw } = plant.rotation;
    if (!lastFit || lastFit.plant !== plant || lastFit.aspect !== camera.aspect || lastFit.pitch !== pitch || lastFit.yaw !== yaw) {
      // Test the four frustum planes at full fit, independently of zoom. The
      // same cached correction is used for the live view and rotated export.
      const full = Math.max(12.3, 5.62 / (2 * tan * camera.aspect));
      const angle = Math.atan2(2.10, full);
      eyeFromPlant.makeRotationX(angle).multiply(plantRotation.makeRotationFromEuler(plant.rotation));
      let extra = 0;
      for (const point of framePoints) {
        projected.copy(point).applyMatrix4(eyeFromPlant);
        const depth = projected.z + .05 * Math.sin(angle) - Math.hypot(full, 2.10);
        extra = Math.max(extra, depth + Math.abs(projected.x) / (.96 * tan * camera.aspect),
          depth + Math.abs(projected.y - .05 * Math.cos(angle)) / (.96 * tan));
      }
      lastFit = { plant, aspect: camera.aspect, pitch, yaw, extra };
    }
    camera.translateZ(lastFit.extra * (1 - amount));
  }

  function changeView(close: boolean, instant = false) {
    if (closeView.set(close, view.performance.now(), instant || reducedMotion)) options.onCloseViewChange?.(close);
  }

  function draw(): void {
    if (!current || !width || !height || !available() || document.hidden) return;
    current.plant.rotation.set(rotation.pitch, rotation.yaw, 0);
    frameCamera(closeView.amount);
    renderer.render(scene, camera);
  }

  function paint(): void {
    try { draw(); }
    catch { if (!gl.isContextLost()) failRender(); }
  }

  function setProgress(next: number): void {
    progress = next;
    if (next === 1) {
      phase = 'mature';
      start = null;
    }
    if (current) pose(current, next);
    options.onBloomProgress?.(next);
  }

  function tick(now: number): void {
    frame = null;
    if (!available() || document.hidden || !current) return;
    if (phase === 'blooming') {
      start ??= now - progress * DURATION;
      setProgress(Math.max(progress, clamp((now - start) / DURATION)));
      announceProgress();
    }
    rotation.step(now);
    closeView.step(now);
    paint(); // The last physics step can move the pose while returning false.
    wake();
  }

  function wake(): void {
    if (frame === null && current && (phase === 'blooming' || rotation.moving || closeView.moving)
      && width > 0 && height > 0 && available() && !document.hidden) frame = view.requestAnimationFrame(tick);
  }

  function resize(force = false): void {
    if (!available()) return;
    try {
      const rect = stage!.getBoundingClientRect();
      const ratio = Math.min(view.devicePixelRatio || 1, 2);
      if (rect.width <= 0 || rect.height <= 0) {
        options.onBloomPause?.();
        width = height = 0;
        start = null;
        cancelFrame();
        return;
      }
      if (!force && width === rect.width && height === rect.height && ratio === pixelRatio) return;
      width = rect.width;
      height = rect.height;
      pixelRatio = ratio;
      renderer.setDrawingBufferSize(width, height, pixelRatio);
      camera.aspect = width / height;
      camera.updateProjectionMatrix();
    } catch {
      if (!gl.isContextLost()) failRender();
      return;
    }
    paint();
    wake();
  }

  // A pinch may begin on the canvas and land its second finger on the paper.
  function yieldToPinch(event: PointerEvent): void {
    if (event.pointerType === 'touch' && drag?.pointerType === 'touch' && drag.id !== event.pointerId) {
      endDrag(eventTime(event), true);
    }
  }

  function onPointerDown(event: PointerEvent): void {
    if (!current || !available() || drag || event.button !== 0 || (event.pointerType === 'touch' && !event.isPrimary)) return;
    try { canvas.setPointerCapture(event.pointerId); }
    catch { return; } // The pointer may already have been cancelled by the browser.
    drag = {
      id: event.pointerId, pointerType: event.pointerType,
      sensitivity: Math.PI * 2 / Math.max(240, Math.min(canvas.clientWidth, canvas.clientHeight)),
    };
    rotation.grab(event.clientX, event.clientY, eventTime(event));
    canvas.classList.add('is-dragging');
    if (phase !== 'blooming' && !closeView.moving) cancelFrame();
  }

  function onPointerMove(event: PointerEvent): void {
    if (drag?.id !== event.pointerId || !available()) return;
    const sensitivity = drag.sensitivity;
    for (const sample of event.getCoalescedEvents?.() ?? []) {
      rotation.move(sample.clientX, sample.clientY, eventTime(sample), sensitivity);
    }
    rotation.move(event.clientX, event.clientY, eventTime(event), sensitivity);
    paint();
    wake();
  }

  function onPointerEnd(event: PointerEvent): void {
    if (drag?.id !== event.pointerId) return;
    endDrag(eventTime(event), event.type !== 'pointerup');
    wake();
  }

  function resetView({ instant = false } = {}): void {
    if (!current || !available()) return;
    endDrag(view.performance.now(), true);
    rotation.reset(instant);
    changeView(false, instant);
    paint();
    wake();
  }

  function onKeyDown(event: KeyboardEvent): void {
    if (!current || !available() || event.altKey || event.ctrlKey || event.metaKey || event.isComposing) return;
    const step = 0.15;
    let yawDelta = 0, pitchDelta = 0;
    switch (event.key) {
      case 'ArrowLeft': yawDelta = -step; break;
      case 'ArrowRight': yawDelta = step; break;
      case 'ArrowUp': pitchDelta = -step; break;
      case 'ArrowDown': pitchDelta = step; break;
      case 'Home': event.preventDefault(); resetView({ instant: true }); return;
      default: return;
    }
    event.preventDefault();
    endDrag(eventTime(event), true);
    rotation.nudge(yawDelta, pitchDelta);
    paint();
  }

  function onVisibilityChange(): void {
    if (document.hidden) {
      options.onBloomPause?.();
      cancelFrame();
      start = null;
      endDrag(view.performance.now(), true);
      rotation.stop();
    } else {
      resize();
      paint();
      wake();
    }
  }

  function onContextLost(event: Event): void {
    event.preventDefault(); // Signal that Three may restore the context.
    if (disposed || contextLost) return;
    contextLost = true;
    cancelFrame();
    start = null;
    endDrag(view.performance.now(), true);
    rotation.stop();
    // React dismisses the cover on loss; a previously sealed bouquet cannot be opened again.
    if (current && phase === 'ready') setProgress(1);
    options.onContextChange?.(true);
    options.onError?.(CONTEXT_ERROR);
    announce('Taking a break');
  }

  function onContextRestored(): void {
    if (disposed || !contextLost) return;
    // Three's earlier listener has rebuilt its GL caches. Reuse the original
    // geometry and textures, with the same bloom progress and presentation angle.
    contextLost = false;
    failed = false;
    changeView(false, true);
    resize(true);
    options.onContextChange?.(false);
    if (!failed) {
      options.onError?.(null);
      if (current) announceProgress();
    }
  }

  function dispose(): void {
    if (disposed) return;
    disposed = true;
    cancelFrame();
    endDrag(view.performance.now(), true);
    rotation.stop();
    for (const cleanup of cleanups) cleanup();
    cleanups.length = 0;
    if (current) disposeBouquet(current);
    current = null;
    lastFit = undefined;
    petalTexture?.dispose();
    leafTexture?.dispose();
    petalTexture = undefined;
    leafTexture = undefined;
    scene.clear();
    // Do not force context loss: StrictMode/HMR can reuse the same canvas before
    // the loss event arrives, and the next renderer needs that context.
    renderer.dispose();
    for (const key of ['species', 'flowerCount', 'seed', 'version', 'engine']) delete canvas.dataset[key];
  }

  try {
    const anisotropy = Math.min(4, renderer.capabilities.getMaxAnisotropy());
    petalTexture = petalFields(anisotropy);
    leafTexture = leafVeins(document, anisotropy);
    const observer = new ResizeObserver(() => resize());
    cleanups.push(() => observer.disconnect());
    observer.observe(stage);
    const canvasListeners = {
      pointerdown: onPointerDown, pointermove: onPointerMove, pointerup: onPointerEnd,
      pointercancel: onPointerEnd, lostpointercapture: onPointerEnd, keydown: onKeyDown,
      webglcontextlost: onContextLost, webglcontextrestored: onContextRestored,
    } as const;
    for (const name of Object.keys(canvasListeners) as (keyof typeof canvasListeners)[]) {
      const listener = canvasListeners[name] as EventListener;
      canvas.addEventListener(name, listener);
      cleanups.push(() => canvas.removeEventListener(name, listener));
    }
    document.addEventListener('pointerdown', yieldToPinch, { capture: true, passive: true });
    cleanups.push(() => document.removeEventListener('pointerdown', yieldToPinch, true));
    document.addEventListener('visibilitychange', onVisibilityChange);
    cleanups.push(() => document.removeEventListener('visibilitychange', onVisibilityChange));
    const onWindowResize = () => resize(); // Also update DPR when moving between displays.
    view.addEventListener('resize', onWindowResize);
    cleanups.push(() => view.removeEventListener('resize', onWindowResize));
    resize();
    if (failed) throw new Error(RENDER_ERROR);
  } catch (error) {
    failRender();
    dispose();
    throw error;
  }

  return {
    show(timestamp, version = 2) {
      if (disposed) throw new Error('The garden is no longer mounted.');
      try {
        if (!Number.isSafeInteger(timestamp) || timestamp < 0 || timestamp > 8.64e15) throw new RangeError('Invalid bouquet timestamp.');
        const plan: BouquetPlan = Botany.createBouquet(timestamp, version);
        const next = buildBouquet(plan, { petal: petalTexture!, leaf: leafTexture! });
        const flowerCount = plan.flowers.length;
        const kinds = plan.kinds.map(key => Botany.species[key].label.toLowerCase());
        cancelFrame();
        endDrag(view.performance.now(), true);
        rotation.reset(true);
        changeView(false, true);
        if (current) disposeBouquet(current);
        lastFit = undefined;
        current = next;
        scene.add(current.plant);
        start = null;
        phase = 'ready';
        setProgress(contextLost ? 1 : 0);
        canvas.dataset.species = plan.kinds.join(',');
        canvas.dataset.flowerCount = String(flowerCount);
        canvas.dataset.seed = String(plan.timestamp);
        canvas.dataset.version = String(plan.version);
        if (available()) {
          draw();
          announceProgress();
        }
        return { timestamp: plan.timestamp, name: plan.name, kinds, flowerCount };
      } catch (error) {
        failRender();
        throw error;
      }
    },
    bloom({ instant = false } = {}) {
      if (!current || !available()) return;
      phase = 'blooming';
      changeView(false, true);
      start = document.hidden || !width || !height ? null : view.performance.now();
      setProgress(instant || reducedMotion ? 1 : 0);
      if (document.hidden || !width || !height) options.onBloomPause?.();
      announceProgress();
      paint();
      if (progress === 1 && !rotation.moving && !closeView.moving) cancelFrame();
      wake();
    },
    resetView,
    setCloseView(close, { instant = false } = {}) {
      if (!current || !available()) return;
      changeView(close, instant);
      paint();
      wake();
    },
    setReducedMotion(reduced) {
      if (disposed || reducedMotion === reduced) return;
      reducedMotion = reduced;
      rotation.setReducedMotion(reduced);
      if (reduced) changeView(closeView.selected, true);
      if (reduced && phase === 'blooming') {
        setProgress(1);
        if (available()) announceProgress();
      }
      paint();
      if (phase !== 'blooming' && !rotation.moving && !closeView.moving) cancelFrame();
      wake();
    },
    async exportPng() {
      if (!current || !width || !height || !available()) throw new Error('The 3D preview is unavailable. Try saving when it returns.');
      const { name, timestamp } = current.plan;
      const image = document.createElement('canvas');
      image.width = 1600;
      image.height = 1700;
      const ctx = image.getContext('2d');
      if (!ctx) throw new Error('Couldn’t prepare the postcard image.');
      ctx.fillStyle = '#fff9f2'; ctx.fillRect(0, 0, image.width, image.height);
      const scale = Math.min(1440 / width, 1400 / height);
      const artWidth = Math.max(1, Math.round(width * scale));
      const artHeight = Math.max(1, Math.round(height * scale));
      const left = (1600 - artWidth) / 2;
      const top = 60 + (1400 - artHeight) / 2;
      setProgress(1);
      current.plant.rotation.set(rotation.pitch, rotation.yaw, 0);
      try {
        // Keep the on-screen camera framing, but render at keepsake resolution.
        // Copy synchronously after render; the live canvas need not preserve its buffer.
        frameCamera(0); // The keepsake always includes the tied cut ends.
        renderer.setDrawingBufferSize(artWidth, artHeight, 1);
        renderer.render(scene, camera);
        if (gl.isContextLost()) throw new Error(CONTEXT_ERROR);
        ctx.drawImage(canvas, left, top, artWidth, artHeight);
      } finally {
        if (!gl.isContextLost()) renderer.setDrawingBufferSize(width, height, pixelRatio);
        paint();
        if (available()) announceProgress();
        if (!rotation.moving && !closeView.moving) cancelFrame();
      }
      ctx.textAlign = 'center';
      ctx.fillStyle = '#573b3d'; ctx.font = '48px Georgia, serif';
      ctx.fillText(name, 800, 1485, 1440);
      ctx.fillStyle = '#765b5d'; ctx.font = '24px Georgia, serif';
      ctx.fillText(`${BRAND} · ${formatDate.format(timestamp)}`, 800, 1535);
      ctx.fillStyle = '#9a4d5c'; ctx.font = 'italic 30px Georgia, serif';
      ctx.fillText(GIFT_NOTE, 800, 1605);
      return new Promise<Blob>((resolve, reject) => {
        image.toBlob(blob => blob ? resolve(blob) : reject(new Error('PNG encoding failed.')), 'image/png');
      });
    },
    dispose,
  };
}
