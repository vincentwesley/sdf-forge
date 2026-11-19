/**
 * SVG import: turns the filled shapes of an SVG file (or bare path data) into
 * closed outlines, normalised so the larger side is 1 unit and centred on the
 * origin (y up). Outlines are stored compactly in the document and turned into
 * an exact signed-distance grid, exactly like Text.
 *
 * Supported: <path> (all commands, arcs included), <rect>, <circle>,
 * <ellipse>, <polygon>, <polyline>; transform on any element and nested <g>;
 * fill="none" and display:none are skipped; <defs>, <clipPath>, <mask> and
 * similar are ignored. Fill rule: even-odd if any shape asks for it.
 * Strokes are not converted (only fills have an inside).
 */
import { type Seg, distanceGrid } from './text';
import type { TextGrid } from './text';

export const MAX_SVG_POINTS = 2500;
/** grid resolution, in cells per unit (the outline spans 1 unit) */
const CELLS = 180;
const PAD = 0.08;

type M = [number, number, number, number, number, number]; // a b c d e f
const IDENT: M = [1, 0, 0, 1, 0, 0];
const mulM = (p: M, q: M): M => [
  p[0] * q[0] + p[2] * q[1],
  p[1] * q[0] + p[3] * q[1],
  p[0] * q[2] + p[2] * q[3],
  p[1] * q[2] + p[3] * q[3],
  p[0] * q[4] + p[2] * q[5] + p[4],
  p[1] * q[4] + p[3] * q[5] + p[5],
];
const applyM = (m: M, x: number, y: number): [number, number] => [
  m[0] * x + m[2] * y + m[4],
  m[1] * x + m[3] * y + m[5],
];

export function parseTransform(s: string | undefined): M {
  let m: M = IDENT;
  if (!s) return m;
  const re = /(matrix|translate|scale|rotate|skewX|skewY)\s*\(([^)]*)\)/g;
  for (let r; (r = re.exec(s));) {
    const v = (r[2].match(/[-+]?(?:\d*\.\d+|\d+\.?)(?:[eE][-+]?\d+)?/g) ?? []).map(Number);
    let t: M = IDENT;
    const rad = (d: number) => (d * Math.PI) / 180;
    switch (r[1]) {
      case 'matrix':
        if (v.length === 6) t = v as M;
        break;
      case 'translate':
        t = [1, 0, 0, 1, v[0] ?? 0, v[1] ?? 0];
        break;
      case 'scale':
        t = [v[0] ?? 1, 0, 0, v[1] ?? v[0] ?? 1, 0, 0];
        break;
      case 'rotate': {
        const a = rad(v[0] ?? 0),
          c = Math.cos(a),
          sn = Math.sin(a);
        const [cx, cy] = [v[1] ?? 0, v[2] ?? 0];
        t = mulM(mulM([1, 0, 0, 1, cx, cy], [c, sn, -sn, c, 0, 0]), [1, 0, 0, 1, -cx, -cy]);
        break;
      }
      case 'skewX':
        t = [1, 0, Math.tan(rad(v[0] ?? 0)), 1, 0, 0];
        break;
      case 'skewY':
        t = [1, Math.tan(rad(v[0] ?? 0)), 0, 1, 0, 0];
        break;
    }
    m = mulM(m, t);
  }
  return m;
}

