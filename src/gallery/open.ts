import { actions, loadDoc, toast } from '../state/store';
import type { Example } from './examples';

/** Load an example into the editor (undoable) and close any dialog. */
export function openExample(ex: Example) {
  loadDoc(ex.build(), { keepHistory: true });
  actions.set({ dialog: null });
  toast(`Opened “${ex.title}”. Ctrl+Z goes back to what you had.`, 'info');
}
