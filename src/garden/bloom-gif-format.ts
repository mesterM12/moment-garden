import { BLOOM_DURATION } from './bloom-score.ts'

export const GIF_WIDTH = 432
export const GIF_HEIGHT = 480
export const GIF_FINAL_HOLD = 1200
export const GIF_BYTE_LIMIT = 12 * 1024 * 1024

/** GIF delays are centiseconds. Round endpoints, not intervals, so timing never drifts. */
export function bloomGifFrames(duration = BLOOM_DURATION) {
  const steps = Math.min(90, Math.max(1, Math.round(duration / 80)))
  const timeAt = (step: number) => Math.round(duration * step / steps / 10) * 10
  return Array.from({ length: steps + 1 }, (_, i) => ({
    progress: i === steps ? 1 : timeAt(i) / duration,
    delay: i === steps ? GIF_FINAL_HOLD : timeAt(i + 1) - timeAt(i),
  }))
}

export type EncodeRequest = { type: 'frame'; rgba: ArrayBuffer; delay: number } | { type: 'finish' }
export type EncodeReply = { type: 'accepted' } | { type: 'gif'; bytes: Uint8Array<ArrayBuffer> } | { type: 'error' }