/** Path data → closed polylines (flat x,y lists), in the path's own coordinates. */
export function parsePathData(d: string): number[][] {
  const out: number[][] = [];
  let i = 0;
  const n = d.length;
  const skip = () => {
    while (i < n && /[\s,]/.test(d[i])) i++;
  };
  const num = (): number => {
    skip();
    const m = /^[-+]?(?:\d*\.\d+|\d+\.?)(?:[eE][-+]?\d+)?/.exec(d.slice(i, i + 40));
    if (!m) throw new Error('bad number');
    i += m[0].length;
    return parseFloat(m[0]);
  };
  const flag = (): number => {
    skip();
    const c = d[i++];
    if (c !== '0' && c !== '1') throw new Error('bad arc flag');
    return c === '1' ? 1 : 0;
  };
  let cur: number[] = [];
  let x = 0,
    y = 0,
    sx = 0,
    sy = 0;
  let lcx = 0,
    lcy = 0; // last control point (for S/T)
  let prev = '';
  const flush = () => {
    if (cur.length >= 6) out.push(cur);
    cur = [];
  };
  const to = (nx: number, ny: number) => {
    cur.push(nx, ny);
    x = nx;
    y = ny;
  };
  const cubic = (x1: number, y1: number, x2: number, y2: number, ex: number, ey: number) => {
    const x0 = x,
      y0 = y;
    for (let k = 1; k <= 12; k++) {
      const t = k / 12,
        u = 1 - t;
      to(
        u * u * u * x0 + 3 * u * u * t * x1 + 3 * u * t * t * x2 + t * t * t * ex,
        u * u * u * y0 + 3 * u * u * t * y1 + 3 * u * t * t * y2 + t * t * t * ey,
      );
    }
    lcx = x2;
    lcy = y2;
  };
  const quad = (x1: number, y1: number, ex: number, ey: number) => {
    const x0 = x,
      y0 = y;
    for (let k = 1; k <= 8; k++) {
      const t = k / 8,
        u = 1 - t;
      to(u * u * x0 + 2 * u * t * x1 + t * t * ex, u * u * y0 + 2 * u * t * y1 + t * t * ey);
    }
    lcx = x1;
    lcy = y1;
  };
  const arc = (
    rx: number,
    ry: number,
    phiDeg: number,
    large: number,
    sweep: number,
    ex: number,
    ey: number,
  ) => {
    // SVG implementation notes F.6: endpoint to centre parameterisation
    if (rx === 0 || ry === 0 || (ex === x && ey === y)) return to(ex, ey);
    rx = Math.abs(rx);
    ry = Math.abs(ry);
    const phi = (phiDeg * Math.PI) / 180,
      cp = Math.cos(phi),
      sp = Math.sin(phi);
    const dx = (x - ex) / 2,
      dy = (y - ey) / 2;
    const x1 = cp * dx + sp * dy,
      y1 = -sp * dx + cp * dy;
    const lam = (x1 * x1) / (rx * rx) + (y1 * y1) / (ry * ry);
    if (lam > 1) {
      rx *= Math.sqrt(lam);
      ry *= Math.sqrt(lam);
    }
    const num2 = rx * rx * ry * ry - rx * rx * y1 * y1 - ry * ry * x1 * x1;
    const den = rx * rx * y1 * y1 + ry * ry * x1 * x1;
    let co = Math.sqrt(Math.max(0, num2 / den));
    if (large === sweep) co = -co;
    const cx1 = (co * rx * y1) / ry,
      cy1 = (-co * ry * x1) / rx;
    const cx = cp * cx1 - sp * cy1 + (x + ex) / 2,
      cy = sp * cx1 + cp * cy1 + (y + ey) / 2;
    const ang = (ux: number, uy: number, vx: number, vy: number) => {
      const a = Math.atan2(ux * vy - uy * vx, ux * vx + uy * vy);
      return a;
    };
    const t1 = ang(1, 0, (x1 - cx1) / rx, (y1 - cy1) / ry);
    let dt = ang((x1 - cx1) / rx, (y1 - cy1) / ry, (-x1 - cx1) / rx, (-y1 - cy1) / ry);
    if (!sweep && dt > 0) dt -= 2 * Math.PI;
    if (sweep && dt < 0) dt += 2 * Math.PI;
    const steps = Math.max(2, Math.ceil(Math.abs(dt) / (Math.PI / 30)));
    for (let k = 1; k <= steps; k++) {
      const t = t1 + (dt * k) / steps;
      if (k === steps) to(ex, ey);
      else
        to(
          cx + rx * Math.cos(t) * cp - ry * Math.sin(t) * sp,
          cy + rx * Math.cos(t) * sp + ry * Math.sin(t) * cp,
        );
    }
  };
  while (true) {
    skip();
    if (i >= n) break;
    let c = d[i];
    if (/[A-Za-z]/.test(c)) i++;
    else if (prev && prev.toLowerCase() !== 'z') c = prev === 'M' ? 'L' : prev === 'm' ? 'l' : prev;
    else throw new Error(`unexpected "${c}"`);
    const rel = c === c.toLowerCase();
    const ox = rel ? x : 0,
      oy = rel ? y : 0;
    switch (c.toUpperCase()) {
      case 'M': {
        flush();
        const nx = num() + ox,
          ny = num() + oy;
        to(nx, ny);
        sx = nx;
        sy = ny;
        break;
      }
      case 'L':
        to(num() + ox, num() + oy);
        break;
      case 'H':
        to(num() + ox, y);
        break;
      case 'V':
        to(x, num() + (rel ? y : 0));
        break;
      case 'C': {
        const a = num() + ox,
          b = num() + oy,
          e = num() + ox,
          f = num() + oy,
          g = num() + ox,
          h = num() + oy;
        cubic(a, b, e, f, g, h);
        break;
      }
      case 'S': {
        const smooth = /[CcSs]/.test(prev);
        const a = smooth ? 2 * x - lcx : x,
          b = smooth ? 2 * y - lcy : y;
        const e = num() + ox,
          f = num() + oy,
          g = num() + ox,
          h = num() + oy;
        cubic(a, b, e, f, g, h);
        break;
      }
      case 'Q': {
        const a = num() + ox,
          b = num() + oy,
          e = num() + ox,
          f = num() + oy;
        quad(a, b, e, f);
        break;
      }
      case 'T': {
        const smooth = /[QqTt]/.test(prev);
        quad(smooth ? 2 * x - lcx : x, smooth ? 2 * y - lcy : y, num() + ox, num() + oy);
        break;
      }
      case 'A': {
        const rx = num(),
          ry = num(),
          rot = num(),
          large = flag(),
          sweep = flag();
        arc(rx, ry, rot, large, sweep, num() + ox, num() + oy);
        break;
      }
      case 'Z':
        flush();
        x = sx;
        y = sy;
        cur = [];
        break;
      default:
        throw new Error(`unknown command ${c}`);
    }
    if (!/[CcSsQqTt]/.test(c)) {
      lcx = x;
      lcy = y;
    }
    prev = c.toUpperCase() === 'Z' ? 'z' : c;
  }
  flush();
  return out;
}

