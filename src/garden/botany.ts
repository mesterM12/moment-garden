/* Seeded botanical recipes. No meshes, photographs, or fixed color palettes. */
import { arrangeCut, floristGesture } from './florist';
import * as varieties from './botany-varieties';
import type { BouquetPlan, ExpandedBouquetPlan, FlowerRecipe, HeadEnvelope, OriginalSpeciesKey, PetalPalette, PetalPattern, Random, Range, SpeciesKey, Specimen, StemEntry } from './types';

type Role = 'f' | 'c' | 'a' | 'e';
type Swatch = [name: string, hue: number | null, saturation: number, lightness: number];
interface Arrangement {
  id: string;
  label: string;
  foliage: [leaves: number, scale: number];
  slots: [role: Role, x: number, y: number, z: number][];
}
interface ColorStory {
  id: string;
  label: string;
  names: string[];
  tie: ExpandedBouquetPlan['tie'];
  swatches: Swatch[];
}
interface Cultivar { key: SpeciesKey; pattern: PetalPattern; palette: PetalPalette }
const isSpecies = (key: string): key is SpeciesKey => Object.hasOwn(species, key);

// Version 1 depends on both the values and the insertion order of these recipes.
const originalSpecies: Record<OriginalSpeciesKey, FlowerRecipe> = {
  daisy: { label: 'Daisy', count: [19, 27], layers: [1, 2], length: 1.35, width: 0.14, shrink: 0.12, lift: 0.055, open: 0.04, curl: 0.03, cup: 0.04, shape: 0.48, ruffle: 0.008, disk: 0.35, center: 'gold', leaf: 'slender', tilt: 1.12 },
  sunflower: { label: 'Sunflower', count: [23, 31], layers: [2, 3], length: 1.18, width: 0.18, shrink: 0.10, lift: 0.045, open: 0.02, curl: -0.03, cup: 0.07, shape: 0.85, ruffle: 0.013, disk: 0.66, center: 'seeds', leaf: 'broad', tilt: 1.14 },
  poppy: { label: 'Poppy', count: [4, 6], layers: [1, 1], length: 1.45, width: 0.86, shrink: 0, lift: 0.07, open: -0.18, curl: 0.20, cup: 0.24, shape: 0.38, ruffle: 0.085, disk: 0.23, center: 'poppy', leaf: 'serrated', tilt: 1.00 },
  tulip: { label: 'Tulip', count: [3, 3], layers: [2, 2], length: 1.65, width: 0.65, shrink: 0.065, lift: 0.09, open: -0.92, curl: 0.18, cup: 0.35, shape: 0.42, ruffle: 0.012, disk: 0.15, center: 'stamens', leaf: 'strap', tilt: 0.36 },
  rose: { label: 'Rose', count: [7, 9], layers: [5, 6], length: 1.32, width: 0.64, shrink: 0.14, lift: 0.12, open: -0.15, curl: -0.12, cup: 0.26, shape: 0.35, ruffle: 0.04, disk: 0.06, center: 'hidden', leaf: 'serrated', tilt: 0.92 },
  dahlia: { label: 'Dahlia', count: [13, 17], layers: [5, 6], length: 1.40, width: 0.24, shrink: 0.13, lift: 0.09, open: 0.04, curl: 0.12, cup: 0.24, shape: 0.9, ruffle: 0.008, disk: 0.12, center: 'gold', leaf: 'serrated', tilt: 1.10 },
  lily: { label: 'Lily', count: [3, 3], layers: [2, 2], length: 1.70, width: 0.42, shrink: 0.04, lift: 0.065, open: -0.08, curl: -0.55, cup: 0.16, shape: 0.85, ruffle: 0.02, disk: 0.13, center: 'stamens', leaf: 'slender', tilt: 0.95 },
  cosmos: { label: 'Cosmos', count: [8, 8], layers: [1, 1], length: 1.45, width: 0.49, shrink: 0, lift: 0.04, open: -0.03, curl: -0.06, cup: 0.09, shape: 0.30, ruffle: 0.025, disk: 0.24, center: 'gold', leaf: 'slender', tilt: 1.12 },
};
const species = { ...originalSpecies, ...varieties.species };
const originalPigments: Record<OriginalSpeciesKey, Range[]> = {
  daisy: [[0, 12], [315, 355], [265, 295]], sunflower: [[32, 54], [15, 30]],
  poppy: [[0, 22], [330, 355], [25, 42]], tulip: [[0, 18], [320, 355], [35, 55], [275, 305]],
  rose: [[345, 365], [315, 340], [20, 40]], dahlia: [[0, 20], [315, 350], [265, 290], [25, 50]],
  lily: [[325, 355], [15, 40], [40, 55]], cosmos: [[315, 350], [275, 305]],
};
const pigmentRanges = { ...originalPigments, ...varieties.pigmentRanges };
function seededRandom(seed: number): Random {
  let state = seed >>> 0;
  return () => {
    state += 0x6D2B79F5;
    let value = Math.imul(state ^ (state >>> 15), 1 | state);
    value ^= value + Math.imul(value ^ (value >>> 7), 61 | value);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}
const wrap = (value: number) => ((value % 360) + 360) % 360;
function hsl(h: number, s: number, l: number) { return `hsl(${wrap(h).toFixed(2)}, ${s.toFixed(2)}%, ${l.toFixed(2)}%)`; }
function createSpecimen(timestamp: number, kind = 'random', mood = 'random'): Specimen {
  const random = seededRandom(timestamp ^ Math.floor(timestamp / 4294967296));
  const keys = Object.keys(originalSpecies).filter(isSpecies);
  const key = isSpecies(kind) ? kind : keys[Math.floor(random() * keys.length)];
  const recipe = species[key];
  // Species-aware pigment ranges: no cyan sunflowers or green roses.
  const range = pigmentRanges[key][Math.floor(random() * pigmentRanges[key].length)];
  let hue = range[0] + random() * (range[1] - range[0]);
  let saturation = 58 + random() * 30;
  let lightness = 40 + random() * 20;
  const ivory = random() < (key === 'daisy' ? 0.65 : 0.18) && key !== 'sunflower';
  if (ivory) { hue = 35 + random() * 15; saturation = 25 + random() * 25; lightness = 88 + random() * 7; }
  if (mood === 'pastel' && !ivory) { saturation *= 0.75; lightness = 70 + random() * 10; }
  if (mood === 'vivid' && !ivory) { saturation = 83 + random() * 15; lightness = 43 + random() * 12; }
  const pattern = key === 'lily' ? 'speckled' : random() < 0.15 && ['tulip', 'dahlia', 'rose'].includes(key) ? 'picotee' : 'gradient';
  const tipHue = hue + (random() - 0.5) * 12;
  const colorNames = ['Ruby', 'Tangerine', 'Marigold', 'Citron', 'Meadow', 'Jade', 'Lagoon', 'Azure', 'Iris', 'Violet', 'Orchid', 'Berry'];
  const colorName = ivory ? 'Ivory' : lightness > 73 ? `Pastel ${colorNames[Math.floor(wrap(hue) / 30)]}` : colorNames[Math.floor(wrap(hue) / 30)];
  const palette = {
    name: colorName,
    base: hsl(hue, saturation, lightness),
    tip: hsl(tipHue, Math.max(25, saturation - 12), Math.min(94, lightness + (key === 'sunflower' ? 7 : 16))),
    root: hsl(hue - 13, saturation, Math.max(18, lightness - 22)),
    fleck: hsl(hue - 15, saturation, 22),
  };
  return shapeSpecimen(timestamp, random, key, recipe, palette, pattern, mood);
}
function shapeSpecimen(timestamp: number, random: Random, key: SpeciesKey, recipe: FlowerRecipe, palette: PetalPalette, pattern: PetalPattern, mood: string): Specimen {
  const integer = (range: Range) => range[0] + Math.floor(random() * (range[1] - range[0] + 1));
  return {
    timestamp, random, palette, key, recipe, pattern, mood,
    name: `${palette.name} ${recipe.label}`,
    count: integer(recipe.count), layers: integer(recipe.layers),
    length: recipe.length * (0.94 + random() * 0.12),
    width: recipe.width * (0.94 + random() * 0.12),
    bend: (random() - 0.5) * 0.46,
    rotation: random() * Math.PI * 2,
    greenHue: 85 + random() * 50,
  };
}
function createOriginalBouquet(timestamp: number): BouquetPlan {
  const random = seededRandom(timestamp ^ Math.floor(timestamp / 4294967296));
  const keys = Object.keys(originalSpecies).filter(isSpecies);
  // Three complementary roles: focal blooms, secondary blooms, airy accents.
  const focal = pick<SpeciesKey>(random, ['rose', 'dahlia', 'sunflower', 'tulip']);
  const secondaryOptions = keys.filter(key => key !== focal && key !== 'sunflower');
  const secondary = secondaryOptions[Math.floor(random() * secondaryOptions.length)];
  const accents: SpeciesKey[] = ['daisy', 'cosmos', 'poppy'];
  const accent = accents.filter(key => key !== secondary);
  const filler = accent[Math.floor(random() * accent.length)];
  const mood = random() < 0.4 ? 'pastel' : 'random';
  const count = 7 + Math.floor(random() * 3);
  const names = ['Gathered Light', 'Sunday Morning', 'A Little Wild', 'For No Reason', 'Softly, Yours', 'The Long Way Home'];
  // Back row, middle row, and front row keep each silhouette legible.
  const slots = [
    [-1.25, 1.8, -0.36], [0.0, 2.4, -0.65], [1.3, 1.9, -0.40],
    [-1.8, 0.75, 0.05], [-0.5, 1.2, 0.45], [1.0, 0.85, 0.65],
    [-1.0, -0.15, 1.0], [0.5, -0.35, 1.15], [1.9, 0.0, 0.55],
  ];
  const flowers = Array.from({ length: count }, (_, i) => {
    const kind = i === 1 || i === 4 || i === 5 ? focal : i % 3 === 0 ? filler : secondary;
    const flower = createSpecimen(timestamp + (i + 1) * 104729, kind, mood);
    // Repeated stems share a cultivar; surprise happens at bouquet level.
    const cultivar = createSpecimen(timestamp + (keys.indexOf(kind) + 1) * 15485863, kind, mood);
    flower.palette = { ...cultivar.palette };
    flower.pattern = cultivar.pattern;
    const slot = slots[i];
    return {
      specimen: flower,
      position: slot.map((value, axis) => value + (random() - 0.5) * (axis === 2 ? 0.15 : 0.20)),
      scale: (kind === focal ? 0.67 : 0.50) * (0.92 + random() * 0.13),
      delay: random() * 0.1,
      turn: slot[0] * 0.09 + (random() - 0.5) * 0.10,
    };
  });
  return { timestamp, name: names[Math.floor(random() * names.length)], flowers, kinds: [...new Set(flowers.map(f => f.specimen.key))] };
}
// V2's silhouettes are independent of its color stories. Slots run from the
// signature seven to up to three extras, in x/y/depth with a botanical role.
const arrangements: Arrangement[] = [
  { id: 'fan', label: 'Open Fan', foliage: [3, .51], slots: [
    ['f', -1.07, 1.65, -.33], ['f', .57, 2.05, -.54], ['c', 1.69, 1.20, -.12],
    ['c', -.19, .75, .39], ['c', 1.06, .15, .55], ['a', -1.70, .73, .20], ['a', -.74, -.19, .78],
    ['a', .63, 1.04, .27], ['e', -.07, 2.71, -.64], ['a', 1.82, .31, .39],
  ] },
  { id: 'cascade', label: 'Side Sweep', foliage: [2, .45], slots: [
    ['f', 1.08, 1.98, -.42], ['f', -.50, 1.42, -.36], ['c', .38, .90, .32],
    ['c', -1.70, .58, .20], ['c', -.78, -.25, .64], ['a', 1.75, 1.18, -.20], ['a', .32, 2.59, -.66],
    ['a', 1.48, .39, .41], ['e', -1.89, -.27, .50], ['a', -.26, .10, .72],
  ] },
  { id: 'spire', label: 'High Spire', foliage: [2, .57], slots: [
    ['f', .14, 2.17, -.58], ['f', -.63, 1.11, -.10], ['c', 1.13, 1.24, -.26],
    ['c', .44, .39, .49], ['c', -1.01, -.04, .55], ['a', .84, 2.42, -.51], ['a', -1.46, .70, .18],
    ['a', -.50, 2.42, -.58], ['e', 1.41, .43, .28], ['a', .02, -.51, .68],
  ] },
  { id: 'posy', label: 'Round Posy', foliage: [3, .61], slots: [
    ['f', -.62, 1.63, -.39], ['f', .52, .88, .34], ['c', .67, 1.91, -.49],
    ['c', -1.57, .82, .07], ['c', -.45, .15, .55], ['a', 1.47, .87, .07], ['a', .64, -.27, .68],
    ['a', .08, 2.48, -.52], ['e', 1.33, .14, .42], ['a', -1.31, -.06, .47],
  ] },
  { id: 'meadow', label: 'Loose Meadow', foliage: [2, .50], slots: [
    ['f', -.25, 1.76, -.42], ['f', .90, .72, .28], ['c', -1.55, 1.29, -.30],
    ['c', 1.58, 1.84, -.39], ['c', -.79, .42, .42], ['a', -.91, 2.44, -.66], ['a', .12, -.42, .67],
    ['a', 1.72, .04, .44], ['e', .78, 2.50, -.58], ['a', -1.57, -.31, .58],
  ] },
];

// A swatch carries preferred hue, saturation and lightness. Null hue means
// near-white; only naturally white cultivars are candidates for that swatch.
// The fourth swatch is reserved for a contrasting stem in the fuller cuts.
const colorStories: ColorStory[] = [
  { id: 'rosewater', label: 'Rosewater', names: ['A Small Kindness', 'With Love', 'Remember This'], tie: { style: 'bow', color: '#bd7f85' }, swatches: [
    ['Blush', 345, 55, 73], ['Cream', null, 31, 91], ['Berry', 329, 70, 54], ['Shell Pink', 352, 68, 82],
  ] },
  { id: 'golden-hour', label: 'Golden Hour', names: ['The Last Light', 'Warm as You', 'A Sunny Place'], tie: { style: 'twine', color: '#a66e45' }, swatches: [
    ['Marigold', 43, 86, 54], ['Persimmon', 21, 83, 55], ['Honey', 48, 67, 63], ['Rust', 13, 67, 47],
  ] },
  { id: 'blue-hour', label: 'Blue Hour', names: ['Somewhere Quiet', 'Under the Same Sky', 'The Hour Before'], tie: { style: 'wrap', color: '#716e98' }, swatches: [
    ['Periwinkle', 235, 63, 66], ['Violet', 269, 57, 62], ['Porcelain', null, 22, 93], ['Mauve', 302, 49, 69],
  ] },
  { id: 'fig-and-honey', label: 'Fig & Honey', names: ['A Good Surprise', 'The Long Way Home', 'Wish You Were Here'], tie: { style: 'twine', color: '#bc973f' }, swatches: [
    ['Mulberry', 312, 68, 46], ['Apricot', 27, 82, 66], ['Buttercup', 49, 86, 60], ['Fuchsia', 328, 75, 62],
  ] },
  { id: 'lilac-orchard', label: 'Lilac Orchard', names: ['All the Little Things', 'A Little Wild', 'An Afternoon Together'], tie: { style: 'bow', color: '#987da9' }, swatches: [
    ['Lavender', 280, 54, 72], ['Orchid Pink', 319, 61, 72], ['Lilac', 268, 58, 76], ['Cream', null, 30, 89],
  ] },
  { id: 'candlelight', label: 'Candlelight', names: ['An Unsaid Thing', 'Just Because', 'Yours, Always'], tie: { style: 'wrap', color: '#8a484e' }, swatches: [
    ['Claret', 354, 78, 46], ['Soft Peach', 26, 69, 72], ['Chalk', null, 21, 92], ['Pomegranate', 342, 70, 48],
  ] },
  { id: 'glasshouse', label: 'Glasshouse', names: ['Here With You', 'A Place in the Sun', 'Sunday Morning'], tie: { style: 'bow', color: '#72835e' }, swatches: [
    ['Ivory', null, 30, 91], ['Plum', 298, 67, 53], ['Citron', 53, 82, 69], ['Peach', 24, 66, 73],
  ] },
];
const roles: Record<Role, SpeciesKey[]> = {
  f: ['rose', 'dahlia', 'sunflower', 'ranunculus', 'iris', 'hydrangea', 'tulip', 'orchid', 'calla'],
  c: ['tulip', 'lily', 'poppy', 'orchid', 'iris', 'calla', 'hydrangea', 'anemone', 'ranunculus'],
  a: ['daisy', 'cosmos', 'billyButton', 'anemone', 'poppy'],
  e: ['daisy', 'cosmos', 'billyButton', 'anemone', 'poppy'],
};
const whiteCultivars = ['daisy', 'tulip', 'rose', 'dahlia', 'lily', 'cosmos', 'ranunculus', 'calla', 'orchid', 'iris', 'hydrangea', 'anemone'];
const pick = <T>(random: Random, values: readonly T[]): T => values[Math.floor(random() * values.length)];
const clampTo = (value: number, start: number, end: number) => Math.max(start, Math.min(end, value));

function closestPigment(hue: number, ranges: readonly Range[]) {
  let best = hue, distance = Infinity;
  for (const [low, high] of ranges) {
    for (const target of [hue - 360, hue, hue + 360]) {
      const clamped = clampTo(target, low, high);
      const delta = Math.abs(target - clamped);
      if (delta < distance) { best = clamped; distance = delta; }
    }
  }
  return { hue: best, distance };
}

function chooseCultivar(random: Random, role: Role, swatch: Swatch, used: Set<SpeciesKey>, arrangement: string): Cultivar {
  const options = roles[role].filter(key => Object.hasOwn(species, key) && !used.has(key));
  const [name, hue, saturation, lightness] = swatch;
  const candidates = options.map(key => {
    const ivory = hue === null && whiteCultivars.includes(key);
    const pigment = ivory ? { hue: 46, distance: 0 } : closestPigment(hue ?? 45, pigmentRanges[key]);
    const mismatch = hue === null && !ivory ? 65 : pigment.distance;
    // Taller heads suit the central high line; radial or clustered blooms suit a posy.
    const bias = role === 'f' && (arrangement === 'spire' && ['calla', 'iris', 'tulip'].includes(key)
      || arrangement === 'posy' && ['rose', 'ranunculus', 'dahlia', 'hydrangea'].includes(key)) ? 13 : 0;
    return { key, ivory, score: mismatch - bias + random() * 38 };
  });
  candidates.sort((a, b) => a.score - b.score);
  const { key, ivory } = candidates[0];
  const cultivarHue = ivory ? 38 + random() * 17 : closestPigment((hue ?? 45) + (random() - .5) * 16, pigmentRanges[key]).hue;
  const sat = (ivory || hue !== null ? saturation : 76) + (random() - .5) * 12;
  const light = (ivory || hue !== null ? lightness : 64) + (random() - .5) * 10;
  const colorName = hue === null && !ivory ? 'Golden' : name;
  const variation = random();
  const pattern = key === 'lily' ? 'speckled' : variation < .26 && ['ranunculus', 'orchid', 'calla', 'iris', 'tulip', 'dahlia', 'rose'].includes(key) ? 'picotee' : 'gradient';
  return { key, pattern, palette: {
    name: colorName,
    base: hsl(cultivarHue, sat, light),
    tip: hsl(cultivarHue + (random() - .5) * 10, Math.max(18, sat - 12), Math.min(97, light + (ivory ? 5 : 13))),
    root: hsl(cultivarHue - 10, sat, Math.max(18, light - (ivory ? 13 : 20))),
    fleck: hsl(cultivarHue - 15, sat, 24),
  } };
}

export const ROSE_HEAD_PROFILE = [1.48, .76, .28] as const;

// Conservative mature-head spheroids measured from the renderer's meshes.
// [radial radius, axial half-height, axial center offset], in local head units.
const headProfiles: Record<SpeciesKey, readonly [radius: number, halfHeight: number, offset: number]> = {
  daisy: [2.08, .39, .07], sunflower: [2.08, .49, .07], poppy: [1.87, .76, .49], tulip: [1.24, 1.36, 1],
  rose: ROSE_HEAD_PROFILE, dahlia: [1.57, .99, .38], lily: [2.25, 1.08, -.09], cosmos: [2.08, .36, .07],
  ranunculus: [1.48, .73, .36], calla: [1.30, 1.56, 1.20], orchid: [1.47, .64, .28], iris: [1.68, 1.34, .07],
  hydrangea: [1.58, 1.13, .24], anemone: [1.34, .48, .12], billyButton: [.62, .81, .40],
};

function headEnvelope(entry: StemEntry): HeadEnvelope {
  const { position, scale, turn, tiltOffset = 0, specimen } = entry;
  const [radius, halfHeight, offset] = headProfiles[specimen.key];
  const tilt = specimen.recipe.tilt + tiltOffset, roll = -turn * .5;
  // The renderer applies an XYZ Euler rotation. Only the local Y axis matters.
  const tx = -Math.sin(roll) * Math.cos(turn), ty = Math.cos(roll), tz = Math.sin(roll) * Math.sin(turn);
  const axis = [tx, ty * Math.cos(tilt) - tz * Math.sin(tilt), ty * Math.sin(tilt) + tz * Math.cos(tilt)];
  return { center: position.map((coord, i) => coord + axis[i] * offset * scale), axis, radius: radius * scale, halfHeight: halfHeight * scale };
}

const dot = (a: readonly number[], b: readonly number[]) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
function support(envelope: HeadEnvelope, direction: readonly number[]) {
  const along = dot(envelope.axis, direction);
  const { radius, halfHeight } = envelope;
  return Math.sqrt(radius ** 2 + (halfHeight ** 2 - radius ** 2) * along ** 2);
}

function fitsFrame(envelope: HeadEnvelope) {
  const { center: [x, y] } = envelope;
  return Math.abs(x) + support(envelope, [1, 0, 0]) <= 2.5
    && y + support(envelope, [0, 1, 0]) <= 3.35 && y - support(envelope, [0, 1, 0]) >= -1.63;
}

function hasRoom(a: HeadEnvelope, b: HeadEnvelope) {
  const delta = a.center.map((coord, i) => coord - b.center[i]);
  const length = Math.hypot(...delta);
  if (!length) return false;
  const direction = delta.map(coord => coord / length);
  // A separating plane along any of these normals proves there is a gap.
  const separated = [direction, a.axis, b.axis].some(normal =>
    Math.abs(dot(delta, normal)) >= support(a, normal) + support(b, normal) + .055);
  if (!separated) return false;
  // Keep both faces readable from the default front, not directly behind one another.
  const projected = [delta[0] + .10 * delta[2], delta[1] - .15 * delta[2], 0];
  const projectedLength = Math.hypot(projected[0], projected[1]);
  if (!projectedLength) return false;
  const front = projected.map(coord => coord / projectedLength);
  return projectedLength >= .73 * Math.max(support(a, front), support(b, front)) + .065;
}

// Try the original cut first, then the least disruptive adjustments to the
// stem insertion. A second, slightly smaller cut repacks from scratch if a
// dense mix cannot be fitted at full scale, rather than dropping a stem.
const placementTrials: { dx: number; dy: number; dz: number; scale: number; cost: number }[] = [];
for (const dx of [0, .15, -.15, .31, -.31, .48, -.48]) {
  for (const dy of [0, .14, -.14, .29, -.29, .44, -.44]) {
    for (const dz of [0, .26, -.26, .52, -.52]) {
      for (const scale of [1, .94, .86, .77]) {
        const cost = Math.hypot(dx, 1.16 * dy, .59 * dz) + (1 - scale) * 1.65;
        placementTrials.push({ dx, dy, dz, scale, cost });
      }
    }
  }
}
placementTrials.sort((a, b) => a.cost - b.cost);

function packHeads(flowers: StemEntry[], mirror: number): StemEntry[] {
  for (const multiplier of [1, .88, .76, .64]) {
    const packed: StemEntry[] = [], envelopes: HeadEnvelope[] = [];
    for (const [index, flower] of flowers.entries()) {
      const [x, y, z] = flower.position;
      for (const { dx, dy, dz, scale } of placementTrials) {
        const position = [x + dx * mirror, y + dy, z + dz];
        if (position[2] < -1.12 || position[2] > 1.13) continue;
        const candidate = { ...flower, position, scale: flower.scale * multiplier * scale };
        const envelope = headEnvelope(candidate);
        if (fitsFrame(envelope) && envelopes.every(other => hasRoom(envelope, other))) {
          packed.push(candidate);
          envelopes.push(envelope);
          break;
        }
      }
      if (packed.length === index) break;
    }
    if (packed.length === flowers.length) return packed;
  }
  throw new Error('The bouquet layout cannot fit its blooms.');
}

function createExpandedBouquet(timestamp: number): ExpandedBouquetPlan {
  const seed = (timestamp ^ Math.floor(timestamp / 4294967296)) ^ 0x8E7A5F21;
  const random = seededRandom(seed);
  const design = pick(random, arrangements);
  const story = pick(random, colorStories);
  const count = 7 + Math.floor(random() * 4);
  const mirror = random() < .5 ? -1 : 1;
  const spread = .93 + random() * .12;
  const height = .92 + random() * .11;
  const greens = 98 + random() * 25;
  const used = new Set<SpeciesKey>();
  const choose = (role: Role, index: number) => {
    const cultivar = chooseCultivar(random, role, story.swatches[index], used, design.id);
    used.add(cultivar.key);
    return cultivar;
  };
  const byRole: Record<Role, Cultivar> = { f: choose('f', 0), c: choose('c', 1), a: choose('a', 2), e: choose('e', 3) };
  const flowers = design.slots.slice(0, count).map(([role, x, y, z], i) => {
    const { key, palette, pattern } = byRole[role];
    const stemTimestamp = timestamp + (i + 1) * 104729;
    const recipe = species[key];
    const specimen = shapeSpecimen(stemTimestamp, seededRandom(seed ^ Math.imul(i + 1, 0x9E3779B1)), key, recipe, { ...palette }, pattern, story.id);
    specimen.greenHue = greens + (random() - .5) * 13;
    const position = [mirror * (x * spread + (random() - .5) * .15), y * height + (random() - .5) * .15, z + (random() - .5) * .14];
    const [radius] = headProfiles[key];
    const focal = role === 'f', companion = role === 'c';
    const upright = ['calla', 'iris', 'tulip'].includes(key);
    const width = (focal ? .79 : companion ? .62 : .47) * (.91 + random() * .18);
    const preferred = upright ? (focal ? .67 : .54) * (.94 + random() * .12) : width / radius;
    const scale = Math.min(preferred, .68);
    const [leaves, foliage] = design.foliage;
    const leafCount = key === 'billyButton' ? 1 : Math.max(1, leaves - (recipe.leaf === 'strap' || !focal && !companion ? 1 : 0));
    const leafScale = foliage * (.89 + random() * .22);
    const tiltOffset = (random() - .5) * (upright ? .08 : .17);
    return { specimen, position, scale, delay: random() * .1, turn: position[0] * .09 + (random() - .5) * .13, leafCount, leafScale, tiltOffset };
  });
  return {
    timestamp, version: 2, name: pick(random, story.names), flowers: packHeads(flowers, mirror), kinds: [...new Set(flowers.map(f => f.specimen.key))],
    arrangement: { id: design.id, label: design.label }, palette: { id: story.id, label: story.label }, tie: { ...story.tie },
  };
}

function createFloristBouquet(timestamp: number): ExpandedBouquetPlan {
  const seed = timestamp ^ Math.floor(timestamp / 4294967296) ^ 0x51ed2b79;
  const random = seededRandom(seed), g = floristGesture(random);
  const story = pick(random, colorStories), greens = 95 + random() * 28;
  const used = new Set<SpeciesKey>();
  const cultivars = (['f', 'c', 'a', 'e'] as const).map((role, index) => {
    const cultivar = chooseCultivar(random, role, story.swatches[index], used, g.width < 1.48 ? 'spire' : 'posy');
    used.add(cultivar.key);
    return cultivar;
  });
  const companions = 2 + Math.floor(random() * 2);
  const entries = Array.from({ length: g.count }, (_, i) => {
    const which = !i ? 0 : i <= companions ? 1 : i === g.count - 1 && g.count > 8 ? 3 : 2;
    const { key, palette, pattern } = cultivars[which];
    const specimen = shapeSpecimen(timestamp + (i + 1) * 104729, seededRandom(seed ^ Math.imul(i + 1, 0x9e3779b1)), key, species[key], { ...palette }, pattern, story.id);
    specimen.greenHue = greens + (random() - .5) * 15;
    const radius = !i ? .92 + .20 * random() : which === 1 ? .48 + .18 * random() : .27 + .18 * random();
    return { specimen, position: [0, 0, 0], scale: radius / headProfiles[key][0],
      delay: random() * .08, turn: (random() - .5) * (i ? 1.20 : .5),
      tiltOffset: (!i ? .12 : -.10) + (random() - .5) * (i ? .86 : .30),
      leafCount: which > 1 ? 1 : 2 + Math.floor(random() * 2), leafScale: .44 + random() * .22 };
  });
  // The cut (including repair and its random draws) belongs to the gift.
  // Dress those *same sockets* afterwards, rather than repacking old links.
  const flowers = arrangeCut(entries, companions, g, random, headEnvelope, fitsFrame, hasRoom);
  const focus = flowers[0], key = focus.specimen.key;
  const shoulder = Math.max(...flowers.slice(1, companions + 1).map(f => headEnvelope(f).radius));
  const full = headEnvelope(focus).radius;
  const breadth = key === 'hydrangea' || key === 'sunflower' ? 1.27 : key === 'calla' || key === 'tulip' ? 1.08 : 1.18;
  focus.scale *= Math.min(full * .73, shoulder * breadth + .035 * (full - 1)) / full;
  // Give the shoulder flowers a little body where there is already room.
  // Never move a stem or consume random numbers to earn a larger head.
  for (let i = 1; i <= companions; i++) {
    const flower = flowers[i];
    for (const factor of [1.12, 1.06]) {
      const grown = headEnvelope({ ...flower, scale: flower.scale * factor });
      if (fitsFrame(grown) && flowers.every((other, j) => j === i || hasRoom(grown, headEnvelope(other)))) {
        flower.scale *= factor; break;
      }
    }
  }
  // Trace the actual outside shoulders, with a low counterweight and a long
  // back line. Greenery shouldn't give every design the same outer contour.
  const sprays: NonNullable<ExpandedBouquetPlan['sprays']> = [];
  for (let i = 0; i < 3 + Number(g.loose < .68); i++) {
    const sign = (i % 2 ? -1 : 1) * Math.sign(g.slope);
    const shoulder = flowers.slice(1).reduce((a, b) =>
      b.position[0] * sign + .38 * b.position[1] > a.position[0] * sign + .38 * a.position[1] ? b : a);
    const [x, y] = shoulder.position;
    sprays.push([clampTo(x * (i < 2 ? 1.24 : .79) + sign * random() * .34, -2.22, 2.22),
      clampTo(y + 1.9 + (i < 2 ? -.67 : .43) + random() * .63, 2.05, 4.77), -1.04 - random() * .57]);
  }
  return { timestamp, version: 3, name: pick(random, story.names), flowers, kinds: [...new Set(flowers.map(f => f.specimen.key))],
    arrangement: { id: 'hand-tied', label: 'Hand-tied' }, palette: { id: story.id, label: story.label }, tie: { ...story.tie }, sprays };
}

function createBouquet(timestamp: number, version?: 2 | 3): ExpandedBouquetPlan;
function createBouquet(timestamp: number, version: 1): BouquetPlan;
function createBouquet(timestamp: number, version: number): BouquetPlan | ExpandedBouquetPlan;
function createBouquet(timestamp: number, version = 2): BouquetPlan | ExpandedBouquetPlan {
  if (version === 1) return createOriginalBouquet(timestamp);
  if (version === 2) return createExpandedBouquet(timestamp);
  if (version === 3) return createFloristBouquet(timestamp);
  throw new RangeError('Unsupported bouquet version.');
}

export { species, createSpecimen, createBouquet, headEnvelope };
