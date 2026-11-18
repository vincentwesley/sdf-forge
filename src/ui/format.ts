import type { ParamDef } from '../core/nodes/types';

export interface DisplayUnit {
  factor: number;
  suffix: string;
  decimals: number;
}

/** How a param is displayed in the UI: lengths in mm, angles in degrees, percentages. */
export function displayUnit(p: ParamDef, mmPerUnit: number): DisplayUnit {
  const unit = 'unit' in p ? p.unit : undefined;
  if (p.kind === 'int') return { factor: 1, suffix: '', decimals: 0 };
  switch (unit) {
    case 'length':
      return { factor: mmPerUnit, suffix: 'mm', decimals: mmPerUnit >= 10 ? 1 : 2 };
    case 'angle':
      return { factor: 1, suffix: '°', decimals: 0 };
    case 'percent':
      return { factor: 100, suffix: '%', decimals: 0 };
    default:
      return { factor: 1, suffix: '', decimals: 2 };
  }
}

export function fmt(v: number, decimals: number): string {
  if (!Number.isFinite(v)) return '–';
  const s = v.toFixed(decimals);
  // trim trailing zeros but keep at least one decimal when decimals > 0
  return decimals > 0 ? s.replace(/(\.\d*?)0+$/, '$1').replace(/\.$/, '') : s;
}

/**
 * Parse a number typed by the user. Accepts simple arithmetic (e.g. "12*2",
 * "40/3", "-1.5e1"), but never evaluates code.
 */
export function parseNumber(text: string): number | null {
  const s = text
    .replace(/,/g, '.')
    .replace(/[a-z°%\s]+$/i, '')
    .trim();
  if (!s) return null;
  if (!/^[\d.+\-*/()eE\s]+$/.test(s)) return null;
  let i = 0;
  const peek = () => s[i];
  const skip = () => {
    while (s[i] === ' ') i++;
  };
  const num = (): number => {
    skip();
    if (peek() === '(') {
      i++;
      const v = expr();
      skip();
      if (peek() !== ')') throw new Error('paren');
      i++;
      return v;
    }
    if (peek() === '-') {
      i++;
      return -num();
    }
    if (peek() === '+') {
      i++;
      return num();
    }
    const m = /^(\d+\.?\d*|\.\d+)([eE][+-]?\d+)?/.exec(s.slice(i));
    if (!m) throw new Error('num');
    i += m[0].length;
    return parseFloat(m[0]);
  };
  const term = (): number => {
    let v = num();
    for (;;) {
      skip();
      if (peek() === '*') {
        i++;
        v *= num();
      } else if (peek() === '/') {
        i++;
        v /= num();
      } else return v;
    }
  };
  const expr = (): number => {
    let v = term();
    for (;;) {
      skip();
      if (peek() === '+') {
        i++;
        v += term();
      } else if (peek() === '-') {
        i++;
        v -= term();
      } else return v;
    }
  };
  try {
    const v = expr();
    skip();
    if (i !== s.length || !Number.isFinite(v)) return null;
    return v;
  } catch {
    return null;
  }
}

export function toHex(c: number[]): string {
  return (
    '#' +
    c
      .slice(0, 3)
      .map((v) =>
        Math.round(Math.max(0, Math.min(1, v)) * 255)
          .toString(16)
          .padStart(2, '0'),
      )
      .join('')
  );
}

export function fromHex(hex: string): [number, number, number] {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return [0.8, 0.8, 0.8];
  const n = parseInt(m[1], 16);
  return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
}
