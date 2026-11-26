import * as THREE from 'three'
import { createSpecimen } from '../src/garden/botany'
import { createRenderer, createScene } from '../src/garden/engine'
import { petalFields, petalSurface } from '../src/garden/petal-surface'

// A flat sheet isolates the material's response from the bouquet's silhouette,
// moving shadows and overlapping folds. Read the real WebGL2 draw, not the GLSL text.
export function probePetal() {
  const size = 128
  const canvas = document.createElement('canvas')
  const renderer = createRenderer(canvas)
  renderer.debug.onShaderError = (gl, program, vertex, fragment) => {
    throw new Error([gl.getProgramInfoLog(program), gl.getShaderInfoLog(vertex), gl.getShaderInfoLog(fragment)].join('\n'))
  }
  renderer.setSize(size, size, false)
  const fields = petalFields(1)
  const geometry = new THREE.PlaneGeometry(2, 2)
  geometry.setAttribute('color', new THREE.Float32BufferAttribute(new Array(12).fill(1), 3))
  geometry.setAttribute('petalHand', new THREE.Float32BufferAttribute(new Array(8).fill(0.5), 2))
  const bladeUv = geometry.attributes.uv.array.slice()
  // Isolate thin tissue from high-density veins without a change in relief.
  const testDensity = new THREE.DataTexture(new Uint8Array([128, 35, 128, 200]), 2, 1, THREE.RGFormat)
  testDensity.needsUpdate = true
  const matte = { name: 'test ivory', base: '#e5d6b8', tip: '#e5d6b8', root: '#e5d6b8', fleck: '#e5d6b8' }
  const materials = (['calla', 'lily', 'rose', 'poppy'] as const).map(key => petalSurface({ ...createSpecimen(42, key), palette: matte }, fields))
  const [wax, satin, velvet, paper] = materials
  const savedMap = paper.bumpMap
  const mesh = new THREE.Mesh(geometry, paper)
  const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 5)
  camera.position.z = 3
  const scene = new THREE.Scene()
  scene.add(mesh)
  const draw = (spots: [number, number][], target = scene) => {
    renderer.render(target, camera)
    const gl = renderer.getContext()
    const color = new Uint8Array(4)
    return spots.map(([x, y]) => {
      gl.readPixels(x, y, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, color)
      return Array.from(color)
    })
  }
  const root: [number, number] = [45, 8]
  const face: [number, number] = [45, 64]
  const tip: [number, number] = [45, 123]
  const vein: [number, number] = [83, 123]
  const light = (z: number, intensity: number) => {
    const source = new THREE.DirectionalLight(0xffffff, intensity)
    source.position.z = z
    return source
  }
  try {
    paper.bumpMap = testDensity
    const [unlit] = draw([tip])
    // A zero-intensity first light catches hardcoded key-only shaders.
    const off = light(1, 0), source = light(-1, 2)
    scene.add(off, source)
    const backlit = draw([root, face, tip, vein])
    scene.remove(off, source).add(source, off)
    const [reordered] = draw([tip])
    scene.remove(off)
    const [single] = draw([tip])
    source.position.set(1, 0, -0.15)
    const [grazing] = draw([tip])
    geometry.attributes.uv.array.fill(-1)
    geometry.attributes.uv.needsUpdate = true
    const [detail] = draw([tip])
    geometry.attributes.uv.array.set(bladeUv)
    geometry.attributes.uv.needsUpdate = true

    // Dark vertex pigment keeps the specular change measurable with direct light.
    geometry.attributes.color.array.fill(0.24)
    geometry.attributes.color.needsUpdate = true
    source.position.set(0, 0, 1)
    const [front] = draw([tip])
    mesh.rotateY(Math.PI)
    const [reverse] = draw([[size - 1 - tip[0], tip[1]]]) // Same patch after turning the sheet.
    mesh.rotation.y = 0
    paper.bumpMap = savedMap
    // Real production lights and all RG fields, including reuse of one linked
    // program across materials with different uniform values/texture bindings.
    const production = createScene().add(mesh)
    const families = [wax, satin, velvet, paper, wax].map(material => {
      mesh.material = material
      return draw([face, tip], production)
    })
    return { unlit, backlit, reordered, single, grazing, front, reverse, detail, families }
  } finally {
    geometry.dispose()
    materials.forEach(material => material.dispose())
    testDensity.dispose()
    fields.dispose()
    renderer.dispose()
    renderer.forceContextLoss()
  }
}
