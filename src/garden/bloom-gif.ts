import type { Gift } from '../lib/bouquet-link'
import { GIF_HEIGHT, GIF_WIDTH, bloomGifFrames, type EncodeReply, type EncodeRequest } from './bloom-gif-format'

const TIME_LIMIT_MS = 45_000

function abortable<T>(signal: AbortSignal, begin: (resolve: (value: T) => void, reject: (error: unknown) => void) => void) {
  signal.throwIfAborted()
  const listeners = new AbortController()
  return new Promise<T>((resolve, reject) => {
    signal.addEventListener('abort', () => reject(signal.reason), { signal: listeners.signal })
    begin(resolve, reject)
  }).finally(() => listeners.abort())
}

async function encode(worker: Worker, request: EncodeRequest, signal: AbortSignal) {
  try {
    return await abortable<EncodeReply>(signal, (resolve, reject) => {
      worker.onmessage = (event: MessageEvent<EncodeReply>) => resolve(event.data)
      worker.onerror = (event) => {
        event.preventDefault()
        reject(new Error('The GIF encoder could not run.'))
      }
      worker.onmessageerror = () => reject(new Error('The GIF encoder returned invalid data.'))
      worker.postMessage(request, request.type === 'frame' ? [request.rgba] : [])
    })
  } finally {
    worker.onmessage = worker.onerror = worker.onmessageerror = null
  }
}

/** Sample the saved seed from the front. Nothing writes to the live garden. */
export async function exportBloomGif(document: Document, gift: Gift, signal: AbortSignal): Promise<Blob> {
  signal.throwIfAborted()
  const controller = new AbortController()
  const deadline = setTimeout(() => controller.abort(new DOMException('The GIF took too long to prepare.', 'TimeoutError')), TIME_LIMIT_MS)
  const stop = () => controller.abort(signal.reason)
  signal.addEventListener('abort', stop, { once: true })
  const work = controller.signal
  let sampler: ReturnType<typeof import('./bloom-sampler').createBloomSampler> | undefined
  let worker: Worker | undefined
  const paper = document.createElement('canvas')
  try {
    const { createBloomSampler } = await abortable<typeof import('./bloom-sampler')>(work, (resolve, reject) => {
      void import('./bloom-sampler').then(resolve, reject)
    })
    work.throwIfAborted()
    paper.width = GIF_WIDTH
    paper.height = GIF_HEIGHT
    const ctx = paper.getContext('2d', { alpha: false, willReadFrequently: true })
    if (!ctx) throw new Error('Could not prepare the GIF canvas.')
    ctx.fillStyle = '#fff9f2'
    worker = new Worker(new URL('./bloom-gif.worker.ts', import.meta.url))
    sampler = createBloomSampler(document, gift, GIF_WIDTH, GIF_HEIGHT)

    for (const { progress, delay } of bloomGifFrames()) {
      work.throwIfAborted()
      ctx.fillRect(0, 0, GIF_WIDTH, GIF_HEIGHT)
      sampler.draw(progress, ctx)
      const { data } = ctx.getImageData(0, 0, GIF_WIDTH, GIF_HEIGHT)
      // Transfer one frame at a time; never queue a second uncompressed frame.
      const reply = await encode(worker, { type: 'frame', rgba: data.buffer, delay }, work)
      if (reply.type !== 'accepted') throw new Error('Could not encode the GIF frame.')
    }
    const reply = await encode(worker, { type: 'finish' }, work)
    work.throwIfAborted()
    if (reply.type !== 'gif') throw new Error('Could not finish the GIF.')
    return new Blob([reply.bytes], { type: 'image/gif' })
  } finally {
    clearTimeout(deadline)
    signal.removeEventListener('abort', stop)
    worker?.terminate()
    sampler?.dispose()
    // Resize the detached 2D canvas to release its backing store.
    paper.width = paper.height = 0
  }
}