const attrs = (s: string): Record<string, string> => {
  const out: Record<string, string> = {};
  const re = /([a-zA-Z_:][\w:.-]*)\s*=\s*(?:"([^"]*)"|'([^']*)')/g;
  for (let r; (r = re.exec(s));) out[r[1]] = r[2] ?? r[3] ?? '';
  // style="fill:none; display:none; fill-rule:evenodd"
  for (const decl of (out.style ?? '').split(';')) {
    const [k, v] = decl.split(':').map((t) => t?.trim());
    if (k && v && ['fill', 'display', 'fill-rule', 'visibility'].includes(k)) out[k] = v;
  }
  return out;
};

const SKIP = new Set([
  'defs',
  'clippath',
  'mask',
  'pattern',
  'lineargradient',
  'radialgradient',
  'style',
  'title',
  'desc',
  'metadata',
  'symbol',
  'marker',
  'filter',
  'text',
  'script',
]);

/** Parse SVG markup (or bare path data) into closed polylines (y down, SVG units). */
export function parseSvg(src: string): { polys: number[][]; rule: 'nonzero' | 'evenodd' } {
  const text = src.trim();
  if (!text.includes('<')) return { polys: parsePathData(text), rule: 'nonzero' };
  const polys: number[][] = [];
  let rule: 'nonzero' | 'evenodd' = 'nonzero';
  const stack: { tag: string; m: M; hidden: boolean; fillNone: boolean }[] = [
    { tag: '#root', m: IDENT, hidden: false, fillNone: false },
  ];
  let skipDepth = 0;
  const tagRe = /<(\/?)([a-zA-Z][\w:-]*)([^>]*?)(\/?)>|<!--[\s\S]*?-->|<!\[CDATA\[[\s\S]*?\]\]>|<[?!][^>]*>/g;
  for (let r; (r = tagRe.exec(text));) {
    if (!r[2]) continue; // comment, doctype, processing instruction
    const closing = r[1] === '/',
      name = r[2].toLowerCase().replace(/^svg:/, ''),
      selfClose = r[4] === '/';
    if (closing) {
      if (skipDepth > 0) {
        skipDepth--;
        continue;
      }
      if (stack.length > 1 && stack[stack.length - 1].tag === name) stack.pop();
      continue;
    }
    if (skipDepth > 0 || SKIP.has(name)) {
      if (!selfClose) skipDepth++;
      continue;
    }
    const a = attrs(r[3]);
    const parent = stack[stack.length - 1];
    const m = mulM(parent.m, parseTransform(a.transform));
    const hidden = parent.hidden || a.display === 'none' || a.visibility === 'hidden';
    const fillNone = a.fill !== undefined ? a.fill === 'none' || a.fill === 'transparent' : parent.fillNone;
    if (a['fill-rule'] === 'evenodd') rule = 'evenodd';
    const f = (k: string, def = 0) => (a[k] !== undefined ? parseFloat(a[k]) : def);
    let local: number[][] = [];
    if (!hidden && !fillNone) {
      if (name === 'path' && a.d) local = parsePathData(a.d);
      else if (name === 'rect') {
        const x = f('x'),
          y = f('y'),
          w = f('width'),
          h = f('height');
        if (w > 0 && h > 0) local = [[x, y, x + w, y, x + w, y + h, x, y + h]];
      } else if (name === 'circle' || name === 'ellipse') {
        const cx = f('cx'),
          cy = f('cy'),
          rx = name === 'circle' ? f('r') : f('rx'),
          ry = name === 'circle' ? f('r') : f('ry');
        if (rx > 0 && ry > 0) {
          const p: number[] = [];
          for (let k = 0; k < 72; k++)
            p.push(cx + rx * Math.cos((k / 72) * Math.PI * 2), cy + ry * Math.sin((k / 72) * Math.PI * 2));
          local = [p];
        }
      } else if (name === 'polygon' || name === 'polyline') {
        const v = (a.points?.match(/[-+]?(?:\d*\.\d+|\d+\.?)(?:[eE][-+]?\d+)?/g) ?? []).map(Number);
        if (v.length >= 6) local = [v.slice(0, v.length - (v.length % 2))];
      }
    }
    for (const p of local) {
      const t: number[] = [];
      for (let k = 0; k < p.length; k += 2) t.push(...applyM(m, p[k], p[k + 1]));
      polys.push(t);
    }
    if (!selfClose && !['path', 'rect', 'circle', 'ellipse', 'polygon', 'polyline', 'line'].includes(name))
      stack.push({ tag: name, m, hidden, fillNone });
  }
  return { polys, rule };
}

