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
