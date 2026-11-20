/**
 * File writers for exported meshes. All files carry SDF Forge / Vin's Atelier
 * credit in their metadata.
 */
import { bboxOf } from './mesh';
import { exportRoughness, materialName } from '../material';
import type { SurfaceGroups } from './surfaces';

export const CREDIT = "SDF Forge by Vin's Atelier";
export const SITE = 'https://vincentwesley.github.io/sdf-forge/';

/** Convert Y-up scene units to Z-up millimetres, resting on z = 0 and centred in x/y. */
export function toPrintSpace(positions: Float32Array, mmPerUnit: number): Float32Array {
  const b = bboxOf(positions);
  const cx = (b.min[0] + b.max[0]) / 2,
    cz = (b.min[2] + b.max[2]) / 2,
    y0 = b.min[1];
  const out = new Float32Array(positions.length);
  for (let i = 0; i < positions.length; i += 3) {
    const x = positions[i] - cx,
      y = positions[i + 1] - y0,
      z = positions[i + 2] - cz;
    // rotate +90° about X: (x, y, z) -> (x, -z, y)
    out[i] = x * mmPerUnit;
    out[i + 1] = -z * mmPerUnit;
    out[i + 2] = y * mmPerUnit;
  }
  return out;
}

function header80(text: string): Uint8Array {
  const h = new Uint8Array(80).fill(0x20);
  const t = new TextEncoder().encode(text.replace(/^solid/i, 'Solid').slice(0, 80));
  h.set(t);
  return h;
}

/** Binary STL (positions already in output space). */
export function writeSTL(positions: Float32Array, indices: Uint32Array, title: string): ArrayBuffer {
  const nt = indices.length / 3;
  const buf = new ArrayBuffer(84 + nt * 50);
  const u8 = new Uint8Array(buf);
  u8.set(header80(`${CREDIT} - ${title}`.replace(/[^\x20-\x7e]/g, '?')), 0);
  const dv = new DataView(buf);
  dv.setUint32(80, nt, true);
  let o = 84;
  for (let t = 0; t < nt; t++) {
    const a = indices[t * 3] * 3,
      b = indices[t * 3 + 1] * 3,
      c = indices[t * 3 + 2] * 3;
    const ux = positions[b] - positions[a],
      uy = positions[b + 1] - positions[a + 1],
      uz = positions[b + 2] - positions[a + 2];
    const vx = positions[c] - positions[a],
      vy = positions[c + 1] - positions[a + 1],
      vz = positions[c + 2] - positions[a + 2];
    let nx = uy * vz - uz * vy,
      ny = uz * vx - ux * vz,
      nz = ux * vy - uy * vx;
    const l = Math.hypot(nx, ny, nz) || 1;
    nx /= l;
    ny /= l;
    nz /= l;
    dv.setFloat32(o, nx, true);
    dv.setFloat32(o + 4, ny, true);
    dv.setFloat32(o + 8, nz, true);
    o += 12;
    for (const v of [a, b, c]) {
      dv.setFloat32(o, positions[v], true);
      dv.setFloat32(o + 4, positions[v + 1], true);
      dv.setFloat32(o + 8, positions[v + 2], true);
      o += 12;
    }
    dv.setUint16(o, 0, true);
    o += 2;
  }
  return buf;
}

export function writeOBJ(
  positions: Float32Array,
  normals: Float32Array | null,
  indices: Uint32Array,
  title: string,
  colors?: Float32Array | null,
): string {
  const lines = [`# ${CREDIT}`, `# ${SITE}`, `# ${title}`, `o ${title.replace(/\s+/g, '_') || 'shape'}`];
  for (let i = 0; i < positions.length; i += 3) {
    const v = `v ${positions[i].toFixed(5)} ${positions[i + 1].toFixed(5)} ${positions[i + 2].toFixed(5)}`;
    lines.push(
      colors ? `${v} ${colors[i].toFixed(4)} ${colors[i + 1].toFixed(4)} ${colors[i + 2].toFixed(4)}` : v,
    );
  }
  if (normals)
    for (let i = 0; i < normals.length; i += 3)
      lines.push(`vn ${normals[i].toFixed(4)} ${normals[i + 1].toFixed(4)} ${normals[i + 2].toFixed(4)}`);
  for (let t = 0; t < indices.length; t += 3) {
    const a = indices[t] + 1,
      b = indices[t + 1] + 1,
      c = indices[t + 2] + 1;
    lines.push(normals ? `f ${a}//${a} ${b}//${b} ${c}//${c}` : `f ${a} ${b} ${c}`);
  }
  return lines.join('\n') + '\n';
}

export interface GlbOptions {
  title: string;
  /** metres per scene unit */
  scale: number;
  roughness: number;
  metallic: number;
  /** one primitive + material per colour/material group (vertex colours still carry blends) */
  groups?: SurfaceGroups | null;
}

