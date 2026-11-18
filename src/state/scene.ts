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

interface Base {
  doc: SdfDoc;
  compiled: Compiled;
  analysis: Analysis;
}

// one compiled base per view root; one SceneState per (root, selection)
const bases = new Map<string, Base>();
const scenes = new Map<string, SceneState>();
let evalCache: { compiled: Compiled; ev: Evaluator } | null = null;

function baseFor(doc: SdfDoc, viewRoot: string | null): Base {
  const key = viewRoot ?? '';
  const prev = bases.get(key);
  if (prev && prev.doc === doc) return prev;
  let compiled = compile(doc, { root: viewRoot ?? undefined });
  // keep the previous object when the generated code is identical, so only params update
  if (prev && prev.compiled.glsl === compiled.glsl && prev.compiled.jsMap === compiled.jsMap)
    compiled = prev.compiled;
  const base = { doc, compiled, analysis: analyze(doc, compiled.rootId) };
  bases.set(key, base);
  if (bases.size > 4) bases.delete(bases.keys().next().value!);
  return base;
}

/**
 * Compile the document (cheap) and return a stable object for a given
 * document, view root and selection. Safe to call from React selectors.
 */
export function getScene(doc: SdfDoc, viewRoot: string | null, selected: string | null): SceneState {
  const key = `${viewRoot ?? ''}|${selected ?? ''}`;
  const hit = scenes.get(key);
  if (hit && hit.doc === doc) return hit;
  const base = baseFor(doc, viewRoot);
  const P = new Float32Array(base.compiled.paramCount);
  packParams(doc, base.compiled, P, selected);
  const compiled = base.compiled;
  const state: SceneState = {
    doc,
    compiled,
    P,
    analysis: base.analysis,
    evaluator: () => {
      if (!evalCache || evalCache.compiled !== compiled)
        evalCache = { compiled, ev: makeEvaluator(compiled) };
      evalCache.ev.P.set(P);
      return evalCache.ev;
    },
  };
  scenes.set(key, state);
  if (scenes.size > 16) scenes.delete(scenes.keys().next().value!);
  return state;
}
