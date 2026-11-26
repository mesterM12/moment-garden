import { PerspectiveCamera } from 'three'
import type { Gift } from '../lib/bouquet-link'
import { BLOOM_FOV, BLOOM_FRONT_YAW, createBloomFramer } from './bloom-camera'
import { createBouquet } from './botany'
import { buildBouquet, createRenderer, createScene, disposeBouquet, leafVeins, pose } from './engine'
import { petalFields } from './petal-surface'

/** A detached garden with its own GL context. It has no clock, input, or sound. */
export function createBloomSampler(document: Document, gift: Gift, width: number, height: number) {
  const canvas = document.createElement('canvas')
  const renderer = createRenderer(canvas)
  let petals: ReturnType<typeof petalFields> | undefined
  let leaf: ReturnType<typeof leafVeins> | undefined
  let bouquet: ReturnType<typeof buildBouquet> | undefined

  function dispose() {
    if (bouquet) disposeBouquet(bouquet)
    petals?.dispose()
    leaf?.dispose()
    renderer.dispose()
    // Unlike the live canvas, this one will never remount. Release its GL slot now.
    renderer.forceContextLoss()
  }

  try {
    const gl = renderer.getContext()
    renderer.setDrawingBufferSize(width, height, 1)
    const scene = createScene()
    const camera = new PerspectiveCamera(BLOOM_FOV, width / height, .1, 60)
    const framer = createBloomFramer(camera)
    const anisotropy = Math.min(4, renderer.capabilities.getMaxAnisotropy())
    petals = petalFields(anisotropy)
    leaf = leafVeins(document, anisotropy)
    const sample = bouquet = buildBouquet(createBouquet(gift.timestamp, gift.version), { petal: petals, leaf })
    sample.plant.rotation.y = BLOOM_FRONT_YAW
    scene.add(sample.plant)

    return {
      draw(progress: number, target: CanvasRenderingContext2D) {
        pose(sample, progress)
        framer.frameBloom(sample, progress)
        renderer.render(scene, camera)
        if (gl.isContextLost()) throw new Error('The GIF renderer lost its WebGL context.')
        // The WebGL buffer need not persist. Copy inside the render's task.
        target.drawImage(canvas, 0, 0)
      },
      dispose,
    }
  } catch (error) {
    dispose()
    throw error
  }
}
