import type { AABB } from '../core/nodes/types';

/** View-only section cut: which axis, where (0..1 across the shape's bounds), and which side is kept. */
export interface SectionState {
  axis: 'x' | 'y' | 'z';
  at: number;
  flip: boolean;
}

export const DEFAULT_SECTION: SectionState = { axis: 'x', at: 0.5, flip: false };

/** The cut plane [nx, ny, nz, offset]: material with dot(p, n) <= offset is kept. */
export function sectionPlane(
  s: SectionState | null,
  b: AABB | null,
): [number, number, number, number] | null {
  if (!s || !b) return null;
  const i = s.axis === 'x' ? 0 : s.axis === 'y' ? 1 : 2;
  const v = b.min[i] + Math.min(1, Math.max(0, s.at)) * (b.max[i] - b.min[i]);
  const n: [number, number, number] = [0, 0, 0];
  n[i] = s.flip ? -1 : 1;
  return [n[0], n[1], n[2], s.flip ? -v : v];
}
