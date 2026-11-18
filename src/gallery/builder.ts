import { type SdfDoc, emptyDoc, makeNode } from '../core/graph/doc';
import { applyLayout } from '../core/graph/layout';
import { getDef } from '../core/nodes/registry';
import type { MaterialStyle } from '../core/graph/doc';
import type { PinAnim } from '../core/animation';
import type { ParamValue } from '../core/nodes/types';

type Inputs = string[] | Record<string, string | string[]>;

/** Small DSL for writing example documents in code. */
export class DocBuilder {
  doc: SdfDoc;
  private n = 0;
  constructor(title: string, settings: { mmPerUnit?: number; material?: MaterialStyle } = {}) {
    this.doc = emptyDoc(title);
    this.doc.settings = { ...this.doc.settings, ...settings };
  }
  add(type: string, params: Record<string, ParamValue> = {}, inputs?: Inputs, name?: string): string {
    const def = getDef(type);
    if (!def) throw new Error(`unknown node type ${type}`);
    const id = `${type}${(this.n++).toString(36)}`;
    const node = makeNode(type, 0, 0, params, id);
    if (name) node.name = name;
    this.doc.nodes.push(node);
    if (inputs) {
      const map: Record<string, string[]> = {};
      if (Array.isArray(inputs)) map[def.inputs[0].key] = inputs;
      else for (const [k, v] of Object.entries(inputs)) map[k] = Array.isArray(v) ? v : [v];
      for (const [k, srcs] of Object.entries(map)) {
        if (!def.inputs.some((i) => i.key === k)) throw new Error(`${type} has no input ${k}`);
        for (const s of srcs)
          this.doc.edges.push({ id: `e${this.doc.edges.length}`, source: s, target: id, input: k });
      }
    }
    return id;
  }
  output(src: string) {
    this.doc.edges.push({ id: `e${this.doc.edges.length}`, source: src, target: 'out', input: 'shape' });
    return this;
  }
  pin(node: string, param: string, label?: string, anim?: PinAnim) {
    this.doc.pinned.push({ node, param, ...(label ? { label } : {}), ...(anim ? { anim } : {}) });
    return this;
  }
  done(): SdfDoc {
    return applyLayout(this.doc);
  }
}
