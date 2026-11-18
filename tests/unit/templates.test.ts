import { describe, expect, it } from 'vitest';
import { EXAMPLES } from '../../src/gallery/examples';
import { analyze, compile, makeEvaluator, packParams } from '../../src/core/compile';
import { paramsOf } from '../../src/core/nodes/registry';
import type { SdfDoc } from '../../src/core/graph/doc';
import { setParam } from '../../src/state/ops';

/** Count sample points inside the shape. */
function insideFraction(doc: SdfDoc) {
  const c = compile(doc);
  expect(c.issues.filter((i) => i.level === 'error')).toEqual([]);
  const P = new Float32Array(c.paramCount);
  packParams(doc, c, P);
  const b = analyze(doc, c.rootId).bounds;
  expect(b).toBeTruthy();
  const ev = makeEvaluator(c, P);
  let n = 0;
  const N = 24;
  for (let i = 0; i < N; i++)
    for (let j = 0; j < N; j++)
      for (let k = 0; k < N; k++) {
        const x = b!.min[0] + ((i + 0.5) / N) * (b!.max[0] - b!.min[0]);
        const y = b!.min[1] + ((j + 0.5) / N) * (b!.max[1] - b!.min[1]);
        const z = b!.min[2] + ((k + 0.5) / N) * (b!.max[2] - b!.min[2]);
        if (ev.map(x, y, z) < 0) n++;
      }
  return n / N ** 3;
}

describe('template Controls never break the shape', () => {
  for (const ex of EXAMPLES.filter((e) => e.build().pinned.length)) {
    it(ex.id, () => {
      const base = ex.build();
      expect(insideFraction(base)).toBeGreaterThan(0.005);
      for (const pin of base.pinned) {
        const node = base.nodes.find((n) => n.id === pin.node)!;
        const def = paramsOf(node.type).find((p) => p.key === pin.param)!;
        if (def.kind !== 'float' && def.kind !== 'int' && def.kind !== 'vec2' && def.kind !== 'vec3')
          continue;
        const v = node.params[pin.param];
        const lo = (
          'softMin' in def && def.softMin !== undefined
            ? def.softMin
            : 'min' in def && def.min !== undefined
              ? def.min
              : 0
        ) as number;
        const hi = (
          'softMax' in def && def.softMax !== undefined
            ? def.softMax
            : 'max' in def && def.max !== undefined
              ? def.max
              : 1
        ) as number;
        // try half and double the current value, clamped to the slider range
        for (const f of [0.5, 1.5]) {
          const scaleV = (x: number) => Math.min(hi, Math.max(lo, x * f));
          const nv = Array.isArray(v) ? v.map(scaleV) : scaleV(v as number);
          const doc = setParam(base, node.id, pin.param, nv);
          expect(insideFraction(doc), `${ex.id}: ${pin.param} x${f}`).toBeGreaterThan(0.002);
        }
      }
    });
  }
});
