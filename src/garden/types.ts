export type Random = () => number;
export type OriginalSpeciesKey = 'daisy' | 'sunflower' | 'poppy' | 'tulip' | 'rose' | 'dahlia' | 'lily' | 'cosmos';
export type ExtraSpeciesKey = 'ranunculus' | 'calla' | 'orchid' | 'iris' | 'hydrangea' | 'anemone' | 'billyButton';
export type SpeciesKey = OriginalSpeciesKey | ExtraSpeciesKey;
export type Range = readonly [number, number];
export type PetalPattern = 'gradient' | 'picotee' | 'speckled';

export interface FlowerRecipe {
  label: string;
  count: Range;
  layers: Range;
  length: number;
  width: number;
  shrink: number;
  lift: number;
  open: number;
  curl: number;
  cup: number;
  shape: number;
  ruffle: number;
  disk: number;
  center: 'gold' | 'seeds' | 'poppy' | 'stamens' | 'hidden';
  leaf: 'slender' | 'broad' | 'serrated' | 'strap';
  tilt: number;
  sepalCount?: number;
}

export interface PetalPalette {
  name: string;
  base: string;
  tip: string;
  root: string;
  fleck: string;
}

export interface Specimen {
  timestamp: number;
  random: Random;
  palette: PetalPalette;
  key: SpeciesKey;
  recipe: FlowerRecipe;
  pattern: PetalPattern;
  mood: string;
  name: string;
  count: number;
  layers: number;
  length: number;
  width: number;
  bend: number;
  rotation: number;
  greenHue: number;
}

export interface StemEntry {
  specimen: Specimen;
  position: number[];
  scale: number;
  delay: number;
  turn: number;
  leafCount?: number;
  leafScale?: number;
  tiltOffset?: number;
}

export interface HeadEnvelope {
  center: number[];
  axis: number[];
  radius: number;
  halfHeight: number;
}

export interface BouquetPlan {
  timestamp: number;
  name: string;
  flowers: StemEntry[];
  kinds: SpeciesKey[];
}

export interface ExpandedBouquetPlan extends BouquetPlan {
  version: 2;
  arrangement: { id: string; label: string };
  palette: { id: string; label: string };
  tie: { style: 'bow' | 'twine' | 'wrap'; color: string };
}

/** One render batch; optional blade domains distinguish petals from attached details. */
export interface MorphPetal {
  mesh: import('three').Mesh<import('three').BufferGeometry, import('three').Material>;
  blades?: import('./petal-fold').BladeSpan[];
  pace?: number;
  layer: number;
  offset: number;
}

export interface BouquetInfo {
  timestamp: number;
  name: string;
  /** Human-readable lowercase flower names, in arrangement order. */
  kinds: string[];
  flowerCount: number;
}

export interface GardenEngineOptions {
  onStatus?: (status: string) => void;
  onError?: (message: string | null) => void;
  onContextChange?: (lost: boolean) => void;
  onBloomProgress?: (progress: number) => void;
  onBloomPause?: () => void;
  onCloseViewChange?: (close: boolean) => void;
}

export interface GardenEngine {
  /** Prepare the seeded bouquet at its opening pose, without starting the bloom. */
  show(timestamp: number): BouquetInfo;
  bloom(options?: { instant?: boolean }): void;
  resetView(options?: { instant?: boolean }): void;
  setCloseView(close: boolean, options?: { instant?: boolean }): void;
  setReducedMotion(reduced: boolean): void;
  exportPng(): Promise<Blob>;
  dispose(): void;
}
