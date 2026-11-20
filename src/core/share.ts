import { type SdfDoc, normalizeDoc } from './graph/doc';
import { defaultParams } from './nodes/registry';
import type { ParamValue } from './nodes/types';

/**
 * Compact, URL-safe encoding of a document: params equal to their defaults
 * are dropped, numbers are rounded, then the JSON is deflated and base64url
 * encoded. Links need no server: everything lives in the URL hash.
 */

type Packed = {
  v: 1;
  t: string;
  n: [string, string, number, number, Record<string, ParamValue>, string?][];
  e: [string, string, string][];
  /** pinned: node, param, label ('' = default), animation [from, to, seconds] */
  p?: [string, string, string?, [number, number, number]?][];
  s?: { u?: number; m?: string };
  /** groups: name, member ids, collapsed (1/0), exposed settings [node, param, label?] */
  g?: [string, string[], number, [string, string, string?][]][];
};

const round = (v: number) => Math.round(v * 1e5) / 1e5;
const roundV = (v: ParamValue): ParamValue =>
  typeof v === 'number' ? round(v) : Array.isArray(v) ? v.map(round) : v;
const same = (a: ParamValue, b: ParamValue) => JSON.stringify(roundV(a)) === JSON.stringify(roundV(b));

export function pack(doc: SdfDoc): Packed {
  // short ids: index-based
  const idMap = new Map(doc.nodes.map((n, i) => [n.id, n.type === 'output' ? 'out' : i.toString(36)]));
  const out: Packed = {
    v: 1,
    t: doc.title,
    n: doc.nodes.map((n) => {
      const defs = defaultParams(n.type);
      const params: Record<string, ParamValue> = {};
      for (const [k, v] of Object.entries(n.params)) if (!same(v, defs[k])) params[k] = roundV(v);
      const row: Packed['n'][number] = [idMap.get(n.id)!, n.type, Math.round(n.x), Math.round(n.y), params];
      if (n.name) row.push(n.name);
      return row;
    }),
    e: doc.edges.map((e) => [idMap.get(e.source)!, idMap.get(e.target)!, e.input]),
  };
  if (doc.pinned.length)
    out.p = doc.pinned.map((p) => {
      const row: NonNullable<Packed['p']>[number] = [idMap.get(p.node)!, p.param];
      if (p.label || p.anim) row.push(p.label ?? '');
      if (p.anim) row.push([round(p.anim.from), round(p.anim.to), round(p.anim.seconds)]);
      return row;
    });
  if (doc.groups?.length)
    out.g = doc.groups.map((g) => [
      g.name,
      g.members.map((m) => idMap.get(m)!),
      g.collapsed ? 1 : 0,
      g.exposed.map((s) => {
        const row: [string, string, string?] = [idMap.get(s.node)!, s.param];
        if (s.label) row.push(s.label);
        return row;
      }),
    ]);
  if (doc.settings.mmPerUnit !== 10 || doc.settings.material !== 'clay')
    out.s = { u: doc.settings.mmPerUnit, m: doc.settings.material };
  return out;
}

export function unpack(p: Packed): SdfDoc {
  if (!p || p.v !== 1 || !Array.isArray(p.n)) throw new Error('Unsupported link format');
  return normalizeDoc({
    version: 1,
    title: p.t,
    nodes: p.n.map(([id, type, x, y, params, name]) => ({ id, type, x, y, params, name })),
    edges: (p.e ?? []).map(([source, target, input], i) => ({ id: `e${i}`, source, target, input })),
    pinned: (p.p ?? []).map(([node, param, label, anim]) => ({
      node,
      param,
      label: label || undefined,
      anim: Array.isArray(anim) ? { from: anim[0], to: anim[1], seconds: anim[2] } : undefined,
    })),
    settings: { mmPerUnit: p.s?.u ?? 10, material: (p.s?.m as SdfDoc['settings']['material']) ?? 'clay' },
    groups: Array.isArray(p.g)
      ? p.g.map((row, i) => ({
          id: `g${i}`,
          name: row?.[0],
          members: row?.[1],
          collapsed: row?.[2] !== 0,
          exposed: Array.isArray(row?.[3])
            ? row[3].map((s) => ({ node: s?.[0], param: s?.[1], label: s?.[2] }))
            : [],
        }))
      : undefined,
  });
}

function toBase64Url(bytes: Uint8Array): string {
  let s = '';
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
function fromBase64Url(s: string): Uint8Array {
  const b = atob(s.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((s.length + 3) % 4));
  const out = new Uint8Array(b.length);
  for (let i = 0; i < b.length; i++) out[i] = b.charCodeAt(i);
  return out;
}

async function streamBytes(
  data: Uint8Array,
  stream: CompressionStream | DecompressionStream,
): Promise<Uint8Array> {
  const res = new Response(new Blob([data as BlobPart]).stream().pipeThrough(stream));
  return new Uint8Array(await res.arrayBuffer());
}

export async function encodeDoc(doc: SdfDoc): Promise<string> {
  const json = new TextEncoder().encode(JSON.stringify(pack(doc)));
  const z = await streamBytes(json, new CompressionStream('deflate-raw'));
  return toBase64Url(z);
}

export async function decodeDoc(code: string): Promise<SdfDoc> {
  const bytes = await streamBytes(fromBase64Url(code.trim()), new DecompressionStream('deflate-raw'));
  if (bytes.length > 2_000_000) throw new Error('Link too large');
  return unpack(JSON.parse(new TextDecoder().decode(bytes)));
}

/** Build a share URL for the current page location. */
export async function shareUrl(doc: SdfDoc, base = location.href): Promise<string> {
  const u = new URL(base);
  u.hash = `g=${await encodeDoc(doc)}`;
  return u.toString();
}

export function parseHash(
  hash: string,
): { kind: 'graph'; code: string } | { kind: 'example'; id: string } | null {
  const h = hash.replace(/^#/, '');
  const params = new URLSearchParams(h);
  const g = params.get('g');
  if (g) return { kind: 'graph', code: g };
  const ex = params.get('example');
  if (ex) return { kind: 'example', id: ex };
  return null;
}