/**
 * Normalise (larger side = 1, centred, y up), drop near-duplicate points and
 * encode compactly: "n" or "e" (fill rule), then polylines separated by ";"
 * with points as "x,y" pairs separated by spaces.
 */
export function encodeOutline(polys: number[][], rule: 'nonzero' | 'evenodd'): string {
  let minX = Infinity,
    minY = Infinity,
    maxX = -Infinity,
    maxY = -Infinity;
  for (const p of polys)
    for (let k = 0; k < p.length; k += 2) {
      minX = Math.min(minX, p[k]);
      maxX = Math.max(maxX, p[k]);
      minY = Math.min(minY, p[k + 1]);
      maxY = Math.max(maxY, p[k + 1]);
    }
  const span = Math.max(maxX - minX, maxY - minY);
  if (!(span > 0)) throw new Error('The SVG has no filled shapes to import.');
  const cx = (minX + maxX) / 2,
    cy = (minY + maxY) / 2;
  const parts: string[] = [];
  let count = 0;
  for (const p of polys) {
    const pts: string[] = [];
    let lx = Infinity,
      ly = Infinity;
    for (let k = 0; k < p.length; k += 2) {
      const x = (p[k] - cx) / span,
        y = -(p[k + 1] - cy) / span;
      if (Math.hypot(x - lx, y - ly) < 1.5e-3) continue;
      pts.push(`${+x.toFixed(4)},${+y.toFixed(4)}`);
      lx = x;
      ly = y;
    }
    if (pts.length >= 3) {
      parts.push(pts.join(' '));
      count += pts.length;
    }
  }
  if (!parts.length) throw new Error('The SVG has no filled shapes to import.');
  if (count > MAX_SVG_POINTS)
    throw new Error(
      `This SVG is too detailed (${count} points; at most ${MAX_SVG_POINTS}). Try simplifying it.`,
    );
  return (rule === 'evenodd' ? 'e' : 'n') + parts.join(';');
}

