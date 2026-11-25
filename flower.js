(() => {
  'use strict';

  const canvas = document.getElementById('flower');
  const stage = canvas.parentElement;
  const card = document.querySelector('.postcard');
  const status = document.getElementById('growth-status');
  const motion = window.matchMedia('(prefers-reduced-motion: reduce)');
  const message = document.getElementById('render-message');
  const introNote = document.getElementById('intro-note');
  const senderNote = introNote.textContent;
  const linkNotice = document.getElementById('link-notice');
  const shareButton = document.getElementById('share');
  const shareStatus = document.getElementById('share-status');
  const manualShare = document.getElementById('manual-share');
  const shareUrl = document.getElementById('share-url');
  const DURATION = 7800;
  const BRAND = 'Flowers for You';
  let renderer;

  try {
    if (!window.THREE) throw new Error('The 3D renderer could not be loaded.');
    renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, preserveDrawingBuffer: true });
  } catch (error) {
    message.hidden = false;
    message.textContent = 'This little garden needs WebGL. Try a browser with hardware acceleration enabled, then reload.';
    status.textContent = 'GARDEN AT REST';
    document.getElementById('interaction-hint').hidden = true;
    for (const id of ['grow', 'replay', 'save', 'share', 'reset-view']) document.getElementById(id).disabled = true;
    console.error(error);
    return;
  }

  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(34, 1, 0.1, 60);
  camera.position.set(0, 2.15, 12.8);
  camera.lookAt(0, 0.45, 0);
  scene.add(new THREE.HemisphereLight(0xfff8ed, 0x647451, 1.5));
  const sun = new THREE.DirectionalLight(0xffeee1, 2.3);
  sun.position.set(-4, 7, 5);
  scene.add(sun);
  const fill = new THREE.DirectionalLight(0xe4ecff, 0.75);
  fill.position.set(5, 2, 2);
  scene.add(fill);
  const backlight = new THREE.DirectionalLight(0xffddc0, 1.5);
  backlight.position.set(1, 4, -4);
  scene.add(backlight);

  let plant;
  let blooms = [];
  let ribbon;
  let specimen;
  let frame = null;
  let start = 0;
  let progress = 0;
  let yaw = -0.16;
  let targetYaw = -0.16;
  let pitch = 0;
  let targetPitch = 0;
  let drag = null;
  let lastFreshTimestamp = 0;
  let sharing = false;
  const clamp = value => Math.max(0, Math.min(1, value));
  const ease = value => { const t = clamp(value); return t * t * (3 - 2 * t); };

  // Fine, branching veins and longitudinal striations become a real bump map.
  function veinTexture(isLeaf) {
    const surface = document.createElement('canvas');
    surface.width = 256;
    surface.height = 512;
    const ctx = surface.getContext('2d');
    ctx.fillStyle = '#999';
    ctx.fillRect(0, 0, 256, 512);
    ctx.lineWidth = isLeaf ? 1.6 : 0.65;
    ctx.strokeStyle = isLeaf ? '#d6d6d6' : '#b8b8b8';
    for (let i = 0; i < (isLeaf ? 16 : 64); i++) {
      ctx.beginPath();
      if (isLeaf) {
        const y = i * 31;
        ctx.moveTo(128, y);
        ctx.quadraticCurveTo(i % 2 ? 190 : 65, y + 28, i % 2 ? 253 : 3, y + 105);
      } else {
        const x = i * 4;
        ctx.moveTo(128 + (x - 128) * 0.13, 0);
        ctx.bezierCurveTo(x, 180, x + Math.sin(i) * 8, 390, x, 512);
      }
      ctx.stroke();
    }
    if (isLeaf) {
      ctx.lineWidth = 3;
      ctx.beginPath(); ctx.moveTo(128, 0); ctx.lineTo(128, 512); ctx.stroke();
    }
    const texture = new THREE.CanvasTexture(surface);
    texture.anisotropy = Math.min(4, renderer.capabilities.getMaxAnisotropy());
    return texture;
  }

  const petalTexture = veinTexture(false);
  const leafTexture = veinTexture(true);

  // A petal is a cupped, gently ruffled surface, not a flat billboard.
  function botanicalGeometry(length, width, palette, random, specimen, isLeaf = false) {
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
    for (let j = 0; j <= along; j++) {
      const t = j / along;
      const profile = Math.pow(Math.max(0, Math.sin(Math.PI * t)), isLeaf ? (recipe.leaf === 'broad' ? 0.5 : 0.8) : recipe.shape);
      const serration = isLeaf && recipe.leaf === 'serrated' ? 1 - 0.12 * Math.abs(Math.sin(t * 55)) : 1;
      const silhouette = profile * serration;
      for (let i = 0; i <= across; i++) {
        const u = i / across;
        const s = u * 2 - 1;
        const ruffle = Math.sin(t * 23 + phase + s * 3) * (isLeaf ? 0.014 : recipe.ruffle) * Math.pow(Math.abs(s), 3) * t;
        const x = s * width * silhouette * (1 + asymmetry * s) + Math.sin(t * 4) * asymmetry * t;
        const cosmosNotch = !isLeaf && specimen.key === 'cosmos' ? (Math.exp(-(((s - 0.42) / 0.10) ** 2)) + Math.exp(-(((s + 0.42) / 0.10) ** 2))) * 0.07 * ease((t - 0.78) / 0.22) : 0;
        const z = length * t - cosmosNotch;
        const y = isLeaf
          ? 0.19 * Math.sin(Math.PI * t) - 0.10 * s * s * silhouette + ruffle
          : 0.16 * Math.sin(t * Math.PI) + recipe.curl * t * t + recipe.cup * s * s * silhouette + ruffle;
        positions.push(x, y, z);
        uvs.push(u, t);
        const color = root.clone().lerp(base, ease(t / 0.35));
        const pattern = isLeaf ? 'gradient' : specimen.pattern;
        const tipBlend = pattern === 'picotee'
          ? ease((Math.abs(s) - 0.65) / 0.35) * 0.85 + ease((t - 0.82) / 0.18) * 0.5
          : pattern === 'bicolor' ? ease((t - 0.48) / 0.14) : ease((t - 0.35) / 0.65) * 0.86;
        color.lerp(tip, Math.min(1, tipBlend));
        if (!isLeaf && (pattern === 'speckled' || specimen.key === 'lily') && t > 0.15 && t < 0.7) {
          const spots = Math.sin(u * 93 + phase) * Math.sin(t * 127 + phase);
          if (spots > 0.87) color.lerp(fleck, 0.75);
        }
        const vein = 1 - Math.pow(Math.cos(s * 30 + t * 3), 16) * 0.045;
        color.multiplyScalar(vein * (1 - 0.07 * s * s));
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

  function clearPlant() {
    if (!plant) return;
    const geometries = new Set();
    const materials = new Set();
    plant.traverse(object => {
      if (object.isInstancedMesh) object.dispose();
      if (object.geometry) geometries.add(object.geometry);
      if (object.material) materials.add(object.material);
    });
    geometries.forEach(geometry => geometry.dispose());
    materials.forEach(material => material.dispose());
    scene.remove(plant);
  }

  function routedStem(bottom, knot, middle, top, obstacles, earlierStems) {
    const offsets = [0, 0.25, -0.25, 0.50, -0.50, 0.82, -0.82];
    let best = null;
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
        let score = Math.abs(depth) * 0.3 + Math.abs(side) * 0.45;
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
        if (bestScore === 0) return best;
      }
    }
    return best;
  }

  function buildBloom(entry, index, bouquet, envelopes, earlierStems) {
    const specimen = entry.specimen;
    const { random, palette, recipe } = specimen;
    const petals = [], leaves = [], sepals = [];
    const group = new THREE.Group();
    plant.add(group);
    const green = new THREE.MeshPhysicalMaterial({ color: '#477631', roughness: 0.65, clearcoat: 0.12 });
    const petalMaterial = new THREE.MeshPhysicalMaterial({
      vertexColors: true, side: THREE.DoubleSide, roughness: 0.78,
      metalness: 0, clearcoat: 0.025, clearcoatRoughness: 0.8,
      sheen: 0.18, sheenColor: new THREE.Color(palette.tip), sheenRoughness: 0.8,
      bumpMap: petalTexture, bumpScale: 0.006,
    });
    const leafMaterial = new THREE.MeshPhysicalMaterial({
      vertexColors: true, side: THREE.DoubleSide, roughness: 0.56,
      clearcoat: 0.3, clearcoatRoughness: 0.6, bumpMap: leafTexture, bumpScale: 0.045,
    });
    const top = new THREE.Vector3(...entry.position);
    const bottom = new THREE.Vector3(entry.turn * 0.6, -3.2 + random() * 0.25, -entry.turn * 0.3);
    const knot = new THREE.Vector3(entry.turn * 0.2, -1.9, 0);
    const middle = new THREE.Vector3(top.x * 0.65 + specimen.bend, (top.y - 1.9) / 2, top.z * 0.65);
    let curve;
    if (bouquet.version === 2) {
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
      curve = routedStem(bottom, knot, middle, top, envelopes.filter((_, other) => other !== index), earlierStems);
      earlierStems.push(curve.getPoints(40).filter(point => point.y > -1.65));
    } else {
      curve = new THREE.CatmullRomCurve3([bottom, knot, middle, top]);
    }
    const stem = new THREE.Mesh(new THREE.TubeGeometry(curve, 40, 0.024, 7, false), green);
    group.add(stem);

    const leafColors = { base: `hsl(${specimen.greenHue}, 42%, 30%)`, tip: `hsl(${specimen.greenHue - 12}, 40%, 47%)`, root: '#244e2b' };
    const leafWidth = { slender: 0.12, broad: 0.47, serrated: 0.31, strap: 0.22 }[recipe.leaf];
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
    const custom = window.ExtraBlooms?.has(specimen.key);
    const dedicated = custom || ['rose', 'tulip', 'dahlia'].includes(specimen.key);
    if (custom) petals.push(...ExtraBlooms.build(specimen, head, petalMaterial));
    else if (dedicated) petals.push(...PetalMeshes.build(specimen, head, petalMaterial));
    for (let layer = 0; !dedicated && layer < specimen.layers; layer++) {
      const count = Math.max(3, specimen.count - (specimen.key === 'rose' ? Math.floor(layer / 2) : 0));
      const size = 1 - layer * recipe.shrink;
      for (let i = 0; i < count; i++) {
        const stagger = specimen.key === 'rose' ? layer * 2.3999632297 : layer * Math.PI / count;
        const angle = i / count * Math.PI * 2 + specimen.rotation + stagger;
        const ring = new THREE.Group();
        ring.rotation.y = angle;
        ring.position.y = layer * recipe.lift + i * 0.003;
        const pivot = new THREE.Group();
        pivot.position.z = Math.max(0.025, recipe.disk * 0.8 - layer * 0.025);
        const petal = new THREE.Mesh(botanicalGeometry(specimen.length * size * (0.94 + random() * 0.12), specimen.width * size, palette, random, specimen), petalMaterial);
        pivot.add(petal);
        ring.add(pivot);
        head.add(ring);
        const layerCurl = specimen.key === 'rose' ? 0.22 : specimen.key === 'dahlia' ? 0.11 : 0.035;
        petals.push({ pivot, layer, offset: random() * 0.04, open: recipe.open - layer * layerCurl + (random() - 0.5) * 0.05 });
      }
    }
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
      pollen.setColorAt(i, color);
    }
    if (['gold', 'seeds'].includes(recipe.center)) center.add(pollen);
    else { pollen.geometry.dispose(); pollen.material.dispose(); }
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
    return { group, head, center, petals, leaves, sepals, entry, curve };
  }

  // Lay out foliage once at full bloom, not every frame. The thin leaf surfaces
  // may overlap in projection, but don't send them into another plant's volume.
  function settleFoliage() {
    pose(1, 0);
    plant.rotation.set(0, 0, 0);
    plant.updateMatrixWorld(true);
    const headBounds = blooms.map(({ head }) => new THREE.Box3().setFromObject(head).expandByScalar(0.018));
    const stemPoints = blooms.map(({ curve }) => curve.getPoints(32));
    const placed = [];
    const bounds = new THREE.Box3();
    blooms.forEach(({ leaves, curve, entry }, index) => {
      leaves.forEach(leaf => {
        const initialYaw = leaf.rotation.y;
        const initialT = leaf.userData.stemPosition;
        const scale = entry.leafScale;
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
              placed.push(bounds.clone());
              return;
            }
          }
        }
        leaf.visible = false;
      });
    });
  }

  function buildBouquet() {
    clearPlant();
    plant = new THREE.Group();
    scene.add(plant);
    const envelopes = specimen.version === 2 && Botany.headEnvelope
      ? specimen.flowers.map(entry => {
        const envelope = Botany.headEnvelope(entry);
        return { ...envelope, center: new THREE.Vector3(...envelope.center), axis: new THREE.Vector3(...envelope.axis) };
      }) : [];
    const earlierStems = [];
    blooms = specimen.flowers.map((entry, index) => buildBloom(entry, index, specimen, envelopes, earlierStems));
    // A real binding point makes the stems read as a hand-tied bouquet.
    ribbon = new THREE.Group();
    const legacy = specimen.version === undefined;
    ribbon.position.set(0, -1.9, legacy ? 0.13 : 0);
    const style = specimen.tie?.style ?? 'bow';
    const material = new THREE.MeshStandardMaterial({ color: specimen.tie?.color ?? '#c79779', roughness: 0.92, side: THREE.DoubleSide });
    if (style === 'twine') {
      for (let i = 0; i < 4; i++) {
        const strand = new THREE.Mesh(new THREE.TorusGeometry(0.16, 0.020, 7, 32), material);
        strand.position.set(0, i * 0.040 - 0.060, 0);
        strand.rotation.set(Math.PI / 2, i % 2 ? 0.13 : -0.13, 0);
        ribbon.add(strand);
      }
    } else if (style === 'wrap') {
      const wrap = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.155, 0.34, 32, 1, true), material);
      ribbon.add(wrap);
    }
    if (style === 'bow') addBow(material);
    plant.add(ribbon);
    yaw = targetYaw = -0.10;
    pitch = targetPitch = 0;
    if (!legacy) settleFoliage();
  }

  function addBow(material) {
    const tie = new THREE.Mesh(new THREE.TorusGeometry(0.20, 0.045, 8, 36), material);
    tie.rotation.x = Math.PI / 2;
    ribbon.add(tie);
    for (const direction of [-1, 1]) {
      const loop = new THREE.Mesh(new THREE.TorusGeometry(0.18, 0.032, 7, 32), material);
      loop.position.set(direction * 0.19, -0.03, 0.18);
      loop.scale.set(1.4, 0.60, 1);
      loop.rotation.z = direction * 0.4;
      ribbon.add(loop);
      const tail = new THREE.Mesh(new THREE.PlaneGeometry(0.09, 0.55), material);
      tail.position.set(direction * 0.13, -0.29, 0.19);
      tail.rotation.z = direction * 0.28;
      ribbon.add(tail);
    }
  }

  function pose(p, time) {
    blooms.forEach(({ group, head, center, petals, leaves, sepals, entry }, index) => {
      const local = clamp((p - entry.delay) / (1 - entry.delay));
      // Raise the packed arrangement together; only the opening is staggered.
      const growth = ease((specimen.version === 2 ? p : local) / 0.4);
      group.scale.setScalar(Math.max(0.001, growth));
      group.position.y = -3.2 * (1 - growth);
      const unfurl = ease((local - 0.23) / 0.77);
      head.scale.setScalar(entry.scale * (0.32 + 0.68 * unfurl));
      petals.forEach(({ pivot, mesh, shell, layer, offset, open }) => {
        const opening = ease((local - 0.23 - layer * 0.035 - offset) / (0.63 - layer * 0.03));
        if (shell) mesh.morphTargetInfluences[0] = 1 - opening;
        else {
          pivot.rotation.x = -1.43 * (1 - opening) + open * opening;
          pivot.scale.x = 0.65 + 0.35 * opening;
        }
      });
      leaves.forEach((leaf, i) => {
        leaf.scale.setScalar((entry.leafScale ?? 0.55) * (leaf.userData.clearanceScale ?? 1) * Math.max(0.001, ease((local - 0.13 - i * 0.07) / 0.36)));
      });
      sepals.forEach(sepal => { sepal.rotation.x = -1.3 + 1.5 * unfurl; });
      center.scale.setScalar(Math.max(0.001, ease((local - 0.60) / 0.30)));
      head.rotation.z = -entry.turn * 0.5 + (motion.matches ? 0 : Math.sin(time * 0.0006 + index) * 0.012);
    });
    ribbon.scale.setScalar(Math.max(0.001, ease((p - 0.20) / 0.2)));
    const sway = motion.matches ? 0 : Math.sin(time * 0.0005) * 0.008;
    plant.rotation.set(pitch, yaw, sway);
  }

  function updateStatus(p) {
    const label = p < 0.22 ? 'TAKING ROOT' : p < 0.45 ? 'REACHING FOR LIGHT' : p < 1 ? 'UNFOLDING SLOWLY' : 'IN FULL BLOOM';
    if (status.textContent !== label) status.textContent = label;
    card.classList.toggle('is-growing', p < 1);
  }

  function tick(now) {
    frame = null;
    progress = motion.matches ? 1 : clamp((now - start) / DURATION);
    yaw += (targetYaw - yaw) * 0.09;
    pitch += (targetPitch - pitch) * 0.09;
    pose(progress, now);
    updateStatus(progress);
    renderer.render(scene, camera);
    if (!motion.matches || Math.abs(targetYaw - yaw) > 0.001 || Math.abs(targetPitch - pitch) > 0.001) frame = requestAnimationFrame(tick);
  }

  function wake() {
    if (frame === null && !document.hidden) frame = requestAnimationFrame(tick);
  }

  function replay() {
    start = performance.now();
    progress = motion.matches ? 1 : 0;
    pose(progress, start);
    updateStatus(progress);
    renderer.render(scene, camera);
    wake();
  }

  function grow() {
    const cleanAddress = BouquetLink.withoutBouquet(window.location.href);
    if (cleanAddress !== window.location.href) history.replaceState(history.state, '', cleanAddress);
    linkNotice.textContent = '';
    introNote.textContent = senderNote;
    growFresh();
  }

  function growFresh() {
    // Monotonic seeds distinguish rapid clicks without inheriting a link's timestamp.
    lastFreshTimestamp = Math.max(Date.now(), lastFreshTimestamp + 1);
    if (lastFreshTimestamp === specimen?.timestamp) lastFreshTimestamp++;
    showBouquet(lastFreshTimestamp);
  }

  function showBouquet(timestamp, version) {
    specimen = Botany.createBouquet(timestamp, version);
    manualShare.hidden = true;
    shareUrl.value = '';
    shareButton.disabled = !BouquetLink.create(window.location.href, timestamp, specimen.version ?? 1);
    shareStatus.textContent = shareButton.disabled ? 'Open the garden on a website to share a link.' : '';
    buildBouquet();
    const date = new Date(specimen.timestamp);
    document.getElementById('flower-name').textContent = specimen.name;
    document.getElementById('specimen-number').textContent = `NO. ${String(specimen.timestamp % 1000000).padStart(6, '0')}`;
    const time = document.getElementById('flower-time');
    time.dateTime = date.toISOString();
    time.textContent = `${date.toLocaleDateString('en-US', { month: 'short', day: '2-digit', year: 'numeric' })} · ${date.toLocaleTimeString('en-GB', { hour12: false })}`;
    canvas.dataset.species = specimen.kinds.join(',');
    canvas.dataset.flowerCount = String(specimen.flowers.length);
    canvas.dataset.seed = String(specimen.timestamp);
    canvas.dataset.version = String(specimen.version ?? 1);
    const kinds = specimen.kinds.map(key => Botany.species[key].label.toLowerCase());
    document.getElementById('botanical-note').textContent = `${specimen.flowers.length} stems · ${new Intl.ListFormat('en').format(kinds)}`;
    canvas.setAttribute('aria-label', `A hand-tied bouquet of ${specimen.flowers.length} procedurally generated flowers: ${kinds.join(', ')}. Drag in any direction for a full 360-degree view, or use the arrow keys. Press Home or Reset view to return to the front.`);
    replay();
  }

  function showManualShare(url, shouldFocus = true) {
    shareStatus.textContent = 'Copy this link to send your bouquet.';
    shareUrl.value = url;
    manualShare.hidden = false;
    if (shouldFocus) {
      shareUrl.focus();
      shareUrl.select();
    }
  }

  async function shareBouquet() {
    if (sharing) return;
    const current = specimen;
    const url = BouquetLink.create(window.location.href, current.timestamp, current.version ?? 1);
    if (!url) return;

    sharing = true;
    shareButton.setAttribute('aria-disabled', 'true');
    shareStatus.textContent = '';
    manualShare.hidden = true;
    try {
      const data = { title: BRAND, text: 'I picked these flowers for you.', url };
      try {
        if (navigator.share && (!navigator.canShare || navigator.canShare(data))) {
          await navigator.share(data);
          return;
        }
      } catch (error) {
        if (error.name === 'AbortError') {
          // A cancelled share should not silently write to the clipboard.
          if (current === specimen) showManualShare(url, false);
          return;
        }
      }

      if (current !== specimen) return;
      try {
        await navigator.clipboard.writeText(url);
        if (current === specimen) shareStatus.textContent = 'Bouquet link copied.';
      } catch {
        if (current === specimen) showManualShare(url);
      }
    } finally {
      sharing = false;
      shareButton.removeAttribute('aria-disabled');
    }
  }

  function resize() {
    const { width, height } = stage.getBoundingClientRect();
    renderer.setSize(width, height, false);
    camera.aspect = width / height;
    // Maintain enough vertical and horizontal space for the entire bloom.
    const distance = Math.max(13.7, 6.4 / (2 * Math.tan(THREE.MathUtils.degToRad(17)) * camera.aspect));
    camera.position.set(0, 2.15, distance);
    camera.lookAt(0, 0.05, 0);
    camera.updateProjectionMatrix();
    renderer.render(scene, camera);
  }

  canvas.tabIndex = 0;
  canvas.addEventListener('pointerdown', event => {
    if (event.pointerType === 'mouse' && event.button !== 0) return;
    if (drag) return;
    drag = { id: event.pointerId, x: event.clientX, y: event.clientY, yaw: targetYaw, pitch: targetPitch };
    canvas.setPointerCapture(event.pointerId);
    canvas.classList.add('is-dragging');
  });
  canvas.addEventListener('pointermove', event => {
    if (!drag || event.pointerId !== drag.id) return;
    const sensitivity = Math.PI * 2 / Math.max(240, Math.min(canvas.clientWidth, canvas.clientHeight));
    targetYaw = drag.yaw + (event.clientX - drag.x) * sensitivity;
    targetPitch = drag.pitch + (event.clientY - drag.y) * sensitivity;
    wake();
  });
  const endDrag = event => {
    if (!drag || event.pointerId !== drag.id) return;
    drag = null;
    canvas.classList.remove('is-dragging');
  };
  canvas.addEventListener('pointerup', endDrag);
  canvas.addEventListener('pointercancel', endDrag);
  canvas.addEventListener('lostpointercapture', endDrag);
  canvas.addEventListener('keydown', event => {
    if (!['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Home'].includes(event.key)) return;
    event.preventDefault();
    if (event.key === 'ArrowLeft') targetYaw -= 0.15;
    if (event.key === 'ArrowRight') targetYaw += 0.15;
    if (event.key === 'ArrowUp') targetPitch -= 0.15;
    if (event.key === 'ArrowDown') targetPitch += 0.15;
    if (event.key === 'Home') resetView();
    wake();
  });

  function resetView() {
    drag = null;
    canvas.classList.remove('is-dragging');
    yaw = targetYaw = -0.10;
    pitch = targetPitch = 0;
    pose(progress, performance.now());
    renderer.render(scene, camera);
    wake();
  }

  document.getElementById('reset-view').addEventListener('click', resetView);
  document.getElementById('grow').addEventListener('click', grow);
  document.getElementById('replay').addEventListener('click', replay);
  shareButton.addEventListener('click', shareBouquet);
  document.getElementById('save').addEventListener('click', () => {
    const { name, timestamp } = specimen;
    start = performance.now() - DURATION;
    progress = 1;
    pose(1, performance.now());
    updateStatus(1);
    renderer.render(scene, camera);
    const image = document.createElement('canvas');
    image.width = 1600;
    image.height = 1700;
    const ctx = image.getContext('2d');
    ctx.fillStyle = '#fcfbf6'; ctx.fillRect(0, 0, image.width, image.height);
    const scale = Math.min(1440 / canvas.width, 1400 / canvas.height);
    const width = canvas.width * scale;
    const height = canvas.height * scale;
    const left = (1600 - width) / 2;
    const top = 60 + (1400 - height) / 2;
    ctx.drawImage(canvas, left, top, width, height);
    ctx.textAlign = 'center';
    ctx.fillStyle = '#354f3e'; ctx.font = '48px Georgia';
    ctx.fillText(name, 800, 1500);
    ctx.fillStyle = '#7c8571'; ctx.font = '18px monospace';
    ctx.fillText(`${BRAND.toUpperCase()} · ${new Date(timestamp).toISOString()}`, 800, 1560);
    ctx.font = 'italic 25px Georgia'; ctx.fillText('I picked these flowers for you.', 800, 1620);
    image.toBlob(blob => {
      if (!blob) return;
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `flowers-for-you-${timestamp}.png`;
      link.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    }, 'image/png');
  });

  canvas.addEventListener('webglcontextlost', event => {
    event.preventDefault();
    if (frame !== null) cancelAnimationFrame(frame);
    frame = null;
    message.hidden = false;
    message.textContent = 'The garden’s renderer paused. Reload to bring your flower back.';
  });
  canvas.addEventListener('webglcontextrestored', () => window.location.reload());
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) { if (frame !== null) cancelAnimationFrame(frame); frame = null; }
    else wake();
  });
  motion.addEventListener('change', wake);
  new ResizeObserver(resize).observe(stage);

  const incoming = BouquetLink.read(window.location.search);
  if (incoming.status === 'valid') {
    introNote.textContent = 'Someone picked these flowers for you.';
    showBouquet(incoming.timestamp, incoming.version);
  } else {
    if (incoming.status === 'invalid') linkNotice.textContent = 'This bouquet link is incomplete or invalid. We grew a fresh bouquet for you instead.';
    if (incoming.status === 'unsupported') linkNotice.textContent = 'This garden can’t open that version of the bouquet link. We grew a fresh bouquet for you instead.';
    growFresh();
  }
  resize();
})();
