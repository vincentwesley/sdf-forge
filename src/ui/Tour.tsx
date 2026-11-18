import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { actions, useEditor } from '../state/store';

interface Step {
  target: string;
  title: string;
  body: string;
}

const STEPS: Step[] = [
  {
    target: '#viewport',
    title: 'This is your shape',
    body: 'Drag to spin it, right-drag to pan, scroll or pinch to zoom. Click any part of the shape to select it.',
  },
  {
    target: '[data-tour="add"]',
    title: 'Add shapes',
    body: 'Click a shape to add it next to what you have. Switch to Carve and new shapes cut holes instead.',
  },
  {
    target: '[data-tour="props"]',
    title: 'Tweak anything',
    body: 'The selected shape’s settings live here. Drag a setting’s name left or right to scrub it. Drag the coloured arrows in the 3D view to move the shape.',
  },
  {
    target: '[data-tour="graph"]',
    title: 'How it’s built',
    body: 'Every shape is a recipe of nodes. Wires carry shapes from left to right into Output. Drag from a dot to connect, right-click to add a node, click the eye to view one node alone.',
  },
  {
    target: '[data-tour="export"]',
    title: 'Take it with you',
    body: 'Export a watertight STL for 3D printing, a GLB for games and 3D apps, a PNG, a turntable video or the shader code. Share puts the whole recipe in a link.',
  },
  {
    target: '[data-tour="gallery"]',
    title: 'Need ideas?',
    body: 'The gallery has examples and printable templates with simple Controls. Have fun!',
  },
];

export function startTour() {
  actions.set({ tour: 0, dialog: null });
}

function visibleTarget(sel: string): HTMLElement | null {
  const els = [...document.querySelectorAll<HTMLElement>(sel)];
  return els.find((e) => e.offsetParent !== null && e.getBoundingClientRect().width > 0) ?? null;
}

export function Tour() {
  const step = useEditor((s) => s.tour);
  const [rect, setRect] = useState<DOMRect | null>(null);
  const card = useRef<HTMLDivElement>(null);
  const next = useRef<HTMLButtonElement>(null);

  useLayoutEffect(() => {
    if (step === null) return;
    const s = STEPS[step];
    if (s.target === '[data-tour="props"]') actions.set({ narrowTab: 'props' });
    if (s.target === '[data-tour="graph"]') actions.set({ narrowTab: 'graph' });
    const measure = () => setRect(visibleTarget(s.target)?.getBoundingClientRect() ?? null);
    measure();
    const t = setTimeout(measure, 60);
    addEventListener('resize', measure);
    return () => {
      clearTimeout(t);
      removeEventListener('resize', measure);
    };
  }, [step]);

  useEffect(() => {
    if (step !== null) next.current?.focus();
  }, [step]);

  if (step === null) return null;
  const s = STEPS[step];
  const end = () => actions.set({ tour: null, tourDone: true });
  const last = step === STEPS.length - 1;
  // place the card beside the target, inside the window
  const cw = Math.min(330, innerWidth - 24);
  let left = 12,
    top = 12;
  if (rect) {
    const below = rect.bottom + 12;
    const roomBelow = innerHeight - below;
    if (roomBelow > 190) {
      top = below;
      left = rect.left;
    } else if (rect.left > cw + 24) {
      left = rect.left - cw - 12;
      top = rect.top;
    } else {
      top = Math.max(12, rect.top - 200);
      left = rect.left;
    }
    if (rect.height > innerHeight * 0.5) {
      top = rect.top + 60;
      left = rect.left + 20;
    }
    left = Math.max(12, Math.min(left, innerWidth - cw - 12));
    top = Math.max(12, Math.min(top, innerHeight - 200));
  }
  return (
    <>
      {rect && (
        <div
          className="tour-ring"
          style={{ left: rect.left - 4, top: rect.top - 4, width: rect.width + 8, height: rect.height + 8 }}
        />
      )}
      <div
        ref={card}
        className="tour-card"
        role="dialog"
        aria-modal="false"
        aria-labelledby="tour-title"
        style={{ left, top, width: cw }}
        onKeyDown={(e) => {
          if (e.key === 'Escape') end();
        }}
        data-testid="tour"
      >
        <h2 id="tour-title">{s.title}</h2>
        <p>{s.body}</p>
        <div className="tour-foot">
          <span className="count">
            {step + 1} / {STEPS.length}
          </span>
          <button type="button" className="btn sm ghost" onClick={end}>
            {last ? 'Close' : 'Skip'}
          </button>
          {step > 0 && (
            <button type="button" className="btn sm" onClick={() => actions.set({ tour: step - 1 })}>
              Back
            </button>
          )}
          <button
            ref={next}
            type="button"
            className="btn sm primary"
            onClick={() => (last ? end() : actions.set({ tour: step + 1 }))}
          >
            {last ? 'Start making' : 'Next'}
          </button>
        </div>
      </div>
    </>
  );
}

/** Small, non-blocking invitation shown on a first visit. */
export function WelcomeNudge() {
  const tourDone = useEditor((s) => s.tourDone);
  const tour = useEditor((s) => s.tour);
  const dialog = useEditor((s) => s.dialog);
  if (tourDone || tour !== null || dialog) return null;
  return (
    <div className="tour-card welcome" role="region" aria-label="Welcome" data-testid="welcome">
      <h2>Welcome to SDF Forge</h2>
      <p>
        Build 3D shapes by blending simple forms, then export them for printing or games. Want a 1-minute
        tour?
      </p>
      <div className="tour-foot">
        <span className="count" />
        <button type="button" className="btn sm ghost" onClick={() => actions.set({ tourDone: true })}>
          No thanks
        </button>
        <button type="button" className="btn sm primary" onClick={startTour}>
          Show me around
        </button>
      </div>
    </div>
  );
}