/** glTF 2.0 binary with positions, normals, linear vertex colours and indices. Y-up, metres. */
export function writeGLB(
  positions: Float32Array,
  normals: Float32Array,
  colors: Float32Array | null,
  indices: Uint32Array,
  opts: GlbOptions,
): ArrayBuffer {
  const nv = positions.length / 3;
  const pos = new Float32Array(positions.length);
  for (let i = 0; i < positions.length; i++) pos[i] = positions[i] * opts.scale;
  const b = bboxOf(pos);
  const parts: ArrayBuffer[] = [];
  const views: { byteOffset: number; byteLength: number; target: number }[] = [];
  let offset = 0;
  const push = (arr: ArrayBufferView, target: number) => {
    const bytes = new Uint8Array(arr.buffer, arr.byteOffset, arr.byteLength);
    const padded = new Uint8Array(Math.ceil(bytes.length / 4) * 4);
    padded.set(bytes);
    views.push({ byteOffset: offset, byteLength: bytes.length, target });
    parts.push(padded.buffer);
    offset += padded.length;
    return views.length - 1;
  };
  const vPos = push(pos, 34962);
  const vNrm = push(normals, 34962);
  const vCol = colors ? push(colors, 34962) : -1;
  // one index list per surface group; all primitives share the vertex arrays
  const g = opts.groups && opts.groups.groups.length ? opts.groups : null;
  const lists: Uint32Array[] = [];
  if (g) {
    const counts = new Array<number>(g.groups.length).fill(0);
    for (let t = 0; t < g.tri.length; t++) counts[g.tri[t]]++;
    const fill = counts.map(() => 0);
    counts.forEach((n) => lists.push(new Uint32Array(n * 3)));
    for (let t = 0; t < g.tri.length; t++) {
      const k = g.tri[t];
      lists[k].set(indices.subarray(t * 3, t * 3 + 3), fill[k]);
      fill[k] += 3;
    }
  } else lists.push(indices);
  const vIdx = lists.map((l) => push(l, 34963));
  const accessors: Record<string, unknown>[] = [
    { bufferView: vPos, componentType: 5126, count: nv, type: 'VEC3', min: b.min, max: b.max },
    { bufferView: vNrm, componentType: 5126, count: nv, type: 'VEC3' },
  ];
  const attributes: Record<string, number> = { POSITION: 0, NORMAL: 1 };
  if (colors) {
    accessors.push({ bufferView: vCol, componentType: 5126, count: nv, type: 'VEC3' });
    attributes.COLOR_0 = accessors.length - 1;
  }
  const primitives = lists.map((l, k) => {
    accessors.push({ bufferView: vIdx[k], componentType: 5125, count: l.length, type: 'SCALAR' });
    return { attributes, indices: accessors.length - 1, material: k, mode: 4 };
  });
  const materials = g
    ? g.groups.map((s, i) => {
        const lin = s.color.map(srgbToLinear);
        return {
          name: materialName(s, i),
          pbrMetallicRoughness: {
            // the vertex colours (COLOR_0) carry the colour, including smooth blends
            baseColorFactor: [1, 1, 1, 1],
            metallicFactor: +s.metal.toFixed(3),
            roughnessFactor: +exportRoughness(s.rough).toFixed(3),
          },
          ...(s.glow > 1e-3 ? { emissiveFactor: lin.map((v) => +(v * s.glow).toFixed(4)) } : {}),
        };
      })
    : [
        {
          name: 'SDF Forge material',
          pbrMetallicRoughness: {
            baseColorFactor: [1, 1, 1, 1],
            metallicFactor: opts.metallic,
            roughnessFactor: opts.roughness,
          },
        },
      ];
  const gltf = {
    asset: {
      version: '2.0',
      generator: `${CREDIT} (${SITE})`,
      extras: { title: opts.title, tool: 'SDF Forge', studio: "Vin's Atelier" },
    },
    scene: 0,
    scenes: [{ name: opts.title, nodes: [0] }],
    nodes: [{ name: opts.title, mesh: 0 }],
    meshes: [{ name: opts.title, primitives }],
    materials,
    accessors,
    bufferViews: views.map((v) => ({ buffer: 0, ...v })),
    buffers: [{ byteLength: offset }],
  };
  const json = new TextEncoder().encode(JSON.stringify(gltf));
  const jsonPadded = new Uint8Array(Math.ceil(json.length / 4) * 4).fill(0x20);
  jsonPadded.set(json);
  const total = 12 + 8 + jsonPadded.length + 8 + offset;
  const out = new ArrayBuffer(total);
  const dv = new DataView(out);
  const u8 = new Uint8Array(out);
  dv.setUint32(0, 0x46546c67, true); // 'glTF'
  dv.setUint32(4, 2, true);
  dv.setUint32(8, total, true);
  dv.setUint32(12, jsonPadded.length, true);
  dv.setUint32(16, 0x4e4f534a, true); // 'JSON'
  u8.set(jsonPadded, 20);
  let o = 20 + jsonPadded.length;
  dv.setUint32(o, offset, true);
  dv.setUint32(o + 4, 0x004e4942, true); // 'BIN\0'
  o += 8;
  for (const p of parts) {
    u8.set(new Uint8Array(p), o);
    o += p.byteLength;
  }
  return out;
}

/** sRGB (0..1) to linear, for glTF vertex colours. */
export function srgbToLinear(c: number): number {
  c = Math.max(0, Math.min(1, c));
  return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
}
