import {
  type Analysis,
  type Compiled,
  type Evaluator,
  analyze,
  compile,
  makeEvaluator,
  packParams,
} from '../core/compile';
import type { SdfDoc } from '../core/graph/doc';

export interface SceneState {
  doc: SdfDoc;
  compiled: Compiled;
  P: Float32Array;
  analysis: Analysis;
  /** CPU evaluator (map/color/pick), shares P */
  evaluator: () => Evaluator;
}

let last: SceneState | null = null;
let lastRoot: string | null = null;
let lastSel: string | null = null;
let evalCache: { compiled: Compiled; ev: Evaluator } | null = null;

/**
 * Compile the document (cheap) and reuse the previous compilation object when
 * the generated code is unchanged, so only the parameter array is updated.
 */
export function getScene(doc: SdfDoc, viewRoot: string | null, selected: string | null): SceneState {
  if (last && last.doc === doc && lastRoot === viewRoot && lastSel === selected) return last;
  let compiled = compile(doc, { root: viewRoot ?? undefined });
  if (
    last &&
    lastRoot === viewRoot &&
    last.compiled.glsl === compiled.glsl &&
    last.compiled.jsMap === compiled.jsMap
  )
    compiled = last.compiled;
  const P =
    last && last.compiled === compiled ? new Float32Array(last.P) : new Float32Array(compiled.paramCount);
  packParams(doc, compiled, P, selected);
  const analysis = analyze(doc, compiled.rootId);
  const state: SceneState = {
    doc,
    compiled,
    P,
    analysis,
    evaluator: () => {
      if (!evalCache || evalCache.compiled !== compiled)
        evalCache = { compiled, ev: makeEvaluator(compiled) };
      evalCache.ev.P.set(P);
      return evalCache.ev;
    },
  };
  last = state;
  lastRoot = viewRoot;
  lastSel = selected;
  return state;
}
