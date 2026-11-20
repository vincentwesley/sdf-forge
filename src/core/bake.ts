/**
 * Bake a Text/SVG distance grid into GLSL source, so a shader that uses one can
 * be pasted into Shadertoy with no texture channel (DECISIONS.md 24).
 *
 * Every k-th sample is kept (k chosen so at most MAX_BAKED samples remain;
 * those samples are exact distances), quantised to 16 bits over the grid's
 * range and packed two per uint in a const array. Sampling is the same
 * clamped bilinear lookup as the app's texture path, plus the same distance
 * term outside the grid, so the shape stays a valid distance bound.
 */
import type { TextGrid } from './text';

export const MAX_BAKED = 8192;

export interface BakedGrid {
  /** packed 16-bit samples, two per word (low half first) */
  words: Uint32Array;
  w: number;
  h: number;
  /** stride in original grid cells */
  k: number;
  lo: number;
  /** value = lo + q * scale */
  scale: number;
  /** original cell size (for the outside-the-grid distance term) */
  cell: number;
}

export function bakeGrid(
  t: { data: Float32Array; w: number; h: number; cell: number },
  max = MAX_BAKED,
): BakedGrid {
  let k = 1;
  const size = (s: number) => (Math.floor((t.w - 1) / s) + 1) * (Math.floor((t.h - 1) / s) + 1);
  while (size(k) > max) k++;
  const w = Math.floor((t.w - 1) / k) + 1,
    h = Math.floor((t.h - 1) / k) + 1;
  let lo = Infinity,
    hi = -Infinity;
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const v = t.data[y * k * t.w + x * k];
      lo = Math.min(lo, v);
      hi = Math.max(hi, v);
    }
  const scale = hi > lo ? (hi - lo) / 65535 : 1;
  const words = new Uint32Array(Math.ceil((w * h) / 2));
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const i = y * w + x;
      const q = Math.round((t.data[y * k * t.w + x * k] - lo) / scale) & 0xffff;
      words[i >> 1] |= (i & 1 ? q << 16 : q) >>> 0;
    }
  return { words, w, h, k, lo, scale, cell: t.cell };
}

const sample = (b: BakedGrid, x: number, y: number) => {
  const i = y * b.w + x;
  const word = b.words[i >> 1];
  return b.lo + (i & 1 ? word >>> 16 : word & 0xffff) * b.scale;
};

/** The baked lookup in JavaScript, for tests: g is in original grid cells. */
export function sampleBaked(b: BakedGrid, gx: number, gy: number): number {
  const sx = gx / b.k,
    sy = gy / b.k;
  const mx = b.w - 1,
    my = b.h - 1;
  const cx = Math.max(0, Math.min(mx, sx)),
    cy = Math.max(0, Math.min(my, sy));
  const ix = Math.floor(Math.min(cx, mx - 0.001)),
    iy = Math.floor(Math.min(cy, my - 0.001));
  const fx = cx - ix,
    fy = cy - iy;
  const a = sample(b, ix, iy),
    bb = sample(b, ix + 1, iy),
    c = sample(b, ix, iy + 1),
    e = sample(b, ix + 1, iy + 1);
  const ab = a + (bb - a) * fx,
    ce = c + (e - c) * fx;
  return ab + (ce - ab) * fy + Math.hypot(sx - cx, sy - cy) * b.k * b.cell;
}

const f = (v: number) => {
  const s = String(Math.fround(v));
  return /[.e]/.test(s) ? (s.includes('e') && !s.includes('.') ? s.replace('e', '.0e') : s) : `${s}.0`;
};

/** GLSL for `float sfTex<slot>(vec2 g)` reading the baked array (replaces the texture helper). */
export function bakedTextureGlsl(slot: number, t: TextGrid, max = MAX_BAKED): string {
  const b = bakeGrid(t, max);
  const n = b.words.length;
  const lines: string[] = [];
  for (let i = 0; i < n; i += 12)
    lines.push(
      '  ' +
        Array.from(b.words.subarray(i, i + 12))
          .map((x) => `${x}u`)
          .join(','),
    );
  return `// distance grid ${slot}: ${b.w}x${b.h} samples (every ${b.k} of the original), 16-bit
const uint T${slot}[${n}] = uint[${n}](
${lines.join(',\n')});
float sfAt${slot}(int x, int y) {
  int i = y * ${b.w} + x;
  uint w = T${slot}[i >> 1];
  return ${f(b.lo)} + float((i & 1) == 1 ? w >> 16 : w & 65535u) * ${f(b.scale)};
}
float sfTex${slot}(vec2 g) {
  vec2 s = g / ${f(b.k)};
  vec2 m = vec2(${f(b.w - 1)}, ${f(b.h - 1)});
  vec2 c = clamp(s, vec2(0.0), m);
  vec2 i = floor(min(c, m - 0.001));
  vec2 fr = c - i;
  int x = int(i.x), y = int(i.y);
  float a = sfAt${slot}(x, y), b = sfAt${slot}(x + 1, y);
  float cc = sfAt${slot}(x, y + 1), e = sfAt${slot}(x + 1, y + 1);
  float ab = a + (b - a) * fr.x;
  float ce = cc + (e - cc) * fr.x;
  return ab + (ce - ab) * fr.y + length(s - c) * ${f(b.k * b.cell)};
}
`;
}
