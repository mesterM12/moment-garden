// Browser entry bundled by realism-proof.mjs. This scene is diagnostic, not a postcard route.
import * as THREE from 'three'
import { createBouquet, species } from '../src/garden/botany'
import { BLOOM_FOV, BLOOM_FRONT_YAW, createBloomFramer } from '../src/garden/bloom-camera'
import { buildBouquet, createRenderer, createScene, disposeBouquet, leafVeins, pose } from '../src/garden/engine'
import { petalFields } from '../src/garden/petal-surface'
import { parseToken } from '../src/lib/bouquet-link'

const size = 288
const views = ['half', 'front', 'angle'] as const
type View = typeof views[number]
type Lens = { target: number[]; direction: number[]; span: number }
type Lenses = Record<'front' | 'angle', Lens>
const vector = (xyz: number[]) => new THREE.Vector3(xyz[0], xyz[1], xyz[2])

const started = performance.now()
const canvas = document.createElement('canvas')
const renderer = createRenderer(canvas)
const scene = createScene()
const gl = renderer.getContext()
const anisotropy = Math.min(4, renderer.capabilities.getMaxAnisotropy())
const textures = { petal: petalFields(anisotropy), leaf: leafVeins(document, anisotropy) }
const rendererAndTexturesMs = performance.now() - started
const readback = document.createElement('canvas')
readback.width = readback.height = size
const pixels = readback.getContext('2d')!
const debug = gl.getExtension('WEBGL_debug_renderer_info')
const environment = {
  three: THREE.REVISION,
  webgl: gl.getParameter(gl.VERSION),
  vendor: gl.getParameter(debug?.UNMASKED_VENDOR_WEBGL ?? gl.VENDOR),
  renderer: gl.getParameter(debug?.UNMASKED_RENDERER_WEBGL ?? gl.RENDERER),
  antialias: gl.getContextAttributes()?.antialias,
  anisotropy,
  rendererAndTexturesMs,
}

type Build = ReturnType<typeof buildBouquet>
function open(token: string) {
  const gift = parseToken(token)
  if (!gift) throw new Error(`Bad proof token: ${token}`)
  const start = performance.now()
  const plan = createBouquet(gift.timestamp, gift.version)
  const planned = performance.now()
  const bouquet = buildBouquet(plan, textures)
  const built = performance.now()
  bouquet.plant.rotation.y = BLOOM_FRONT_YAW
  scene.add(bouquet.plant)
  return { bouquet, planMs: planned - start, buildMs: built - planned }
}

function render(bouquet: Build, camera: THREE.Camera, progress: number, frame?: () => void) {
  pose(bouquet, progress)
  frame?.()
  renderer.render(scene, camera)
  if (gl.isContextLost()) throw new Error('Proof WebGL context lost')
}

function stats() {
  const { calls, triangles, lines, points } = renderer.info.render
  return { calls, triangles, lines, points }
}

function measure(token: string, width: number, height: number, run: number) {
  renderer.setDrawingBufferSize(width, height, 1)
  const { bouquet, planMs, buildMs } = open(token)
  const camera = new THREE.PerspectiveCamera(BLOOM_FOV, width / height, .1, 60)
  const framer = createBloomFramer(camera)
  const rgba = new Uint8Array(width * height * 4)
  const draw = (progress: number) => {
    const start = performance.now()
    render(bouquet, camera, progress, () => framer.frameBloom(bouquet, progress))
    const submitted = performance.now()
    // Measure completion with a real readback; Chromium can return from finish() before drawing.
    gl.readPixels(0, 0, width, height, gl.RGBA, gl.UNSIGNED_BYTE, rgba)
    return { progress, ...stats(), submitMs: submitted - start, readbackMs: performance.now() - start }
  }
  try {
    const first = draw(0)
    const beats = [.24, .50, .78, 1]
    beats.forEach(draw) // Warm every sampled framing before the measured sweep.
    return {
      run, token, name: bouquet.plan.name, tie: bouquet.plan.tie.style, species: bouquet.plan.kinds,
      stems: bouquet.blooms.length, planMs, buildMs, first,
      warm: beats.flatMap(progress => Array.from({ length: 5 }, () => draw(progress))),
    }
  } finally { disposeBouquet(bouquet) }
}

// Use the production cut, including slot/index, scale, neck angle, and opening
// rhythm. Only mute siblings in the diagnostic scene; no transplant or rebuild.
function isolate(head: THREE.Object3D, plant: THREE.Object3D) {
  for (let node = head; node !== plant; node = node.parent!) {
    if (!node.parent) throw new Error('Proof head no longer belongs to its production bouquet')
    for (const sibling of node.parent.children) if (sibling !== node) sibling.visible = false
  }
}

