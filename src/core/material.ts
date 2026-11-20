/**
 * Surface materials. Every coloured shape has a material; "Same as scene" uses
 * the document's default style. A material is three numbers that travel with
 * the colour through the distance field and blend across smooth unions just
 * like colours do:
 *
 *   x = roughness (0 mirror … 1 chalk), y = metallic (0 or 1), z = glow (0 … 1)
 *
 * The renderer and every export read the same numbers, so what you see is what
 * the GLB/USDZ/3MF files carry.
 */

export type MaterialStyle = 'clay' | 'glossy' | 'metal';
export type ShapeMaterial = 'scene' | MaterialStyle | 'glow';

export const MATERIAL_VALUES: Record<MaterialStyle | 'glow', [number, number, number]> = {
  clay: [0.65, 0, 0],
  glossy: [0.16, 0, 0],
  metal: [0.3, 1, 0],
  glow: [0.5, 0, 1],
};

export const SHAPE_MATERIALS: { value: ShapeMaterial; label: string }[] = [
  { value: 'scene', label: 'Same as scene' },
  { value: 'clay', label: 'Clay' },
  { value: 'glossy', label: 'Glossy' },
  { value: 'metal', label: 'Metal' },
  { value: 'glow', label: 'Glow' },
];

export function isShapeMaterial(v: unknown): v is ShapeMaterial {
  return SHAPE_MATERIALS.some((m) => m.value === v);
}

/** The three material numbers of a shape, given the document's default style. */
export function materialValues(m: unknown, scene: MaterialStyle): [number, number, number] {
  const key: MaterialStyle | 'glow' = isShapeMaterial(m) && m !== 'scene' ? m : scene;
  return [...(MATERIAL_VALUES[key] ?? MATERIAL_VALUES.clay)] as [number, number, number];
}

/** Clear-coat strength implied by a material (glossy plastics have one; clay and metal don't). */
export function clearCoat(rough: number, metal: number): number {
  return (1 - metal) * Math.max(0, Math.min(1, (0.4 - rough) / 0.24));
}

/**
 * Export roughness: the viewport values mapped to what glTF/USD viewers need for
 * the same look (clay 0.65 → 0.7, glossy 0.16 → 0.25 because the clear coat is
 * not exported, metal 0.3 stays), linear in between.
 */
export function exportRoughness(rough: number): number {
  const pts: [number, number][] = [
    [0, 0.1],
    [0.16, 0.25],
    [0.3, 0.3],
    [0.65, 0.7],
    [1, 1],
  ];
  const r = Math.max(0, Math.min(1, rough));
  for (let i = 1; i < pts.length; i++) {
    const [x0, y0] = pts[i - 1];
    const [x1, y1] = pts[i];
    if (r <= x1) return y0 + ((r - x0) / (x1 - x0)) * (y1 - y0);
  }
  return 1;
}

/** "Colour 2 (metal)": the filament slot name slicers show. */
export function materialName(s: { metal: number; glow: number; rough: number }, i: number): string {
  const kind = s.glow > 0.5 ? 'glow' : s.metal > 0.5 ? 'metal' : s.rough < 0.4 ? 'glossy' : 'clay';
  return `Colour ${i + 1} (${kind})`;
}