export function decodeOutline(s: string): { polys: number[][]; rule: 'nonzero' | 'evenodd' } {
  const rule = s[0] === 'e' ? 'evenodd' : 'nonzero';
  const polys = s
    .slice(1)
    .split(';')
    .map((part) =>
      part
        .trim()
        .split(/\s+/)
        .flatMap((xy) => xy.split(',').map(Number)),
    )
    .filter((p) => p.length >= 6 && p.every(Number.isFinite));
  return { polys, rule };
}

/** Import SVG markup or path data into the stored outline format. Throws a friendly message on failure. */
export function importSvg(src: string): string {
  let parsed;
  try {
    parsed = parseSvg(src);
  } catch (e) {
    throw new Error(`Could not read this SVG (${(e as Error).message}).`, { cause: e });
  }
  return encodeOutline(parsed.polys, parsed.rule);
}

const cache = new Map<string, TextGrid | null>();

/** Distance grid of a stored outline (1 unit = larger side). Cached. */
export function svgGrid(outline: string): TextGrid | null {
  if (cache.has(outline)) return cache.get(outline)!;
  const { polys, rule } = decodeOutline(outline);
  const segs: Seg[] = [];
  let minX = Infinity,
    minY = Infinity,
    maxX = -Infinity,
    maxY = -Infinity;
  for (const p of polys) {
    const k = p.length / 2;
    for (let j = 0; j < k; j++) {
      const a = j * 2,
        b = ((j + 1) % k) * 2;
      segs.push([p[a], p[a + 1], p[b], p[b + 1]]);
      minX = Math.min(minX, p[a]);
      maxX = Math.max(maxX, p[a]);
      minY = Math.min(minY, p[a + 1]);
      maxY = Math.max(maxY, p[a + 1]);
    }
  }
  if (!segs.length) {
    cache.set(outline, null);
    return null;
  }
  const g = distanceGrid(segs, CELLS, PAD, rule);
  const grid: TextGrid = {
    key: `svg:${outline.length}:${hash(outline)}`,
    ...g,
    bounds: [minX, minY, maxX, maxY],
  };
  if (cache.size > 16) cache.delete(cache.keys().next().value!);
  cache.set(outline, grid);
  return grid;
}

function hash(s: string): string {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return (h >>> 0).toString(36);
}

/** A small built-in example (a heart), so a new SVG node shows something straight away. */
export const SAMPLE_SVG =
  '<svg viewBox="0 0 100 90"><path d="M50 88 C 20 65 0 48 0 26 A 25 25 0 0 1 50 14 A 25 25 0 0 1 100 26 C 100 48 80 65 50 88 Z"/></svg>';
export const SAMPLE_OUTLINE = importSvg(SAMPLE_SVG);
