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
  geometry.setAttribute('petalHand', new THREE.Float32BufferAttribute([.25, .5, .25, .5, .25, .5, .25, .5], 2))
  const bladeUv = geometry.attributes.uv.array.slice()
  // Only tissue packing changes; relief and pigment are both neutral.
  const testDensity = new THREE.DataTexture(new Uint8Array([128, 128, 117, 77, 128, 128, 117, 207]), 2, 1, THREE.RGBAFormat)
  testDensity.needsUpdate = true
  const matte = { name: 'test ivory', base: '#e5d6b8', tip: '#e5d6b8', root: '#e5d6b8', fleck: '#e5d6b8' }
  const materials = (['calla', 'lily', 'rose', 'poppy'] as const).map(key => petalSurface({ ...createSpecimen(42, key), palette: matte }, fields))
  const [wax, satin, velvet, paper] = materials
  const savedMap = paper.bumpMap
  const mesh = new THREE.Mesh(geometry, paper)
  const blockerGeometry = new THREE.PlaneGeometry(1.2, 2.5)
  const blockerMaterial = new THREE.MeshBasicMaterial({ side: THREE.DoubleSide })
  const blocker = new THREE.Mesh(blockerGeometry, blockerMaterial)
  blocker.position.set(-0.57, 0, -.5)
  blocker.castShadow = true
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
    const fill = light(1, 2)
    scene.add(fill)
    const [solid] = draw([tip])
    paper.bumpMap = savedMap
    const [solidWithField] = draw([tip])
    paper.bumpMap = testDensity
    scene.remove(fill)
    geometry.attributes.uv.array.set(bladeUv)
    geometry.attributes.uv.needsUpdate = true

    // Dark vertex pigment keeps the specular change measurable with direct light.
    geometry.attributes.color.array.fill(0.24)
    geometry.attributes.color.needsUpdate = true
    source.position.set(0, 0, 1)
    const waxMap = wax.bumpMap
    wax.bumpMap = testDensity
    mesh.material = wax
    const [front] = draw([tip])
    mesh.rotateY(Math.PI)
    const [reverse] = draw([[size - 1 - tip[0], tip[1]]]) // Same patch after turning the sheet.
    mesh.rotation.y = 0
    wax.bumpMap = waxMap
    paper.bumpMap = savedMap
    // Real production lights and all RGBA fields, including reuse of a linked
    // program across materials with different uniform values/texture bindings.
    const production = createScene().add(mesh)
    const families = [wax, satin, velvet, paper, wax].map(material => {
      mesh.material = material
      return draw([face, tip], production)
    })
    // Genuine minification, not a CSS rescale. Stay off the silhouette and
    // measure how much the filtered tissue changes over a subpixel turn.
    const distant = materials.map(material => {
      mesh.material = material
      mesh.scale.setScalar(0.12)
      const samples: [number, number][] = Array.from({ length: 64 }, (_, i) => [60 + (i % 8), 60 + Math.floor(i / 8)])
      const center = draw(samples, production)
      mesh.position.x = 0.5 / size
      mesh.rotation.y = .012
      const shifted = draw(samples, production)
      mesh.position.x = mesh.rotation.y = 0
      const differences = center.flatMap((rgba, i) => rgba.slice(0, 3).map((value, channel) => Math.abs(value - shifted[i][channel])))
      return { mean: differences.reduce((sum, d) => sum + d, 0) / differences.length, max: Math.max(...differences) }
    })
    mesh.scale.setScalar(1)
    mesh.material = paper
    paper.bumpMap = testDensity
    geometry.attributes.color.array.fill(1)
    geometry.attributes.color.needsUpdate = true

    // Check that the actual shadow-casting directional is masked, but an
    // independent back light still transmits. Render with the receiver both
    // on and off (same program/uniform), and with shadows disabled again.
    source.position.set(0, 0, -1)
    source.castShadow = true
    source.shadow.mapSize.set(128, 128)
    source.shadow.camera.left = source.shadow.camera.bottom = -1.5
    source.shadow.camera.right = source.shadow.camera.top = 1.5
    source.shadow.camera.near = .05
    source.shadow.camera.far = 4
    const bounce = light(-1, .3)
    const shadowScene = new THREE.Scene().add(bounce, source, blocker, mesh)
    const clear: [number, number] = [75, 123]
    renderer.shadowMap.type = THREE.PCFShadowMap
    renderer.shadowMap.enabled = true
    // The production studio invalidates its cache by pose. This standalone
    // scene has no studio owner: request the blocker’s initial depth pass.
    renderer.shadowMap.needsUpdate = true
    mesh.receiveShadow = true
    const shadowed = draw([tip, clear], shadowScene)
    mesh.receiveShadow = false
    const bypass = draw([tip, clear], shadowScene)
    renderer.shadowMap.enabled = false
    const noShadow = draw([tip, clear], shadowScene)
    shadowScene.remove(source)
    const bounceOnly = draw([tip, clear], shadowScene)
    source.shadow.dispose()
    return { unlit, backlit, reordered, single, grazing, front, reverse, detail, solid, solidWithField, families, distant, shadowed, bypass, noShadow, bounceOnly }
  } finally {
    geometry.dispose()
    blockerGeometry.dispose()
    blockerMaterial.dispose()
    materials.forEach(material => material.dispose())
    testDensity.dispose()
    fields.dispose()
    renderer.dispose()
    renderer.forceContextLoss()
  }
}
