/**
 * Control animation: a pinned numeric setting can swing smoothly between two
 * values. One cycle (from -> to -> from) lasts `seconds`, eased with a cosine
 * so the loop has no visible seam. Animation never edits the document: frames
 * are made by applying the values to a copy, so undo history and exports of
 * the model are unaffected.
 */
import type { Pinned, SdfDoc } from './graph/doc';
import type { ParamDef } from './nodes/types';
import { paramsOf } from './nodes/registry';

export interface PinAnim {
  from: number;
  to: number;
  /** length of one full cycle */
  seconds: number;
}

export const MIN_SECONDS = 0.5;
export const MAX_SECONDS = 60;

/** Plain numbers whose change does not recompile the shader. */
export function isAnimatable(def: ParamDef | undefined): boolean {
  return !!def && (def.kind === 'float' || def.kind === 'int') && !def.structural;
}

export function animValue(a: PinAnim, t: number): number {
  const phase = (((t / a.seconds) % 1) + 1) % 1;
  const k = 0.5 - 0.5 * Math.cos(2 * Math.PI * phase);
  return a.from + (a.to - a.from) * k;
}

export function hasAnimation(doc: SdfDoc): boolean {
  return doc.pinned.some((p) => !!p.anim);
}

/** Longest cycle among the animated Controls (seconds), or 0. */
export function animationPeriod(doc: SdfDoc): number {
  return doc.pinned.reduce((m, p) => Math.max(m, p.anim?.seconds ?? 0), 0);
}

/** The document as it looks at time t (a copy; the input is not modified). */
export function animatedDoc(doc: SdfDoc, t: number): SdfDoc {
  const anims = doc.pinned.filter((p) => p.anim);
  if (!anims.length) return doc;
  const byNode = new Map<string, Pinned[]>();
  for (const p of anims) byNode.set(p.node, [...(byNode.get(p.node) ?? []), p]);
  return {
    ...doc,
    nodes: doc.nodes.map((n) => {
      const pins = byNode.get(n.id);
      if (!pins) return n;
      const params = { ...n.params };
      for (const p of pins) {
        const def = paramsOf(n.type).find((d) => d.key === p.param);
        let v = animValue(p.anim!, t);
        if (def?.kind === 'int') v = Math.round(v);
        params[p.param] = v;
      }
      return { ...n, params };
    }),
  };
}

/** Clean an untrusted animation spec; null if unusable. */
export function sanitizeAnim(v: unknown): PinAnim | null {
  const a = v as Partial<PinAnim> | null;
  if (!a || typeof a !== 'object') return null;
  const { from, to, seconds } = a;
  if (![from, to, seconds].every((x) => typeof x === 'number' && Number.isFinite(x))) return null;
  return {
    from: from!,
    to: to!,
    seconds: Math.min(MAX_SECONDS, Math.max(MIN_SECONDS, seconds!)),
  };
}

/** A sensible first animation for a setting: from its value to the far end of its slider. */
export function defaultAnim(def: ParamDef, value: number): PinAnim {
  const d = def as { min?: number; max?: number; softMin?: number; softMax?: number };
  const lo = d.softMin ?? d.min ?? 0;
  const hi = d.softMax ?? d.max ?? Math.max(1, value * 2);
  const to = Math.abs(hi - value) >= Math.abs(value - lo) ? hi : lo;
  return { from: value, to: to === value ? value + 1 : to, seconds: 4 };
}
