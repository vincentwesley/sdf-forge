/**
 * 3MF writer (3MF Core Specification 1.3, https://3mf.io/specification/).
 * Millimetres, Z up, one mesh object, per-triangle colours as core
 * <basematerials> (a small palette, so slicers can map colours to filaments),
 * credit metadata, and an optional PNG thumbnail that slicers show in their
 * file browsers.
 */
import { CREDIT, SITE } from './writers';
import { writeZip, type ZipEntry } from './zip';

export interface ThreeMfOptions {
  title: string;
  /** per-vertex sRGB colours 0..1 (same length as positions) */
  colors?: Float32Array | null;
  /** PNG bytes for Metadata/thumbnail.png */
  thumbnail?: Uint8Array | null;
  /** most colours to keep in the palette */
  maxColors?: number;
  /** the colours set on the shapes (sRGB 0..1); triangles snap to the nearest */
  palette?: [number, number, number][] | null;
  /** ISO date for CreationDate (defaults to today) */
  date?: string;
}

const xmlEscape = (s: string) =>
  s.replace(
    /[<>&"']/g,
    (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;', "'": '&apos;' })[c]!,
  );

const hex2 = (v: number) =>
  Math.round(Math.max(0, Math.min(1, v)) * 255)
    .toString(16)
    .padStart(2, '0')
    .toUpperCase();

/**
 * Reduce per-triangle colours to a palette of at most `max` entries: quantise
 * to 5 bits per channel, then cluster similar colours (most-used first).
 * Returns the palette (sRGB 0..1) and one palette index per triangle.
 */
export function trianglePalette(
  colors: Float32Array,
  indices: Uint32Array,
  max = 16,
  fixed?: [number, number, number][] | null,
): { palette: [number, number, number][]; tri: Uint16Array } {
  const nt = indices.length / 3;
  if (fixed && fixed.length) return snapToPalette(colors, indices, fixed.slice(0, Math.max(1, max)));
  const key = new Uint32Array(nt);
  const sum = new Map<number, { n: number; r: number; g: number; b: number }>();
  for (let t = 0; t < nt; t++) {
    let r = 0,
      g = 0,
      b = 0;
    for (let k = 0; k < 3; k++) {
      const v = indices[t * 3 + k] * 3;
      r += colors[v];
      g += colors[v + 1];
      b += colors[v + 2];
    }
    r /= 3;
    g /= 3;
    b /= 3;
    const q = (x: number) => Math.max(0, Math.min(31, Math.round(x * 31)));
    const kk = (q(r) << 10) | (q(g) << 5) | q(b);
    key[t] = kk;
    const s = sum.get(kk);
    if (s) {
      s.n++;
      s.r += r;
      s.g += g;
      s.b += b;
    } else sum.set(kk, { n: 1, r, g, b });
  }
  // Greedy clustering, most-used first: a bin joins an existing colour when it
  // is close to it (blend zones between shapes), otherwise starts a new one
  // while there is room. Keeps the palette short enough to map to filaments.
  const bins = [...sum.entries()].sort((a, b) => b[1].n - a[1].n);
  const palette: [number, number, number][] = [];
  const lookup = new Map<number, number>();
  const MERGE = 0.15 * 0.15;
  for (const [k, s] of bins) {
    const c = [s.r / s.n, s.g / s.n, s.b / s.n];
    let best = -1,
      bd = Infinity;
    palette.forEach((p, i) => {
      const d = (p[0] - c[0]) ** 2 + (p[1] - c[1]) ** 2 + (p[2] - c[2]) ** 2;
      if (d < bd) {
        bd = d;
        best = i;
      }
    });
    if (best < 0 || (bd > MERGE && palette.length < Math.max(1, max))) {
      palette.push([c[0], c[1], c[2]]);
      best = palette.length - 1;
    }
    lookup.set(k, best);
  }
  // Fold colours that cover under 1% of the surface (thin blend fringes) into
  // the nearest main colour, then renumber.
  const count = new Array<number>(palette.length).fill(0);
  for (const [k, s] of bins) count[lookup.get(k)!] += s.n;
  const major = palette.map((_, i) => count[i] >= nt * 0.01);
  if (!major.some(Boolean)) major[0] = true;
  const remap = palette.map((p, i) => {
    if (major[i]) return i;
    let best = 0,
      bd = Infinity;
    palette.forEach((q, j) => {
      const d = (p[0] - q[0]) ** 2 + (p[1] - q[1]) ** 2 + (p[2] - q[2]) ** 2;
      if (major[j] && d < bd) {
        bd = d;
        best = j;
      }
    });
    return best;
  });
  const newIndex = new Map<number, number>();
  const finalPalette: [number, number, number][] = [];
  palette.forEach((p, i) => {
    if (major[i]) {
      newIndex.set(i, finalPalette.length);
      finalPalette.push(p);
    }
  });
  const tri = new Uint16Array(nt);
  for (let t = 0; t < nt; t++) tri[t] = newIndex.get(remap[lookup.get(key[t])!])!;
  return { palette: finalPalette, tri };
}

/** Assign each triangle to the nearest given colour; unused colours are dropped. */
function snapToPalette(
  colors: Float32Array,
  indices: Uint32Array,
  fixed: [number, number, number][],
): { palette: [number, number, number][]; tri: Uint16Array } {
  const nt = indices.length / 3;
  const raw = new Uint16Array(nt);
  const used = new Array<boolean>(fixed.length).fill(false);
  for (let t = 0; t < nt; t++) {
    let r = 0,
      g = 0,
      b = 0;
    for (let k = 0; k < 3; k++) {
      const v = indices[t * 3 + k] * 3;
      r += colors[v] / 3;
      g += colors[v + 1] / 3;
      b += colors[v + 2] / 3;
    }
    let best = 0,
      bd = Infinity;
    for (let i = 0; i < fixed.length; i++) {
      const d = (fixed[i][0] - r) ** 2 + (fixed[i][1] - g) ** 2 + (fixed[i][2] - b) ** 2;
      if (d < bd) {
        bd = d;
        best = i;
      }
    }
    raw[t] = best;
    used[best] = true;
  }
  const renum = new Array<number>(fixed.length).fill(0);
  const palette: [number, number, number][] = [];
  fixed.forEach((c, i) => {
    if (used[i]) {
      renum[i] = palette.length;
      palette.push(c);
    }
  });
  const tri = new Uint16Array(nt);
  for (let t = 0; t < nt; t++) tri[t] = renum[raw[t]];
  return { palette, tri };
}

/** The XML of 3D/3dmodel.model. Positions must already be in millimetres, Z up. */
export function threeMfModel(positions: Float32Array, indices: Uint32Array, opts: ThreeMfOptions): string {
  const title = xmlEscape(opts.title || 'shape');
  const date = opts.date ?? new Date().toISOString().slice(0, 10);
  const parts: string[] = [];
  parts.push(
    '<?xml version="1.0" encoding="UTF-8"?>\n',
    '<model unit="millimeter" xml:lang="en-US" xmlns="http://schemas.microsoft.com/3dmanufacturing/core/2015/02">\n',
    ` <metadata name="Title">${title}</metadata>\n`,
    ` <metadata name="Application">${xmlEscape(CREDIT)}</metadata>\n`,
    ` <metadata name="Description">${xmlEscape(`Made with ${CREDIT} - ${SITE}`)}</metadata>\n`,
    ` <metadata name="CreationDate">${date}</metadata>\n`,
    ' <resources>\n',
  );
  let pal: ReturnType<typeof trianglePalette> | null = null;
  if (opts.colors) {
    pal = trianglePalette(opts.colors, indices, opts.maxColors ?? 16, opts.palette);
    parts.push('  <basematerials id="1">\n');
    pal.palette.forEach((c, i) =>
      parts.push(
        `   <base name="Colour ${i + 1}" displaycolor="#${hex2(c[0])}${hex2(c[1])}${hex2(c[2])}"/>\n`,
      ),
    );
    parts.push('  </basematerials>\n');
  }
  const objAttrs = pal ? ` pid="1" pindex="${pal.tri[0] ?? 0}"` : '';
  parts.push(`  <object id="2" type="model" name="${title}"${objAttrs}>\n   <mesh>\n    <vertices>\n`);
  const f = (v: number) => {
    const s = v.toFixed(4);
    return s === '-0.0000' ? '0' : s.replace(/\.?0+$/, '');
  };
  for (let i = 0; i < positions.length; i += 3)
    parts.push(
      `     <vertex x="${f(positions[i])}" y="${f(positions[i + 1])}" z="${f(positions[i + 2])}"/>\n`,
    );
  parts.push('    </vertices>\n    <triangles>\n');
  for (let t = 0; t < indices.length; t += 3) {
    const p = pal ? ` pid="1" p1="${pal.tri[t / 3]}"` : '';
    parts.push(`     <triangle v1="${indices[t]}" v2="${indices[t + 1]}" v3="${indices[t + 2]}"${p}/>\n`);
  }
  parts.push('    </triangles>\n   </mesh>\n  </object>\n </resources>\n');
  parts.push(' <build>\n  <item objectid="2"/>\n </build>\n</model>\n');
  return parts.join('');
}

/** A complete .3mf package. */
export async function write3MF(
  positions: Float32Array,
  indices: Uint32Array,
  opts: ThreeMfOptions,
): Promise<ArrayBuffer> {
  const enc = new TextEncoder();
  const thumb = opts.thumbnail && opts.thumbnail.length ? opts.thumbnail : null;
  const types =
    '<?xml version="1.0" encoding="UTF-8"?>\n' +
    '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">' +
    '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>' +
    '<Default Extension="model" ContentType="application/vnd.ms-package.3dmanufacturing-3dmodel+xml"/>' +
    (thumb ? '<Default Extension="png" ContentType="image/png"/>' : '') +
    '</Types>\n';
  const rels =
    '<?xml version="1.0" encoding="UTF-8"?>\n' +
    '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
    '<Relationship Target="/3D/3dmodel.model" Id="rel0" Type="http://schemas.microsoft.com/3dmanufacturing/2013/01/3dmodel"/>' +
    (thumb
      ? '<Relationship Target="/Metadata/thumbnail.png" Id="rel1" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/thumbnail"/>'
      : '') +
    '</Relationships>\n';
  const entries: ZipEntry[] = [
    { name: '[Content_Types].xml', data: enc.encode(types) },
    { name: '_rels/.rels', data: enc.encode(rels) },
    { name: '3D/3dmodel.model', data: enc.encode(threeMfModel(positions, indices, opts)) },
  ];
  if (thumb) entries.push({ name: 'Metadata/thumbnail.png', data: thumb, store: true });
  return writeZip(entries);
}
