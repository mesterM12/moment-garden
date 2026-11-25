/* Additional cut-flower recipes. The original collection lives in botany.js. */
(function (root) {
  'use strict';
  const species = {
    ranunculus: { label: 'Ranunculus', count: [9, 11], layers: [5, 6], length: 1.31, width: 0.48, shrink: 0.145, lift: 0.08, open: -0.12, curl: 0.14, cup: 0.15, shape: 0.36, ruffle: 0.028, disk: 0.06, center: 'hidden', leaf: 'serrated', tilt: 1.06 },
    calla: { label: 'Calla Lily', count: [1, 1], layers: [1, 1], length: 1.42, width: 0.72, shrink: 0, lift: 0.10, open: -0.80, curl: 0.20, cup: 0.26, shape: 0.42, ruffle: 0.008, disk: 0.09, center: 'hidden', leaf: 'broad', tilt: 0.43, sepalCount: 0 },
    orchid: { label: 'Orchid', count: [6, 6], layers: [3, 3], length: 1.30, width: 0.48, shrink: 0, lift: 0.04, open: -0.04, curl: 0.11, cup: 0.12, shape: 0.38, ruffle: 0.026, disk: 0.08, center: 'hidden', leaf: 'strap', tilt: 1.26, sepalCount: 0 },
    iris: { label: 'Iris', count: [3, 3], layers: [2, 2], length: 1.36, width: 0.46, shrink: 0, lift: 0.07, open: -0.24, curl: -0.32, cup: 0.19, shape: 0.48, ruffle: 0.055, disk: 0.08, center: 'hidden', leaf: 'strap', tilt: 0.8, sepalCount: 0 },
    hydrangea: { label: 'Hydrangea', count: [4, 4], layers: [3, 3], length: 1.24, width: 0.31, shrink: 0, lift: 0.04, open: -0.08, curl: 0.06, cup: 0.08, shape: 0.38, ruffle: 0.012, disk: 0.05, center: 'hidden', leaf: 'broad', tilt: 0.72, sepalCount: 0 },
    anemone: { label: 'Anemone', count: [7, 9], layers: [1, 1], length: 1.15, width: 0.36, shrink: 0, lift: 0.04, open: 0.05, curl: -0.03, cup: 0.08, shape: 0.38, ruffle: 0.022, disk: 0.32, center: 'hidden', leaf: 'serrated', tilt: 1.12 },
    billyButton: { label: 'Billy Button', count: [96, 112], layers: [3, 3], length: 0.52, width: 0.47, shrink: 0, lift: 0.05, open: 0, curl: 0.03, cup: 0.06, shape: 0.68, ruffle: 0.008, disk: 0.1, center: 'hidden', leaf: 'slender', tilt: 0.28, sepalCount: 0 },
  };
  const pigmentRanges = {
    ranunculus: [[344, 363], [320, 345], [14, 32], [40, 58]],
    calla: [[322, 348], [275, 300], [12, 32], [37, 58]],
    orchid: [[309, 345], [276, 303], [40, 59]],
    iris: [[223, 247], [249, 277], [280, 300], [43, 57]],
    hydrangea: [[208, 231], [247, 278], [300, 326], [336, 352]],
    anemone: [[348, 366], [309, 336], [235, 261], [269, 289]],
    billyButton: [[39, 53]],
  };
  const api = { species, pigmentRanges };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.BotanyVarieties = api;
})(typeof window !== 'undefined' ? window : globalThis);