function projectedBounds(head: THREE.Object3D, camera: THREE.Camera, bounds: THREE.Box3) {
  camera.updateMatrixWorld(true)
  const modelView = new THREE.Matrix4(), point = new THREE.Vector3()
  head.traverseVisible(object => {
    if (!(object instanceof THREE.Mesh)) return
    modelView.multiplyMatrices(camera.matrixWorldInverse, object.matrixWorld)
    if (object instanceof THREE.InstancedMesh) {
      object.computeBoundingBox()
      const { min, max } = object.boundingBox!
      for (const x of [min.x, max.x]) for (const y of [min.y, max.y]) for (const z of [min.z, max.z]) {
        bounds.expandByPoint(point.set(x, y, z).applyMatrix4(modelView))
      }
      return
    }
    const positions = object.geometry.getAttribute('position')
    for (let i = 0; i < positions.count; i++) {
      object.getVertexPosition(i, point) // Includes the live morph weights, unlike the rest bounding box.
      bounds.expandByPoint(point.applyMatrix4(modelView))
    }
  })
}

const cameraDistance = 12
function aim(camera: THREE.OrthographicCamera, target: THREE.Vector3, direction: THREE.Vector3) {
  camera.position.copy(target).addScaledVector(direction, cameraDistance)
  camera.lookAt(target)
}

function specimen(key: keyof typeof species, token: string, slot: number, elevations: [number, number], fixed?: Lenses) {
  renderer.setDrawingBufferSize(size, size, 1)
  const { bouquet } = open(token)
  try {
    const bloom = bouquet.blooms[slot]
    if (bloom?.entry.specimen.key !== key) throw new Error(`${token} slot ${slot} expected ${key}, found ${bloom?.entry.specimen.key}. Do not silently substitute another seed.`)
    const { head, entry, startBeat, endBeat } = bloom
    const half = (startBeat + endBeat) / 2
    isolate(head, bouquet.plant)
    function setPose(progress: number) {
      pose(bouquet, progress)
      bouquet.plant.updateMatrixWorld(true)
    }
    setPose(1)
    const pivot = head.getWorldPosition(new THREE.Vector3())
    const axis = new THREE.Vector3(0, 1, 0).applyQuaternion(head.getWorldQuaternion(new THREE.Quaternion()))
    // Start in the plane between the production front and the head's axis.
    const tangent = new THREE.Vector3(0, .17, 1)
    tangent.addScaledVector(axis, -tangent.dot(axis)).normalize()
    const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, .1, 60)
    const fit = (offAxis: number, turn: number, beats: number[]): Lens => {
      const theta = THREE.MathUtils.degToRad(offAxis)
      const direction = tangent.clone().applyAxisAngle(axis, THREE.MathUtils.degToRad(turn))
        .multiplyScalar(Math.sin(theta)).addScaledVector(axis, Math.cos(theta)).normalize()
      aim(camera, pivot, direction)
      const bounds = new THREE.Box3()
      for (const beat of beats) {
        setPose(beat)
        projectedBounds(head, camera, bounds)
      }
      if (bounds.isEmpty()) throw new Error(`No visible geometry in ${key} proof`)
      const center = bounds.getCenter(new THREE.Vector3())
      // Leave target at the production socket's depth but center the crop in x/y.
      const target = new THREE.Vector3(center.x, center.y, -cameraDistance).applyMatrix4(camera.matrixWorld)
      const { x, y } = bounds.getSize(new THREE.Vector3())
      return { target: target.toArray(), direction: direction.toArray(), span: Math.max(x, y) / .82 }
    }
    const lenses = fixed ?? { front: fit(elevations[0], 0, [half, 1]), angle: fit(elevations[1], 70, [1]) }
    // Use one scale across all three frames, so the reveal's size change survives.
    if (!fixed) lenses.front.span = lenses.angle.span = Math.max(lenses.front.span, lenses.angle.span)
    const frames = {} as Record<View, { png: string; coverage: number }>
    for (const view of views) {
      const lens = lenses[view === 'angle' ? 'angle' : 'front']
      camera.left = camera.bottom = -lens.span / 2
      camera.right = camera.top = lens.span / 2
      camera.updateProjectionMatrix()
      aim(camera, vector(lens.target), vector(lens.direction))
      const progress = view === 'half' ? half : 1
      setPose(progress)
      const bounds = new THREE.Box3()
      projectedBounds(head, camera, bounds)
      const coverage = 2 * Math.max(Math.abs(bounds.min.x), Math.abs(bounds.max.x), Math.abs(bounds.min.y), Math.abs(bounds.max.y)) / lens.span
      render(bouquet, camera, progress)
      // As in production export, copy the non-preserved WebGL buffer in its draw task.
      pixels.clearRect(0, 0, size, size)
      pixels.drawImage(canvas, 0, 0)
      frames[view] = { png: readback.toDataURL(), coverage }
    }
    return { key, label: species[key].label, token, slot, name: entry.specimen.name, pattern: entry.specimen.pattern, half, lenses, frames }
  } finally { disposeBouquet(bouquet) }
}

Object.assign(window, { realismProof: {
  environment, keys: Object.keys(species).sort(), size, measure, specimen,
  dispose() { textures.petal.dispose(); textures.leaf.dispose(); renderer.dispose(); renderer.forceContextLoss() },
} })
