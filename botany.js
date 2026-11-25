/* Seeded botanical recipes. No meshes, photographs, or fixed color palettes. */
(function (root) {
  'use strict';
  const species = {
    daisy: { label: 'Daisy', count: [19, 27], layers: [1, 2], length: 1.35, width: 0.14, shrink: 0.12, lift: 0.055, open: 0.04, curl: 0.03, cup: 0.04, shape: 0.48, ruffle: 0.008, disk: 0.35, center: 'gold', leaf: 'slender', tilt: 1.12 },
    sunflower: { label: 'Sunflower', count: [23, 31], layers: [2, 3], length: 1.18, width: 0.18, shrink: 0.10, lift: 0.045, open: 0.02, curl: -0.03, cup: 0.07, shape: 0.85, ruffle: 0.013, disk: 0.66, center: 'seeds', leaf: 'broad', tilt: 1.14 },
    poppy: { label: 'Poppy', count: [4, 6], layers: [1, 1], length: 1.45, width: 0.86, shrink: 0, lift: 0.07, open: -0.18, curl: 0.20, cup: 0.24, shape: 0.38, ruffle: 0.085, disk: 0.23, center: 'poppy', leaf: 'serrated', tilt: 1.00 },
    tulip: { label: 'Tulip', count: [3, 3], layers: [2, 2], length: 1.65, width: 0.65, shrink: 0.065, lift: 0.09, open: -0.92, curl: 0.18, cup: 0.35, shape: 0.42, ruffle: 0.012, disk: 0.15, center: 'stamens', leaf: 'strap', tilt: 0.36 },
    rose: { label: 'Rose', count: [7, 9], layers: [5, 6], length: 1.32, width: 0.64, shrink: 0.14, lift: 0.12, open: -0.15, curl: -0.12, cup: 0.26, shape: 0.35, ruffle: 0.04, disk: 0.06, center: 'hidden', leaf: 'serrated', tilt: 0.92 },
    dahlia: { label: 'Dahlia', count: [13, 17], layers: [5, 6], length: 1.40, width: 0.24, shrink: 0.13, lift: 0.09, open: 0.04, curl: 0.12, cup: 0.24, shape: 0.9, ruffle: 0.008, disk: 0.12, center: 'gold', leaf: 'serrated', tilt: 1.10 },
    lily: { label: 'Lily', count: [3, 3], layers: [2, 2], length: 1.70, width: 0.42, shrink: 0.04, lift: 0.065, open: -0.08, curl: -0.55, cup: 0.16, shape: 0.85, ruffle: 0.02, disk: 0.13, center: 'stamens', leaf: 'slender', tilt: 0.95 },
    cosmos: { label: 'Cosmos', count: [8, 8], layers: [1, 1], length: 1.45, width: 0.49, shrink: 0, lift: 0.04, open: -0.03, curl: -0.06, cup: 0.09, shape: 0.30, ruffle: 0.025, disk: 0.24, center: 'gold', leaf: 'slender', tilt: 1.12 },
  };
  function seededRandom(seed) {
    let state = seed >>> 0;
    return () => {
      state += 0x6D2B79F5;
      let value = Math.imul(state ^ (state >>> 15), 1 | state);
      value ^= value + Math.imul(value ^ (value >>> 7), 61 | value);
      return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
    };
  }
  const wrap = value => ((value % 360) + 360) % 360;
  function hsl(h, s, l) { return `hsl(${wrap(h).toFixed(2)}, ${s.toFixed(2)}%, ${l.toFixed(2)}%)`; }
  function createSpecimen(timestamp, kind = 'random', mood = 'random') {
    const random = seededRandom(timestamp ^ Math.floor(timestamp / 4294967296));
    const keys = Object.keys(species);
    const key = Object.hasOwn(species, kind) ? kind : keys[Math.floor(random() * keys.length)];
    const recipe = species[key];
    // Species-aware pigment ranges: no cyan sunflowers or green roses.
    const pigmentRanges = {
      daisy: [[0, 12], [315, 355], [265, 295]], sunflower: [[32, 54], [15, 30]],
      poppy: [[0, 22], [330, 355], [25, 42]], tulip: [[0, 18], [320, 355], [35, 55], [275, 305]],
      rose: [[345, 365], [315, 340], [20, 40]], dahlia: [[0, 20], [315, 350], [265, 290], [25, 50]],
      lily: [[325, 355], [15, 40], [40, 55]], cosmos: [[315, 350], [275, 305]],
    };
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
    const integer = range => range[0] + Math.floor(random() * (range[1] - range[0] + 1));
    return {
      timestamp, random, palette, key, recipe, pattern, mood,
      name: `${colorName} ${recipe.label}`,
      count: integer(recipe.count), layers: integer(recipe.layers),
      length: recipe.length * (0.94 + random() * 0.12),
      width: recipe.width * (0.94 + random() * 0.12),
      bend: (random() - 0.5) * 0.46,
      rotation: random() * Math.PI * 2,
      greenHue: 85 + random() * 50,
    };
  }
  function createBouquet(timestamp) {
    const random = seededRandom(timestamp ^ Math.floor(timestamp / 4294967296));
    const keys = Object.keys(species);
    // Three complementary roles: focal blooms, secondary blooms, airy accents.
    const focal = ['rose', 'dahlia', 'sunflower', 'tulip'][Math.floor(random() * 4)];
    const secondaryOptions = keys.filter(key => key !== focal && key !== 'sunflower');
    const secondary = secondaryOptions[Math.floor(random() * secondaryOptions.length)];
    const accent = ['daisy', 'cosmos', 'poppy'].filter(key => key !== secondary);
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
  const api = { species, seededRandom, createSpecimen, createBouquet };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.Botany = api;
})(typeof window !== 'undefined' ? window : globalThis);
