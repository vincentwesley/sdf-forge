import { useEffect, useState } from 'react';
import { useEditor } from '../state/store';
import type { SceneTheme } from '../render/renderer';

export type Resolved = 'dark' | 'light';

export function useResolvedTheme(): Resolved {
  const pref = useEditor((s) => s.theme);
  const [sys, setSys] = useState<Resolved>(() =>
    typeof matchMedia !== 'undefined' && matchMedia('(prefers-color-scheme: light)').matches
      ? 'light'
      : 'dark',
  );
  useEffect(() => {
    const mq = matchMedia('(prefers-color-scheme: light)');
    const on = () => setSys(mq.matches ? 'light' : 'dark');
    mq.addEventListener('change', on);
    return () => mq.removeEventListener('change', on);
  }, []);
  const resolved = pref === 'system' ? sys : pref;
  useEffect(() => {
    document.documentElement.dataset.theme = resolved;
    document
      .querySelector('meta[name="theme-color"]')
      ?.setAttribute('content', resolved === 'dark' ? '#17181b' : '#ffffff');
  }, [resolved]);
  return resolved;
}

export const SCENE_THEMES: Record<Resolved, SceneTheme> = {
  dark: {
    bgTop: [0.135, 0.14, 0.155],
    bgBottom: [0.07, 0.072, 0.08],
    ground: [0.085, 0.088, 0.097],
    selection: [1.0, 0.55, 0.2],
  },
  light: {
    bgTop: [0.97, 0.97, 0.965],
    bgBottom: [0.86, 0.865, 0.86],
    ground: [0.9, 0.9, 0.895],
    selection: [1.0, 0.45, 0.1],
  },
};

export function usePrefersReducedMotion(): boolean {
  const [r, setR] = useState(
    () => typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches,
  );
  useEffect(() => {
    const mq = matchMedia('(prefers-reduced-motion: reduce)');
    const on = () => setR(mq.matches);
    mq.addEventListener('change', on);
    return () => mq.removeEventListener('change', on);
  }, []);
  return r;
}
