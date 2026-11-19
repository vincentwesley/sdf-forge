/**
 * Text as a 2D signed distance field.
 *
 * Glyph outlines come from a bundled font (Inter ExtraBold, SIL OFL 1.1) via
 * opentype.js (MIT). Outlines are flattened to line segments and an exact
 * signed distance is computed on a regular grid. The shader and the CPU
 * evaluator then sample the very same grid with identical bilinear
 * interpolation, so preview, picking and exported meshes agree everywhere.
 */
import opentype, { type Font, type PathCommand } from 'opentype.js';

export interface TextGrid {
  key: string;
  data: Float32Array; // w*h distances, row-major, in cap-height units (negative inside)
  w: number;
  h: number;
  /** grid origin (x, y) of sample (0, 0), in cap-height units */
  x0: number;
  y0: number;
  cell: number;
  /** tight bounds of the glyphs (minX, minY, maxX, maxY) */
  bounds: [number, number, number, number];
}

let font: Font | null = null;
const cache = new Map<string, TextGrid | null>();

export const MAX_TEXT = 32;
export const CELLS_PER_UNIT = 40;
const PAD = 0.3;

/** Install the font (ArrayBuffer of a TTF/OTF/WOFF file). */
export function setFontData(buf: ArrayBuffer) {
  font = opentype.parse(buf);
  cache.clear();
}

export function fontReady(): boolean {
  return !!font;
}

export type Seg = [number, number, number, number];

/**
 * Exact signed distance on a regular grid around a set of closed outlines
 * (line segments). Inside is decided by the non-zero or even-odd rule.
 */
export function distanceGrid(
  segs: Seg[],
  cellsPerUnit: number,
  pad: number,
  rule: 'nonzero' | 'evenodd',
): { data: Float32Array; w: number; h: number; x0: number; y0: number; cell: number } {
  let minX = Infinity,
    minY = Infinity,
    maxX = -Infinity,
    maxY = -Infinity;
  for (const [a, b, c, d] of segs) {
    minX = Math.min(minX, a, c);
    maxX = Math.max(maxX, a, c);
    minY = Math.min(minY, b, d);
    maxY = Math.max(maxY, b, d);
  }
  const cell = 1 / cellsPerUnit;
  const x0 = minX - pad,
    y0 = minY - pad;
  const w = Math.ceil((maxX - minX + 2 * pad) / cell) + 1;
  const h = Math.ceil((maxY - minY + 2 * pad) / cell) + 1;
  const data = new Float32Array(w * h);
  for (let j = 0; j < h; j++) {
    const py = y0 + j * cell;
    for (let i = 0; i < w; i++) {
      const px = x0 + i * cell;
      let best = Infinity;
      let wind = 0;
      for (let n = 0; n < segs.length; n++) {
        const sg = segs[n];
        const ax = sg[0],
          ay = sg[1],
          bx = sg[2],
          by = sg[3];
        const ex = bx - ax,
          ey = by - ay;
        const l2 = ex * ex + ey * ey;
        let t = l2 > 0 ? ((px - ax) * ex + (py - ay) * ey) / l2 : 0;
        t = t < 0 ? 0 : t > 1 ? 1 : t;
        const dx = px - ax - ex * t,
          dy = py - ay - ey * t;
        const d2 = dx * dx + dy * dy;
        if (d2 < best) best = d2;
        // winding number (crossings of a ray towards +x)
        if (ay <= py) {
          if (by > py && ex * (py - ay) - (px - ax) * ey > 0) wind++;
        } else if (by <= py && ex * (py - ay) - (px - ax) * ey < 0) wind--;
      }
      const d = Math.sqrt(best);
      const inside = rule === 'evenodd' ? (wind & 1) !== 0 : wind !== 0;
      data[j * w + i] = inside ? -d : d;
    }
  }
  return { data, w, h, x0, y0, cell };
}

function flatten(cmds: PathCommand[], segs: Seg[]) {
  let sx = 0,
    sy = 0,
    cx = 0,
    cy = 0;
  const line = (x: number, y: number) => {
    if (x !== cx || y !== cy) segs.push([cx, cy, x, y]);
    cx = x;
    cy = y;
  };
  for (const c of cmds) {
    if (c.type === 'M') {
      cx = sx = c.x!;
      cy = sy = c.y!;
    } else if (c.type === 'L') line(c.x!, c.y!);
    else if (c.type === 'Q') {
      const x0 = cx,
        y0 = cy;
      const n = 8;
      for (let i = 1; i <= n; i++) {
        const t = i / n,
          u = 1 - t;
        line(u * u * x0 + 2 * u * t * c.x1! + t * t * c.x!, u * u * y0 + 2 * u * t * c.y1! + t * t * c.y!);
      }
    } else if (c.type === 'C') {
      const x0 = cx,
        y0 = cy;
      const n = 12;
      for (let i = 1; i <= n; i++) {
        const t = i / n,
          u = 1 - t;
        line(
          u * u * u * x0 + 3 * u * u * t * c.x1! + 3 * u * t * t * c.x2! + t * t * t * c.x!,
          u * u * u * y0 + 3 * u * u * t * c.y1! + 3 * u * t * t * c.y2! + t * t * t * c.y!,
        );
      }
    } else if (c.type === 'Z') line(sx, sy);
  }
}

