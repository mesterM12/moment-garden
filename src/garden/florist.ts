import type { HeadEnvelope, Random, StemEntry } from './types';

// A cut is described by two axes of growth, not a list of insertion slots.
// The crown rises on the long side and falls toward the second, shorter arm.
export function floristGesture(r: Random) {
  const reach = r(), loose = r(), side = r() < .5 ? -1 : 1;
  return {
    width: .78 + 1.47 * reach,
    rise: .50 + 1.36 * (1 - reach) + .24 * r(),
    waist: -.04 + 1.03 * (1 - reach) + .44 * r(),
    lean: side * (.12 + 1.04 * r()), slope: side * (.10 + 1.09 * r()),
    loose, depth: .58 + .65 * r(), phase: r() * 2 * Math.PI,
    count: Math.min(10, 7 + Math.floor((1 - loose) * 3 + 1.65 * r())),
  };
}
type Gesture = ReturnType<typeof floristGesture>;
type Measure = (entry: StemEntry) => HeadEnvelope;
type Clearance = (a: HeadEnvelope, b: HeadEnvelope) => boolean;
const clamp = (n: number, min: number, max: number) => Math.max(min, Math.min(max, n));

// Companions turn around one shoulder; fine accents continue the line across
// the opposite shoulder. Each proposed socket has real depth and an attitude.
export function arrangeCut(entries: StemEntry[], echoes: number, g: Gesture, r: Random, measure: Measure,
  fits: (e: HeadEnvelope) => boolean, clear: Clearance) {
  const placed: StemEntry[] = [], hulls: HeadEnvelope[] = [];
  const arc = 1.45 + 1.4 * r();
  const focusX = clamp(g.lean * .58 + (r() - .5) * 1.4, -1.05, 1.05);
  const focusY = clamp(g.waist + (r() - .52) * g.rise, -.24, 1.17);
  const spin = r() < .5 ? -1 : 1;
  for (const [i, entry] of entries.entries()) {
    const companion = i > 0 && i <= echoes;
    const t = companion ? (i - 1) / Math.max(1, echoes - 1) : (i - echoes - 1) / Math.max(1, entries.length - echoes - 2);
    const target = g.phase + spin * (companion ? t * arc : arc + (.12 + .80 * t) * (2 * Math.PI - arc));
    let best: StemEntry | undefined, cost = Infinity;
    // First preserve the desired rhythm. If full-size cuts cannot fit, fan
    // out in depth/azimuth before trimming a companion. Never trim the focal.
    for (let trial = 0; trial < 144; trial++) {
      const repair = Math.floor(trial / 36);
      const theta = target + (r() - .5) * (.88 + repair * 1.75);
      const ring = (.77 + r() * .38) * (1 - repair * .035);
      const u = Math.cos(theta) * ring, v = Math.sin(theta) * ring;
      // The line narrows as it rises. Late repair is a bounded free cut in
      // the crown's volume, not another trip around the same crowded arc.
      const x = !i ? focusX : repair === 3 ? (r() - .5) * 4 : g.lean * (.48 + v * .62) + u * g.width * (1 - .28 * v);
      const y = !i ? focusY : repair === 3 ? -.83 + 3.35 * r() : g.waist + v * g.rise + g.slope * u;
      const z = i ? -.16 - g.depth * (.56 * v + .28 * Math.cos(theta - g.phase)) + (r() - .5) * (.58 + repair * .27) : .83;
      const candidate = { ...entry, position: [x, y, clamp(z, -1.45, 1.16)],
        scale: entry.scale * (i ? 1 - .10 * repair : 1), turn: entry.turn + x * .25 };
      const h = measure(candidate);
      if (!fits(h) || !hulls.every(other => clear(h, other))) continue;
      // Discourage two centres in almost the same line of sight. Leave the
      // foreground flower its own patch of sky; some companion overlap is good.
      let overlap = 0;
      for (const [j, other] of hulls.entries()) {
        const dx = h.center[0] - other.center[0], dy = h.center[1] - other.center[1], dz = h.center[2] - other.center[2];
        const distance = Math.hypot(dx - .1 * dz, dy - .17 * dz);
        overlap += Math.max(0, (h.radius + other.radius) * (j === 0 ? .94 : .79) - distance) ** 2;
      }
      const score = Math.abs(theta - target) * .48 + Math.abs(ring - .94) + overlap * 6 + repair * .82;
      if (score < cost) { cost = score; best = candidate; }
      if (!i || (trial % 36 === 35 && cost < (repair + 1) * .82)) break;
    }
    if (!best) return safeCut(entries, g.lean < 0 ? -1 : 1);
    placed.push(best); hulls.push(measure(best));
  }
  return placed;
}

// Last resort, independent of search success. Radius <= .44 for satellites;
// also separate rows in depth so tall spathes do not intersect the next row.
function safeCut(entries: StemEntry[], sign: number) {
  return entries.map((flower, i) => {
    if (!i) return { ...flower, position: [0, .66, 1.08] };
    const a = (i - 1) / (entries.length - 1) * 2 * Math.PI;
    return { ...flower, position: [sign * 1.85 * Math.cos(a), .83 + 1.38 * Math.sin(a), -.57 - .55 * Math.sin(a)], scale: flower.scale * .60 };
  });
}
