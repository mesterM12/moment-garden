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
}

export interface GardenEngine {
  /** Prepare the seeded bouquet at its opening pose, without starting the bloom. */
  show(timestamp: number): BouquetInfo;
  bloom(options?: { instant?: boolean }): void;
  resetView(options?: { instant?: boolean }): void;
  setReducedMotion(reduced: boolean): void;
  exportPng(): Promise<Blob>;
  dispose(): void;
}
