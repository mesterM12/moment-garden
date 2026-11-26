// PNG's Paeth predictor, but only the byte residuals: gzip/Brotli compress
// coherent slope and pigment fields far better than raw base64. No async
// image decode or added dependency in the renderer. This transform is exact.
function paeth(left: number, above: number, diagonal: number) {
  const plane = left + above - diagonal;
  const l = Math.abs(plane - left), a = Math.abs(plane - above), d = Math.abs(plane - diagonal);
  return l <= a && l <= d ? left : a <= d ? above : diagonal;
}

export function petalBytePredictor(bytes: Uint8Array, i: number, rowBytes: number) {
  const hasLeft = i % rowBytes >= 4, hasAbove = i >= rowBytes;
  return paeth(hasLeft ? bytes[i - 4] : 128,
    hasAbove ? bytes[i - rowBytes] : 128,
    hasLeft && hasAbove ? bytes[i - rowBytes - 4] : 128);
}

export function decodePetalBytes(base64: string, width: number) {
  const delta = atob(base64), rowBytes = width * 4;
  const bytes = new Uint8Array(delta.length);
  for (let i = 0; i < delta.length; i++) bytes[i] = delta.charCodeAt(i) + petalBytePredictor(bytes, i, rowBytes);
  return bytes;
}