/** Signed distance grid for a line of text, centred on the origin, cap height = 1. Null if empty or no font. */
export function textGrid(text: string): TextGrid | null {
  const s = text.slice(0, MAX_TEXT);
  if (cache.has(s)) return cache.get(s)!;
  if (!font) return null;
  const upm = font.unitsPerEm;
  const cap = (font.tables.os2?.sCapHeight || upm * 0.72) / upm;
  const k = 1 / cap; // font units -> cap-height units
  const segs: Seg[] = [];
  let x = 0;
  let prev: ReturnType<Font['charToGlyph']> | null = null;
  for (const ch of s) {
    const g = font.charToGlyph(ch);
    if (prev) x += (font.getKerningValue(prev, g) / upm) * k;
    // opentype paths are y-down; flip to y-up
    const p = g.getPath(0, 0, upm);
    const local: Seg[] = [];
    flatten(p.commands, local);
    for (const [a, b, c, d] of local)
      segs.push([x + (a / upm) * k, (-b / upm) * k, x + (c / upm) * k, (-d / upm) * k]);
    x += (g.advanceWidth / upm) * k;
    prev = g;
  }
  if (!segs.length) {
    cache.set(s, null);
    return null;
  }
  let minX = Infinity,
    minY = Infinity,
    maxX = -Infinity,
    maxY = -Infinity;
  for (const [a, b, c, d] of segs) {
    minX = Math.min(minX, a, c);
    maxX = Math.max(maxX, a, c);
    minY = Math.min(minY, b, d);
    maxY = Math.max(maxY, b, d);
  }
  // centre horizontally on the ink, vertically on the cap height
  const ox = (minX + maxX) / 2,
    oy = 0.5;
  for (const sg of segs) {
    sg[0] -= ox;
    sg[2] -= ox;
    sg[1] -= oy;
    sg[3] -= oy;
  }
  minX -= ox;
  maxX -= ox;
  minY -= oy;
  maxY -= oy;
  const g = distanceGrid(segs, CELLS_PER_UNIT, PAD, 'nonzero');
  const grid: TextGrid = { key: s, ...g, bounds: [minX, minY, maxX, maxY] };
  cache.set(s, grid);
  return grid;
}

/**
 * Bilinear sample in grid coordinates with distance extrapolation outside.
 * Must match the GLSL in `glslTextureHelper` exactly.
 */
export function sampleGrid(
  t: { data: Float32Array; w: number; h: number; cell: number },
  gx: number,
  gy: number,
): number {
  const mx = t.w - 1,
    my = t.h - 1;
  const cx = gx < 0 ? 0 : gx > mx ? mx : gx;
  const cy = gy < 0 ? 0 : gy > my ? my : gy;
  const ix = Math.floor(Math.min(cx, mx - 0.001)),
    iy = Math.floor(Math.min(cy, my - 0.001));
  const fx = cx - ix,
    fy = cy - iy;
  const d = t.data;
  const a = d[iy * t.w + ix],
    b = d[iy * t.w + ix + 1],
    c = d[(iy + 1) * t.w + ix],
    e = d[(iy + 1) * t.w + ix + 1];
  const v = a + (b - a) * fx + (c + (e - c) * fx - (a + (b - a) * fx)) * fy;
  return v + Math.sqrt((gx - cx) * (gx - cx) + (gy - cy) * (gy - cy)) * t.cell;
}

export function glslTextureHelper(slot: number, t: TextGrid): string {
  const f = (v: number) => (Number.isInteger(v) ? `${v}.0` : String(v));
  return `uniform highp sampler2D uT${slot};
float sfTex${slot}(vec2 g) {
  vec2 m = vec2(${f(t.w - 1)}, ${f(t.h - 1)});
  vec2 c = clamp(g, vec2(0.0), m);
  vec2 i = floor(min(c, m - 0.001));
  vec2 fr = c - i;
  ivec2 ii = ivec2(i);
  float a = texelFetch(uT${slot}, ii, 0).r;
  float b = texelFetch(uT${slot}, ii + ivec2(1, 0), 0).r;
  float cc = texelFetch(uT${slot}, ii + ivec2(0, 1), 0).r;
  float e = texelFetch(uT${slot}, ii + ivec2(1, 1), 0).r;
  float ab = a + (b - a) * fr.x;
  float ce = cc + (e - cc) * fr.x;
  return ab + (ce - ab) * fr.y + length(g - c) * ${f(t.cell)};
}
`;
}
