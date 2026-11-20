/**
 * Build volumes of popular 3D printers (width × depth × height, mm), from the
 * makers' published specifications, and a check of whether a model fits.
 * Values: Bambu Lab A1 mini 180³; A1, P1S, X1 Carbon 256³; Prusa MK4/MK4S
 * 250 × 210 × 220; Creality Ender-3 V3 220 × 220 × 250; Prusa MINI+ 180³.
 */
export interface Printer {
  id: string;
  label: string;
  /** width (X), depth (Y), height (Z) in mm */
  bed: [number, number, number];
}

export const PRINTERS: Printer[] = [
  { id: 'a1mini', label: 'Bambu Lab A1 mini', bed: [180, 180, 180] },
  { id: 'bambu256', label: 'Bambu Lab A1 / P1S / X1C', bed: [256, 256, 256] },
  { id: 'mk4', label: 'Prusa MK4 / MK4S', bed: [250, 210, 220] },
  { id: 'mini', label: 'Prusa MINI+', bed: [180, 180, 180] },
  { id: 'ender3v3', label: 'Creality Ender-3 V3', bed: [220, 220, 250] },
];

/** Safety margin kept around the model when scaling it to fit. */
export const FIT_MARGIN = 0.97;

export interface FitResult {
  fits: boolean;
  /** fits only after turning it 90° on the bed */
  rotated: boolean;
  /** uniform scale that makes it fit with the margin (≤ 1 when it doesn't fit) */
  scaleToFit: number;
}

/**
 * @param size model size in print space: width (X), depth (Y), height (Z), in mm.
 * The model may be turned 90° about Z (swapping width and depth), as slicers allow.
 */
export function fitOnBed(size: [number, number, number], bed: [number, number, number]): FitResult {
  const [w, d, h] = size;
  const straight = w <= bed[0] && d <= bed[1] && h <= bed[2];
  const turned = d <= bed[0] && w <= bed[1] && h <= bed[2];
  const scale = (a: number, b: number) =>
    Math.min(bed[0] / Math.max(a, 1e-9), bed[1] / Math.max(b, 1e-9), bed[2] / Math.max(h, 1e-9));
  return {
    fits: straight || turned,
    rotated: !straight && turned,
    scaleToFit: Math.max(scale(w, d), scale(d, w)) * FIT_MARGIN,
  };
}
