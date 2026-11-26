import type { SpeciesKey } from './types';

export const BLOOM_DURATION = 4600;
export const clamp = (t: number) => Math.min(1, Math.max(0, t));
export const ease = (t: number) => { t = clamp(t); return t * t * (3 - 2 * t); };
const beat = (t: number, from: number, to: number) => ease((t - from) / (to - from));

// The first focal stem leads. Its companion answers, followed by overlapping
// voices rather than every flower starting the same move on the same frame.
export function bloomStart(index: number, delay: number) {
  // The v2 cuts all start with a pair of focal stems, three companions, then
  // accents. Let the little ones answer across the bouquet, not in slot order.
  const entrances = [0, .085, .15, .224, .188, .295, .39, .336, .447, .36];
  return index === 0 ? 0 : entrances[Math.min(index, 9)] + delay * .44;
}

// Different material resists the opening differently. A lily stands upright
// longer than a falling rose guard; short ray blades flick through the tuck.
export function hingePeak(key: SpeciesKey) {
  if (key === 'tulip' || key === 'calla' || key === 'lily') return .49;
  if (key === 'dahlia' || key === 'sunflower' || key === 'daisy') return .37;
  return .43;
}

// Overlapping hinge and release through a half-open tuck, with a late reflex and
// one return. No history or derivative integration: seeking and replay are exact.
export function foldWeights(weights: number[], u: number, peak: number) {
  const release = ease((u - peak * .55) / (.92 - peak * .55));
  const stroke = clamp(u / (peak + .19));
  const hinge = ease(1 - (1 - stroke) ** 1.65);
  const reflex = .072 * (ease((u - .77) / .14) - ease((u - .91) / .09));
  weights[0] = (1 - hinge) * (1 - release);
  weights[1] = hinge * (1 - release) - reflex;
}

// One release of stored tension. A stem travels a little past its resting
// curve, then settles; it never oscillates or changes geometry at rest.
export function stemTension(t: number) {
  return t >= 1 ? 0 : 1 - .21 * (1 - (1 - clamp(t / .38)) ** 2) - .88 * beat(t, 0, .62) + .09 * beat(t, .62, 1);
}

export function petalWave(key: SpeciesKey, layer: number, order: number, phase: number) {
  // Shells peel over a neighbour, daisies follow each other's ray insertion,
  // and the outer rolls of dense heads loosen before the innermost crown.
  const spiral = (order * .618034 + phase / (Math.PI * 2)) % 1;
  const depth = Math.min(layer, 6);
  if (key === 'tulip' || key === 'rose' || key === 'ranunculus' || key === 'dahlia') {
    return .012 + .048 * depth + spiral * .14;
  }
  if (key === 'lily' || key === 'poppy' || key === 'anemone') return .04 + depth * .073 + spiral * .22;
  return .075 + depth * .046 + spiral * .15;
}

// Choose a guard on the visible shoulder. One broad petal can break the
// contour well ahead of its neighbours; the others still have their full turn.
export function leadingGuard(key: SpeciesKey, phase: number, count: number) {
  const n = key === 'rose' ? 8 : key === 'tulip' || key === 'lily' ? 3 : key === 'poppy' ? count : 0;
  if (!n) return -1;
  const i = Math.round((.95 - phase) * n / (Math.PI * 2));
  return (i % n + n) % n;
}

export function petalOpening(local: number, start: number) {
  // This is a clock, not an eased pose: the hinge, blade, and lip each own
  // their ease. A second ease here used to erase most of the last second.
  return clamp((local - start) / (.96 + .04 * clamp(start / .49) - start));
}

// Smooth bend in the flexible length only: the cut ends and binding never
// slide apart. The same displacement drives stem, head, and foliage sockets.
export const flexAt = (y: number, tipY: number) => ease((y + 1.9) / (tipY + 1.9));
