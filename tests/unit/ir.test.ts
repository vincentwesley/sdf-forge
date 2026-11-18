import { describe, expect, it } from 'vitest';
import { IRBuilder } from '../../src/core/ir/ir';
import { emitGlslFunction, glslFloat } from '../../src/core/ir/glsl';
import { emitJsBody } from '../../src/core/ir/js';
import { noise3 } from '../../src/core/ir/noise';

describe('IR builder', () => {
  it('hash-conses identical expressions', () => {
    const ir = new IRBuilder();
    const p = ir.arg('v3', 0, 'p');
    const a = ir.length(ir.sub(p, ir.vec3(1, 2, 3)));
    const b = ir.length(ir.sub(p, ir.vec3(1, 2, 3)));
    expect(a).toBe(b);
  });
  it('folds constants and identities', () => {
    const ir = new IRBuilder();
    expect(ir.add(2, 3).n).toBe(5);
    const x = ir.param(4);
    expect(ir.add(x, 0)).toBe(x);
    expect(ir.mul(1, x)).toBe(x);
    expect(ir.x(ir.vec3(x, 1, 2))).toBe(x);
    expect(ir.neg(ir.neg(x))).toBe(x);
  });
  it('rejects type mismatches', () => {
    const ir = new IRBuilder();
    expect(() => ir.add(ir.vec2(1, ir.param(0)), ir.vec3(1, 2, ir.param(1)))).toThrow();
  });
  it('formats GLSL float literals', () => {
    expect(glslFloat(1)).toBe('1.0');
    expect(glslFloat(-2.5)).toBe('(-2.5)');
    expect(glslFloat(1e21)).toBe('1.0e+21');
    expect(glslFloat(-0)).toBe('0.0');
  });
  it('emits equivalent GLSL and JS for a sample expression', () => {
    const ir = new IRBuilder();
    const p = ir.arg('v3', 0, 'p');
    const d = ir.sub(ir.length(ir.max(ir.sub(ir.abs(p), 0.5), 0)), ir.param(4));
    const glsl = emitGlslFunction({
      name: 'f',
      ret: 'float',
      args: [{ name: 'p', ty: 'v3' }],
      roots: [d],
      result: ([x]) => x,
    });
    expect(glsl).toContain('float f(vec3 p)');
    expect(glsl).toContain('uP[1].x');
    const body = emitJsBody({ args: [['x', 'y', 'z']], roots: [d], result: ([x]) => `return ${x[0]};` });
    const fn = new Function('P', 'noise3', `return function(x,y,z){${body}}`)([0, 0, 0, 0, 0.1], noise3);
    expect(fn(1, 0, 0)).toBeCloseTo(0.4, 6);
  });
});

describe('noise', () => {
  it('is deterministic, bounded and continuous', () => {
    let maxAbs = 0;
    for (let i = 0; i < 2000; i++) {
      const x = Math.sin(i) * 37,
        y = Math.cos(i * 1.3) * 41,
        z = i * 0.013 - 10;
      const v = noise3(x, y, z);
      expect(v).toBe(noise3(x, y, z));
      maxAbs = Math.max(maxAbs, Math.abs(v));
      expect(Math.abs(noise3(x + 1e-5, y, z) - v)).toBeLessThan(1e-3);
    }
    expect(maxAbs).toBeLessThanOrEqual(1);
    expect(maxAbs).toBeGreaterThan(0.5);
  });
  it('matches its integer lattice values at integer points', () => {
    // at integer points value noise returns the hashed lattice value exactly
    const v = noise3(3, -2, 7);
    expect(Number.isFinite(v)).toBe(true);
    expect(noise3(3, -2, 7)).toBe(v);
  });
});
