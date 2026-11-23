declare module 'gifenc' {
  export interface GifPaletteOptions {
    palette?: number[][];
    delay?: number;
    transparent?: boolean;
    transparentIndex?: number;
    repeat?: number;
    dispose?: number;
  }

  export interface GifEncoderInstance {
    writeFrame(index: Uint8Array | number[], width: number, height: number, opts?: GifPaletteOptions): void;
    finish(): void;
    bytes(): Uint8Array;
  }

  export function GIFEncoder(): GifEncoderInstance;
  export function quantize(rgba: Uint8ClampedArray | Uint8Array, maxColors: number): number[][];
  export function applyPalette(rgba: Uint8ClampedArray | Uint8Array, palette: number[][]): Uint8Array;
}
