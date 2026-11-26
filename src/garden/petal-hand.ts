import { Uint8BufferAttribute } from 'three';
import type { BufferGeometry } from 'three';

// The stem timestamp already includes its slot in both URL recipes. Address a
// blade directly: changing a neighbouring head's complexity cannot advance it.
export function petalHand(timestamp: number, panel: number, blade: number) {
  let word = timestamp ^ Math.imul(Math.floor(timestamp / 0x100000000), 0x85ebca6b)
    ^ Math.imul(panel + 1, 0x9e3779b1) ^ Math.imul(blade + 1, 0x27d4eb2d);
  word = Math.imul(word ^ (word >>> 16), 0x7feb352d);
  word = Math.imul(word ^ (word >>> 15), 0x846ca68b);
  return (word ^ (word >>> 16)) >>> 0;
}

// Two normalized bytes, constant over a blade even in joined whorls. The
// shader spends these on vein drift and pigment; no per-draw petal uniforms.
export function handAttribute(g: BufferGeometry) {
  const attr = new Uint8BufferAttribute(new Uint8Array(g.attributes.position.count * 2), 2, true);
  g.setAttribute('petalHand', attr);
  return (first: number, end: number, word: number) => {
    for (let i = first; i < end; i++) {
      attr.array[2 * i] = word & 255;
      attr.array[2 * i + 1] = (word >>> 8) & 255;
    }
  };
}
