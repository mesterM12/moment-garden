import type { SpeciesKey } from './types';

export const BLOOM_DURATION = 6500;
export const clamp = (t: number) => Math.min(1, Math.max(0, t));
export const ease = (t: number) => { t = clamp(t); return t * t * (3 - 2 * t); };
const beat = (t: number, from: number, to: number) => ease((t - from) / (to - from));

// The first focal stem leads. Its companion answers, followed by overlapping
// voices rather than every flower starting the same move on the same frame.
export function bloomStart(index: number, delay: number) {
  // The v2 cuts all start with a pair of focal stems, three companions, then
  // accents. Let the little ones answer across the bouquet, not in slot order.
  const entrances = [0, .105, .135, .222, .176, .278, .372, .312, .426, .35];
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
  if (key === 'tulip') return .065 + Math.min(1, depth) * .145 + .15 * spiral;
  if (key === 'rose' || key === 'ranunculus' || key === 'dahlia') {
    return .022 + .055 * depth + spiral * .135;
  }
  if (key === 'lily' || key === 'poppy' || key === 'anemone') return .04 + depth * .073 + spiral * .22;
  return .075 + depth * .046 + spiral * .15;
}

// Finish as a relay, rather than stretching every blade to the same end beat.
// Outside rows turn over while the crown is moving; the last inner blades
// still receive the full local clock. Never desynchronise a floret's scaffold.
export function petalPace(key: SpeciesKey, layer: number, order: number, phase: number) {
  const side = .5 + .5 * Math.cos(order * 2.39996 + phase);
  if (key === 'hydrangea' || key === 'billyButton') return 1;
  if (key === 'calla') return 1.02;
  if (key === 'rose' || key === 'dahlia' || key === 'ranunculus') return 1 + (.38 + .16 * side) / (1 + layer * 1.25);
  if (key === 'tulip' || key === 'lily') return 1 + (.22 + .14 * side) * (1 - Math.min(1, layer));
  return 1 + (.07 + .25 * side) / (1 + layer);
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

// A cue is the interval from the first movement to the bent pose, then
// from the first release of its edge to the mature pose. The intervals may
// overlap. All four marks are on the *stem's* clock, not the camera clock.
type Cue = readonly [lift: number, hinged: number, release: number, finish: number];
type Part = { layer: number; offset: number; blades?: readonly unknown[] };

export function bloomPetalScore(key: SpeciesKey, parts: Part[], phase: number, count: number, focal: boolean) {
  const guard = leadingGuard(key, phase, count);
  if (key === 'rose') {
    // Keep the approved guard peel, including the closer focal timing.
    const peak = hingePeak(key);
    const clocks = parts.map(({ layer, offset }, i) => i === guard ? [0, focal ? 2.38 : 1.88] : [
      offset + petalWave(key, layer, i, phase) * (focal ? .42 : 1),
      petalPace(key, layer, i, phase) * (focal && layer > 0 ? 1.34 : 1),
    ]);
    return (weights: number[], time: number, i: number) => {
      const [start, pace] = clocks[i];
      foldWeights(weights, clamp(petalOpening(time, start) * pace), peak);
    };
  }

  if (key === 'hydrangea' || key === 'billyButton') {
    const hydrangea = key === 'hydrangea';
    const petals = parts.map(({ layer }) => hydrangea
      ? [.32 + .08 * layer, .69 + .08 * layer]
      : [.34 + .13 * (layer - 1), .79 + .13 * (layer - 1)]);
    const hasFlorets = parts.map(p => !!p.blades?.length);
    return (weights: number[], time: number, i: number) => {
      // Identical travel for the scaffold AND its passengers. The difference
      // between the floret's bent and open shapes is zero at its socket.
      const travel = beat(time, .025, hydrangea ? .38 : .48);
      const [release, finish] = petals[i];
      weights[0] = 1 - travel;
      weights[1] = hasFlorets[i] ? travel * (1 - beat(time, release, finish)) : 0;
    };
  }

  const lastLayer = Math.max(1, ...parts.map(p => p.layer));
  const localOrder = new Map<number, number>();
  const front = Math.cos(phase) >= 0 ? 0 : 1;
  const cues = parts.map(({ layer, offset, blades }, i): Cue[] => {
    const order = localOrder.get(layer) ?? 0;
    localOrder.set(layer, order + 1);
    const depth = layer / lastLayer;
    const hand = .5 + .5 * Math.cos(phase + i * 2.39996);
    const variation = .065 * hand + offset * .45;
    const rate = .024 * hand / (1 + layer);
    const relay = (from: number, hinged: number, release: number, finish: number, lag = variation): Cue => [
      from + lag, hinged + lag - rate, release + lag, Math.min(1, finish + lag - rate),
    ];
    switch (key) {
      case 'tulip': // One guard breaks the cup; the inner sails keep their rim high.
        return [i === guard ? [0, .24, .26, .63] : layer ? relay(.28, .58, .60, .92) : relay(.11, .40, .43, .77)];
      case 'lily': // Long tepals arch before the last tip turns out of the throat.
        return [i === guard ? [0, .30, .38, .74] : relay(.12 + .09 * depth, .40 + .12 * depth, .42 + .16 * depth, .76 + .13 * depth)];
      case 'calla': // One continuous sheet: the outer lap falls, then the quill gives.
        return [[0, .31, .45, .92]];
      case 'poppy': // A short tear in the seam, then crumpled silk loosens in fits.
        return [i === guard ? [0, .21, .15, .60] : relay(.07, .37, .29, .76, variation + .024 * ((i - guard + count) % count))];
      case 'orchid': // The moth's two wings do not leave the column together.
        if (layer === 1 && blades?.length === 2) {
          const lead: Cue = [0, .27, .29, .69], answer: Cue = [.19, .49, .52, .87];
          return front ? [answer, lead] : [lead, answer];
        }
        return [layer === 0 ? [.025, .34, .33, .73] : [.33, .62, .59, .95]];
      case 'iris': // Standards stay cupped above the falls as the beard is exposed.
        return [layer === 0 ? [.025, .33, .34, .78] : [.13, .47, .52, .95]];
      case 'dahlia': // A few outer rolls part first; the inner tubes answer in bands.
        return [relay(.025 + .27 * depth, .26 + .25 * depth, .31 + .26 * depth, .59 + .31 * depth,
          .051 * ((order + front) % 3) * (1 - .45 * depth) + variation * .25)];
      case 'ranunculus': // Thin overlapping rims separate in a slower nested ripple.
        return [relay(.015 + .37 * depth, .33 + .27 * depth, .23 + .36 * depth, .65 + .32 * depth, variation * .31)];
      case 'anemone': // Reveal the eye without moving its supporting throat.
        return [[.025, .30, .27, .81]];
      case 'sunflower': // Interleaved ray cohorts open from the broad outer skirt in.
        return [relay(.012 + .15 * depth, .27 + .20 * depth, .30 + .19 * depth, .63 + .20 * depth,
          .033 * ((order + front) % 5) + variation * .28)];
      case 'daisy': // A lighter, quicker shiver passes through the narrow white rays.
        return [relay(.01 + .16 * depth, .19 + .19 * depth, .19 + .18 * depth, .51 + .23 * depth,
          .044 * ((order * 2 + front) % 5) + variation * .31)];
      case 'cosmos': { // A broad scalloped fan; adjacent rays follow the first blade.
        const first = (Math.round((.95 - phase) * count / (2 * Math.PI)) % count + count) % count;
        const steps = (i - first + count) % count;
        return [relay(.015, .25, .29, .68, .028 * steps + variation * .2)];
      }
    }
  });

  return (weights: number[], time: number, i: number) => {
    const tracks = cues[i];
    for (let j = 0; j < tracks.length; j++) {
      const [start, hinge, release, finish] = tracks[j];
      const lift = beat(time, start, hinge);
      const curled = 1 - beat(time, release, finish);
      // Each pair owns a disjoint domain (normally the entire mesh). Keep
      // interpolation convex *in each domain*, so the other pose can't push
      // a tip past its attachment or sweep it through the support.
      weights[2 * j] = (1 - lift) * curled;
      weights[2 * j + 1] = lift * curled;
    }
  };
}

// Smooth bend in the flexible length only: the cut ends and binding never
// slide apart. The same displacement drives stem, head, and foliage sockets.
export const flexAt = (y: number, tipY: number) => ease((y + 1.9) / (tipY + 1.9));
