/**
 * Value noise with an integer hash. The GLSL and JS versions are written to
 * produce the same values (up to float32 rounding) so the preview and the
 * exported mesh agree.
 */

export const GLSL_NOISE = /* glsl */ `
uint sfHash(ivec3 c) {
  uvec3 q = uvec3(c + 32768);
  uint h = (q.x * 0x8da6b343u) ^ (q.y * 0xd8163841u) ^ (q.z * 0xcb1ab31fu);
  h ^= h >> 16; h *= 0x7feb352du; h ^= h >> 15; h *= 0x846ca68bu; h ^= h >> 16;
  return h;
}
float sfVal(ivec3 c) { return float(sfHash(c) >> 8) * (2.0 / 16777215.0) - 1.0; }
float sfNoise(vec3 p) {
  vec3 i = floor(p);
  vec3 f = p - i;
  vec3 u = f * f * f * (f * (f * 6.0 - 15.0) + 10.0);
  ivec3 c = ivec3(i);
  float a = sfVal(c), b = sfVal(c + ivec3(1, 0, 0));
  float cc = sfVal(c + ivec3(0, 1, 0)), d = sfVal(c + ivec3(1, 1, 0));
  float e = sfVal(c + ivec3(0, 0, 1)), g = sfVal(c + ivec3(1, 0, 1));
  float h = sfVal(c + ivec3(0, 1, 1)), k = sfVal(c + ivec3(1, 1, 1));
  float x0 = mix(mix(a, b, u.x), mix(cc, d, u.x), u.y);
  float x1 = mix(mix(e, g, u.x), mix(h, k, u.x), u.y);
  return mix(x0, x1, u.z);
}
`;

function hash(x: number, y: number, z: number): number {
  const qx = (x + 32768) | 0,
    qy = (y + 32768) | 0,
    qz = (z + 32768) | 0;
  let h = Math.imul(qx, 0x8da6b343) ^ Math.imul(qy, 0xd8163841) ^ Math.imul(qz, 0xcb1ab31f);
  h ^= h >>> 16;
  h = Math.imul(h, 0x7feb352d);
  h ^= h >>> 15;
  h = Math.imul(h, 0x846ca68b);
  h ^= h >>> 16;
  return h >>> 0;
}

function val(x: number, y: number, z: number): number {
  return (hash(x, y, z) >>> 8) * (2.0 / 16777215.0) - 1.0;
}

const mix = (a: number, b: number, t: number) => a + (b - a) * t;

export function noise3(px: number, py: number, pz: number): number {
  const ix = Math.floor(px),
    iy = Math.floor(py),
    iz = Math.floor(pz);
  const fx = px - ix,
    fy = py - iy,
    fz = pz - iz;
  const ux = fx * fx * fx * (fx * (fx * 6 - 15) + 10);
  const uy = fy * fy * fy * (fy * (fy * 6 - 15) + 10);
  const uz = fz * fz * fz * (fz * (fz * 6 - 15) + 10);
  const a = val(ix, iy, iz),
    b = val(ix + 1, iy, iz);
  const c = val(ix, iy + 1, iz),
    d = val(ix + 1, iy + 1, iz);
  const e = val(ix, iy, iz + 1),
    g = val(ix + 1, iy, iz + 1);
  const h = val(ix, iy + 1, iz + 1),
    k = val(ix + 1, iy + 1, iz + 1);
  const x0 = mix(mix(a, b, ux), mix(c, d, ux), uy);
  const x1 = mix(mix(e, g, ux), mix(h, k, ux), uy);
  return mix(x0, x1, uz);
}

/** Upper bound of |grad noise3|: quintic fade has max slope 1.875, values span 2. */
export const NOISE_LIPSCHITZ = 2 * 1.875 * Math.sqrt(3);
