/// <reference lib="webworker" />
import { applyPalette, GIFEncoder, quantize } from 'gifenc'
import { GIF_BYTE_LIMIT, GIF_HEIGHT, GIF_WIDTH, bloomGifFrames, type EncodeReply, type EncodeRequest } from './bloom-gif-format'

declare const self: DedicatedWorkerGlobalScope

const frames = bloomGifFrames()
const encoder = GIFEncoder({ initialCapacity: 256 * 1024 })
let written = 0

function reply(message: EncodeReply, transfer: Transferable[] = []) {
  self.postMessage(message, transfer)
}

self.onmessage = ({ data }: MessageEvent<EncodeRequest>) => {
  try {
    if (data.type === 'frame') {
      if (data.delay !== frames[written]?.delay || data.rgba.byteLength !== GIF_WIDTH * GIF_HEIGHT * 4) {
        throw new Error('Invalid GIF frame.')
      }
      const pixels = new Uint8ClampedArray(data.rgba)
      // Keep the stationery background exact across frames. The remaining
      // colors adapt to the petals in each frame, avoiding a washed-out palette.
      const palette = [[255, 249, 242], ...quantize(pixels, 255)]
      encoder.writeFrame(applyPalette(pixels, palette), GIF_WIDTH, GIF_HEIGHT, { palette, delay: data.delay, repeat: 0 })
      if (encoder.bytesView().length >= GIF_BYTE_LIMIT) throw new Error('The GIF exceeded its size limit.')
      written++
      reply({ type: 'accepted' })
      return
    }
    if (written !== frames.length) throw new Error('The GIF is incomplete.')
    encoder.finish()
    const bytes = encoder.bytesView()
    reply({ type: 'gif', bytes }, [bytes.buffer])
    self.close()
  } catch {
    reply({ type: 'error' })
    self.close()
  }
}
