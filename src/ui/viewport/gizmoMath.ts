import { type SdfDoc, nodeById } from '../../core/graph/doc';
import { getDef } from '../../core/nodes/registry';
import { eulerMatrix } from '../../core/nodes/lib';

/** 3x3 row-major matrix helpers */
type M3 = number[];
const I3: M3 = [1, 0, 0, 0, 1, 0, 0, 0, 1];
function mul(a: M3, b: M3): M3 {
  const o = new Array(9).fill(0);
  for (let r = 0; r < 3; r++)
    for (let c = 0; c < 3; c++) for (let k = 0; k < 3; k++) o[r * 3 + c] += a[r * 3 + k] * b[k * 3 + c];
  return o;
}
function apply(m: M3, v: number[]): [number, number, number] {
  return [0, 1, 2].map((r) => m[r * 3] * v[0] + m[r * 3 + 1] * v[1] + m[r * 3 + 2] * v[2]) as [
    number,
    number,
    number,
  ];
}
function inverse(m: M3): M3 {
  const [a, b, c, d, e, f, g, h, i] = m;
  const A = e * i - f * h,
    B = -(d * i - f * g),
    C = d * h - e * g;
  const det = a * A + b * B + c * C;
  if (Math.abs(det) < 1e-12) return I3;
  const inv = [
    A,
    -(b * i - c * h),
    b * f - c * e,
    B,
    a * i - c * g,
    -(a * f - c * d),
    C,
    -(a * h - b * g),
    a * e - b * d,
  ];
  return inv.map((v) => v / det);
}

export interface Placement {
  /** world position of the node's local origin */
  origin: [number, number, number];
  /** maps a world-space delta to a delta of the node's `position` param */
  worldToParam: M3;
  /** world directions of the node's parent space axes */
  movable: boolean;
}

/**
 * Where a node sits in the world, following the first path from the node to
 * the Output and composing any placement transforms on the way (Transform,
 * Extrude, Revolve). Space warps (twist, bend…) are ignored for the gizmo.
 */
export function placementOf(doc: SdfDoc, nodeId: string): Placement | null {
  const node = nodeById(doc, nodeId);
  const def = node && getDef(node.type);
  if (!node || !def || def.transform !== 3) return null;
  // walk downstream
  let lin: M3 = I3;
  let off: [number, number, number] = [0, 0, 0];
  let cur = nodeId;
  const seen = new Set<string>();
  for (;;) {
    const e = doc.edges.find((x) => x.source === cur);
    if (!e || seen.has(e.target)) break;
    seen.add(e.target);
    const n = nodeById(doc, e.target)!;
    const d = getDef(n.type);
    if (d?.transform === 3) {
      const s = (n.params.scale as number) ?? 1;
      const R = eulerMatrix(n.params.rotation as number[]).map((v) => v * s);
      const pos = n.params.position as number[];
      // parent transform applied after current: x_world = R * x + pos
      off = apply(R, off).map((v, i) => v + pos[i]) as [number, number, number];
      lin = mul(R, lin);
    } else if (d?.output === 'sdf2') return null;
    cur = e.target;
  }
  const p = node.params.position as number[];
  const origin = apply(lin, p).map((v, i) => v + off[i]) as [number, number, number];
  return { origin, worldToParam: inverse(lin), movable: true };
}

export function worldDeltaToParam(pl: Placement, delta: number[]): [number, number, number] {
  return apply(pl.worldToParam, delta);
}

/** Euler angles in degrees (R = Rz·Ry·Rx, as eulerMatrix) from a rotation matrix. */
export function matrixToEuler(m: M3): [number, number, number] {
  const sy = Math.max(-1, Math.min(1, -m[6]));
  const ay = Math.asin(sy);
  let ax: number, az: number;
  if (Math.abs(Math.cos(ay)) > 1e-6) {
    ax = Math.atan2(m[7], m[8]);
    az = Math.atan2(m[3], m[0]);
  } else {
    // gimbal lock: put everything in X
    az = 0;
    ax = Math.atan2(-m[5], m[4]);
  }
  const deg = (r: number) => Math.round(((r * 180) / Math.PI) * 1e4) / 1e4;
  return [deg(ax), deg(ay), deg(az)];
}

/** Rotation by `angle` radians about the unit vector `a` (Rodrigues). */
export function axisAngle(a: number[], angle: number): M3 {
  const [x, y, z] = a;
  const c = Math.cos(angle),
    s = Math.sin(angle),
    t = 1 - c;
  return [
    t * x * x + c,
    t * x * y - s * z,
    t * x * z + s * y,
    t * x * y + s * z,
    t * y * y + c,
    t * y * z - s * x,
    t * x * z - s * y,
    t * y * z + s * x,
    t * z * z + c,
  ];
}

/**
 * New `rotation` param after turning a node by `angle` radians about a world
 * axis: the axis is brought into the node's parent space first, so nested
 * transforms (Transform, Revolve…) still turn the way the ring shows.
 */
export function rotateParam(pl: Placement, euler: number[], worldAxis: number[], angle: number): number[] {
  const a = apply(pl.worldToParam, worldAxis);
  const l = Math.hypot(...a) || 1;
  const R = mul(axisAngle([a[0] / l, a[1] / l, a[2] / l], angle), eulerMatrix(euler));
  return matrixToEuler(R);
}
