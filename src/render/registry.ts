import type { Renderer } from './renderer';

let current: Renderer | null = null;
export function setActiveRenderer(r: Renderer | null) {
  current = r;
}
export function getActiveRenderer(): Renderer | null {
  return current;
}
