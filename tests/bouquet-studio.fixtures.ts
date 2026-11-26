import * as THREE from 'three'
import { createRenderer, createScene } from '../src/garden/engine'

// An ivory sheet, two independently weighted petals, and two anthers on one
// InstancedMesh. Use the production depth path and read real WebGL2 pixels.
export function probeBouquetStudio() {
  const size = 160
  const canvas = document.createElement('canvas')
  const renderer = createRenderer(canvas)
  const gl = renderer.getContext()
  renderer.debug.onShaderError = (gl, program, vertex, fragment) => {
    throw new Error([gl.getProgramInfoLog(program), gl.getShaderInfoLog(vertex), gl.getShaderInfoLog(fragment)].join('\n'))
  }
  renderer.setSize(size, size, false)
  const scene = createScene()
  const camera = new THREE.OrthographicCamera(-1.8, 1.8, 1.8, -1.8, .1, 10)
  const rgba = new Uint8Array(size * size * 4)
  const plant = new THREE.Group()
  const head = new THREE.Group()
  plant.add(head)
  const pose = { plant, progress: 0, framePoints: [] as THREE.Vector3[] }
  for (const x of [-2, 2]) for (const y of [-2, 2]) for (const z of [-.3, 1]) {
    pose.framePoints.push(new THREE.Vector3(x, y, z))
  }
  const key = scene.getObjectByName('Window') as THREE.DirectionalLight
  const direction = key.position.clone().normalize()
  const material = new THREE.MeshStandardMaterial({ color: 0xe8dbc7, roughness: .83, side: THREE.DoubleSide })
  const back = new THREE.Mesh(new THREE.PlaneGeometry(3.3, 3.3), material)
  plant.add(back)
  // Each blade casts onto a different patch of the sheet. Their camera
  // projections miss those patches, so the measured deltas are shadows.
  function blade(x: number, y: number) {
    const g = new THREE.PlaneGeometry(.40, .35)
    const rest = g.getAttribute('position').clone()
    const move = rest.clone()
    for (let i = 0; i < move.count; i++) move.setX(i, rest.getX(i) - 1.4)
    g.morphAttributes.position = [move]
    const mesh = new THREE.Mesh(g, material)
    mesh.position.copy(direction).multiplyScalar(.68 / direction.z).add(new THREE.Vector3(x, y, 0))
    head.add(mesh)
    return mesh
  }
  const left = blade(-.65, -.52)
  blade(.65, -.52)
  const anthers = new THREE.InstancedMesh(new THREE.SphereGeometry(.13, 16, 12), material, 2)
  for (let i = 0; i < 2; i++) {
    const p = direction.clone().multiplyScalar(.64 / direction.z).add(new THREE.Vector3(i * 1.05 - .25, .64, 0))
    anthers.setMatrixAt(i, new THREE.Matrix4().setPosition(p))
  }
  // Leave the anther mesh in the depth pass only, so the patches below
  // prove what the instances cast rather than what their surfaces look like.
  anthers.layers.set(31)
  head.add(anthers)
  scene.setBouquet(pose)
  const samples = (studio = scene) => {
    const { quaternion } = plant
    camera.position.set(0, 0, 5).applyQuaternion(quaternion)
    camera.up.set(0, 1, 0).applyQuaternion(quaternion)
    camera.lookAt(0, 0, 0)
    renderer.render(studio, camera)
    gl.readPixels(0, 0, size, size, gl.RGBA, gl.UNSIGNED_BYTE, rgba)
    if (gl.getError() !== gl.NO_ERROR) throw new Error('Bouquet studio GL error')
    const zones = [[-.65, -.52], [.65, -.52], [-.25, .64], [.8, .64]]
    return { calls: renderer.info.render.calls, patches: zones.map(([x, y]) => {
      const X = Math.floor((x / 3.6 + .5) * size), Y = Math.floor((y / 3.6 + .5) * size)
      let energy = 0
      for (let j = -2; j <= 2; j++) for (let i = -2; i <= 2; i++) energy += rgba[4 * ((Y + j) * size + X + i)]
      return Math.round(energy / 25)
    }) }
  }
  try {
    const first = samples()
    const cached = samples()
    plant.rotation.set(.4, -.83, .24)
    const turned = samples()
    left.morphTargetInfluences![0] = 1
    pose.progress = .5
    const morph = samples()
    const again = samples()
    plant.rotation.set(0, 0, 0)
    left.morphTargetInfluences![0] = 0
    pose.progress = 0
    const rewind = samples()
    head.visible = false
    scene.invalidateShadows()
    const isolated = samples()
    const texturesBeforeDispose = renderer.info.memory.textures
    scene.dispose()
    const texturesAfterDispose = renderer.info.memory.textures
    // Simulate a driver declining the known framebuffer format. The same
    // rig should render the cut without occlusion, not fail the preview.
    const fallbackScene = createScene()
    let fallback: ReturnType<typeof samples>
    try {
      head.visible = true
      fallbackScene.setBouquet(pose)
      const check = gl.checkFramebufferStatus
      gl.checkFramebufferStatus = () => gl.FRAMEBUFFER_UNSUPPORTED
      try { fallback = samples(fallbackScene) }
      finally { gl.checkFramebufferStatus = check }
    } finally { fallbackScene.dispose() }
    return { first, cached, turned, morph, again, rewind, isolated, fallback, texturesBeforeDispose, texturesAfterDispose }
  } finally {
    anthers.dispose()
    plant.traverse(object => { if (object instanceof THREE.Mesh) object.geometry.dispose() })
    material.dispose()
    scene.dispose()
    renderer.dispose()
    renderer.forceContextLoss()
  }
}
