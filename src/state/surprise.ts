import { paramsOf } from '../core/nodes/registry';
import { commit, store, toast } from './store';
import { setParam } from './ops';

/**
 * "Surprise me": nudge every numeric setting of every node by a random amount
 * within its slider range, keeping the structure. One undo step.
 */
export function surpriseMe(amount = 0.35) {
  let doc = store.getState().doc;
  const rand = () => Math.random() * 2 - 1;
  for (const n of doc.nodes) {
    for (const p of paramsOf(n.type)) {
      if (p.group === 'transform' && p.key !== 'rotation') continue;
      const v = n.params[p.key];
      if (p.kind === 'float') {
        const lo = p.softMin ?? p.min ?? 0,
          hi = p.softMax ?? p.max ?? 1;
        let nv = (v as number) + rand() * (hi - lo) * amount * 0.5;
        nv = Math.max(p.min ?? -Infinity, Math.min(p.max ?? Infinity, nv));
        nv = Math.max(lo, Math.min(hi, nv));
        doc = setParam(doc, n.id, p.key, Math.round(nv * 1000) / 1000);
      } else if (p.kind === 'int' && !p.structural) {
        const hi = p.softMax ?? p.max;
        const nv = Math.max(p.min, Math.min(hi, Math.round((v as number) + rand() * 2)));
        doc = setParam(doc, n.id, p.key, nv);
      } else if (p.kind === 'color' && Math.random() < 0.5) {
        const c = v as number[];
        const nv = c.map((x) => Math.max(0.05, Math.min(1, x + rand() * 0.25)));
        doc = setParam(doc, n.id, p.key, nv);
      } else if (p.kind === 'vec3' && p.key === 'rotation') {
        const r = v as number[];
        doc = setParam(
          doc,
          n.id,
          p.key,
          r.map((x) => Math.round(x + rand() * 25)),
        );
      }
    }
  }
  commit(doc);
  toast('Shuffled the settings — press Ctrl+Z to undo.', 'info', 2500);
}
