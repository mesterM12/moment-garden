// gifenc 1.0.3 does not ship types. This declares the subset used by the bloom encoder.
declare module 'gifenc' {
  export function quantize(rgba: Uint8ClampedArray, maxColors: number): number[][]
  export function applyPalette(rgba: Uint8ClampedArray, palette: number[][]): Uint8Array
  export function GIFEncoder(options?: { initialCapacity?: number }): {
    writeFrame(index: Uint8Array, width: number, height: number, options: { palette: number[][]; delay: number; repeat: number }): void
    finish(): void
    bytesView(): Uint8Array<ArrayBuffer>
  }
}
