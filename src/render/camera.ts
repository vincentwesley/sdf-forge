import type { AABB } from '../core/nodes/types';

export interface OrbitCamera {
  target: [number, number, number];
  yaw: number; // radians, around Y
  pitch: number; // radians, positive looks down
  distance: number;
  fov: number; // vertical, degrees
}

export function defaultCamera(): OrbitCamera {
  return { target: [0, 0, 0], yaw: 0.65, pitch: 0.42, distance: 7, fov: 35 };
}

export type Vec3 = [number, number, number];

export function cameraBasis(c: OrbitCamera): { pos: Vec3; right: Vec3; up: Vec3; back: Vec3 } {
  const cp = Math.cos(c.pitch),
    sp = Math.sin(c.pitch);
  const cy = Math.cos(c.yaw),
    sy = Math.sin(c.yaw);
  const back: Vec3 = [sy * cp, sp, cy * cp]; // from target toward camera
  const pos: Vec3 = [
    c.target[0] + back[0] * c.distance,
    c.target[1] + back[1] * c.distance,
    c.target[2] + back[2] * c.distance,
  ];
  const right: Vec3 = [cy, 0, -sy];
  const up: Vec3 = [
    back[1] * right[2] - back[2] * right[1],
    back[2] * right[0] - back[0] * right[2],
    back[0] * right[1] - back[1] * right[0],
  ];
  return { pos, right, up, back };
}

/** Column-major mat3 [right, up, back] for GLSL. */
export function cameraMatrix(c: OrbitCamera): Float32Array {
  const { right, up, back } = cameraBasis(c);
  return new Float32Array([...right, ...up, ...back]);
}

/** Ray through a point in normalised device coordinates (x right, y up, aspect-corrected like the shader). */
export function cameraRay(c: OrbitCamera, ndcX: number, ndcY: number): { ro: Vec3; rd: Vec3 } {
  const { pos, right, up, back } = cameraBasis(c);
  const t = Math.tan(((c.fov / 2) * Math.PI) / 180);
  const dx = ndcX * t,
    dy = ndcY * t;
  const rd: Vec3 = [
    right[0] * dx + up[0] * dy - back[0],
    right[1] * dx + up[1] * dy - back[1],
    right[2] * dx + up[2] * dy - back[2],
  ];
  const l = Math.hypot(...rd);
  return { ro: pos, rd: [rd[0] / l, rd[1] / l, rd[2] / l] };
}

/** Project a world point to pixel coordinates (origin top-left) for a viewport of w x h. */
export function project(
  c: OrbitCamera,
  p: Vec3,
  w: number,
  h: number,
): { x: number; y: number; depth: number } | null {
  const { pos, right, up, back } = cameraBasis(c);
  const v: Vec3 = [p[0] - pos[0], p[1] - pos[1], p[2] - pos[2]];
  const z = -(v[0] * back[0] + v[1] * back[1] + v[2] * back[2]);
  if (z <= 1e-4) return null;
  const t = Math.tan(((c.fov / 2) * Math.PI) / 180);
  const x = (v[0] * right[0] + v[1] * right[1] + v[2] * right[2]) / (z * t);
  const y = (v[0] * up[0] + v[1] * up[1] + v[2] * up[2]) / (z * t);
  return { x: (x * h) / 2 + w / 2, y: h / 2 - (y * h) / 2, depth: z };
}

/** Frame a bounding box: centre the target and choose a distance that fits it. */
export function frameBounds(c: OrbitCamera, b: AABB | null, aspect = 1.5): OrbitCamera {
  if (!b) return { ...c, target: [0, 0, 0], distance: 7 };
  const center: Vec3 = [(b.min[0] + b.max[0]) / 2, (b.min[1] + b.max[1]) / 2, (b.min[2] + b.max[2]) / 2];
  const r = Math.max(0.25, Math.hypot(b.max[0] - b.min[0], b.max[1] - b.min[1], b.max[2] - b.min[2]) / 2);
  const half = ((c.fov / 2) * Math.PI) / 180;
  const fit = Math.min(half, Math.atan(Math.tan(half) * Math.min(aspect, 1)));
  return { ...c, target: center, distance: (r / Math.sin(fit)) * 0.92 };
}
