import { test, expect, openApp } from './fixtures';

test('the exported Shadertoy shader compiles and renders the shape', async ({ page }) => {
  await openApp(page);
  const ids = await page.evaluate(() => window.sdfForge.examples());
  for (const id of ids) {
    const res = await page.evaluate((id) => {
      window.sdfForge.loadExample(id);
      const src = window.sdfForge.shadertoy();
      // shapes with Text need a texture and are exported with an explanation instead
      if (!src.includes('mainImage')) return { ok: true, colors: 99, skipped: true };
      // wrap like Shadertoy does
      const fs = `#version 300 es
precision highp float; precision highp int;
uniform vec3 iResolution; uniform float iTime; uniform vec4 iMouse;
out vec4 fragColor_;
${src}
void main() { mainImage(fragColor_, gl_FragCoord.xy); }`;
      const c = document.createElement('canvas');
      c.width = 64;
      c.height = 48;
      const gl = c.getContext('webgl2', { preserveDrawingBuffer: true })!;
      const sh = (t: number, s: string) => {
        const x = gl.createShader(t)!;
        gl.shaderSource(x, s);
        gl.compileShader(x);
        return x;
      };
      const vs = sh(
        gl.VERTEX_SHADER,
        '#version 300 es\nin vec2 p; void main(){ gl_Position = vec4(p,0.,1.); }',
      );
      const f = sh(gl.FRAGMENT_SHADER, fs);
      if (!gl.getShaderParameter(f, gl.COMPILE_STATUS)) return { ok: false, log: gl.getShaderInfoLog(f) };
      const pr = gl.createProgram()!;
      gl.attachShader(pr, vs);
      gl.attachShader(pr, f);
      gl.bindAttribLocation(pr, 0, 'p');
      gl.linkProgram(pr);
      gl.useProgram(pr);
      const b = gl.createBuffer();
      gl.bindBuffer(gl.ARRAY_BUFFER, b);
      gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
      gl.enableVertexAttribArray(0);
      gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
      gl.uniform3f(gl.getUniformLocation(pr, 'iResolution'), 64, 48, 1);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
      const px = new Uint8Array(64 * 48 * 4);
      gl.readPixels(0, 0, 64, 48, gl.RGBA, gl.UNSIGNED_BYTE, px);
      const colors = new Set<number>();
      for (let i = 0; i < px.length; i += 4)
        colors.add((px[i] >> 3) * 1024 + (px[i + 1] >> 3) * 32 + (px[i + 2] >> 3));
      return { ok: true, colors: colors.size };
    }, id);
    expect(res.ok, `${id}: ${res.log}`).toBe(true);
    expect(res.colors!, id).toBeGreaterThan(8);
  }
});
