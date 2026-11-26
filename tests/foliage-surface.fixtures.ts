import * as THREE from 'three'
import { foliageMaterial } from '../src/garden/foliage'

export function probeLeaf() {
  const canvas = document.createElement('canvas')
  canvas.width = canvas.height = 64
  const gl = canvas.getContext('webgl2')!
  const renderer = new THREE.WebGLRenderer({ canvas, context: gl })
  renderer.setSize(64, 64, false)
  const scene = new THREE.Scene(), camera = new THREE.OrthographicCamera(-1, 1, 1, -1, .1, 10)
  const light = new THREE.DirectionalLight(0xffffff, 2)
  const patch = new THREE.PlaneGeometry(2, 2)
  patch.setAttribute('color', new THREE.Float32BufferAttribute(Array(4).fill([.15, .26, .07]).flat(), 3))
  const blades = new THREE.Float32BufferAttribute([-1, 1, .42, 1, 1, .42, -1, 0, .42, 1, 0, .42], 3)
  const stalk = new THREE.Float32BufferAttribute(Array(4).fill([0, 0, -1]).flat(), 3)
  patch.setAttribute('leafTissue', blades)
  const rose = foliageMaterial('rose'), sunflower = foliageMaterial('sunflower'), tulip = foliageMaterial('tulip')
  const mesh = new THREE.Mesh(patch, rose)
  scene.add(mesh, light)
  const px = new Uint8Array(4)
  function draw(x: number, y: number) {
    renderer.render(scene, camera)
    gl.readPixels(x, y, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px)
    return Array.from(px)
  }
  function look(z: number) {
    camera.position.set(0, 0, z)
    camera.lookAt(0, 0, 0)
  }
  try {
    look(2)
    light.position.set(0, 0, -2)
    const backlit = { root: draw(43, 7), tip: draw(43, 56), rib: draw(32, 52), margin: draw(62, 52) }
    patch.setAttribute('leafTissue', stalk)
    const backlitStalk = draw(43, 56)
    patch.setAttribute('leafTissue', blades)
    light.intensity = 0
    const unlit = draw(43, 56)
    light.intensity = 2
    // Isolate the two faces' pigment under a neutral diffuse light before
    // the directional swatches compare the live material programs.
    const bounce = new THREE.AmbientLight(0xffffff, 2)
    scene.add(bounce)
    light.intensity = 0
    const upper = draw(43, 40)
    look(-2)
    const reverse = draw(20, 40)
    look(2)
    scene.remove(bounce)
    light.intensity = 2
    light.position.set(.6, .5, 2)
    const swatches = []
    for (const material of [rose, sunflower, tulip, rose]) {
      mesh.material = material
      swatches.push([draw(32, 24), draw(39, 39), draw(55, 29), draw(23, 55)])
    }
    return { backlit, backlitStalk, unlit, upper, reverse, swatches, programs: renderer.info.programs?.length }
  } finally {
    patch.dispose(); rose.dispose(); sunflower.dispose(); tulip.dispose()
    renderer.dispose(); renderer.forceContextLoss()
  }
}
