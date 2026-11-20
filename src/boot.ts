import { decodeDoc, parseHash } from './core/share';
import { exampleById, DEFAULT_EXAMPLE } from './gallery/examples';
import { actions, loadDoc, loadSavedDoc, toast } from './state/store';

function clearHash() {
  history.replaceState(null, '', location.pathname + location.search);
}

/** Load whatever the URL asks for (shared graph or example), else the autosave, else the welcome example. */
export async function bootDocument(initial: boolean) {
  const h = parseHash(location.hash);
  if (h?.view && initial) {
    // view-only player (embeds): show the shape, never touch the visitor's own saved work
    actions.set({ viewOnly: true });
    try {
      const doc =
        h.kind === 'graph'
          ? await decodeDoc(h.code)
          : (exampleById(h.id)?.build() ?? exampleById(DEFAULT_EXAMPLE)!.build());
      loadDoc(doc);
    } catch {
      loadDoc(exampleById(DEFAULT_EXAMPLE)!.build());
      toast('This link is damaged or incomplete, so it could not be opened.', 'error', 6000);
    }
    return;
  }
  if (h?.kind === 'graph') {
    try {
      const doc = await decodeDoc(h.code);
      loadDoc(doc, { keepHistory: !initial });
      toast(
        initial
          ? `Opened shared shape “${doc.title}”`
          : `Opened shared shape “${doc.title}”. Ctrl+Z goes back.`,
        'success',
      );
    } catch {
      toast('This share link is damaged or incomplete, so it could not be opened.', 'error', 6000);
      if (initial) loadDoc(loadSavedDoc() ?? exampleById(DEFAULT_EXAMPLE)!.build());
    }
    clearHash();
    return;
  }
  if (h?.kind === 'example') {
    const ex = exampleById(h.id);
    if (ex) loadDoc(ex.build(), { keepHistory: !initial });
    else toast(`There is no example called “${h.id}”.`, 'error');
    clearHash();
    if (ex || !initial) return;
  }
  if (initial) loadDoc(loadSavedDoc() ?? exampleById(DEFAULT_EXAMPLE)!.build());
}
