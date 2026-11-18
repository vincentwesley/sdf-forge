import { VERT } from './shaders';

/**
 * Evaluate the generated GLSL `map` (and `mapColor`) at arbitrary points on
 * the GPU and read the results back. Used by tests to check that the shader
 * and the CPU evaluator agree.
 */
export function gpuEvaluate(
  sceneGlsl: string,
  paramCount: number,
  P: Float32Array,
  points: Float32Array, // xyz triples
): { d: Float32Array; color: Float32Array } {
  const n = points.length / 3;
  const W = Math.min(256, n);
  const H = Math.ceil(n / W);
  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  const gl = canvas.getContext('webgl2')!;
  if (!gl.getExtension('EXT_color_buffer_float')) throw new Error('EXT_color_buffer_float unavailable');
  const vec4s = Math.max(1, Math.ceil(paramCount / 4));
  const fs = `#version 300 es
precision highp float; precision highp int;
uniform vec4 uP[${vec4s}];
uniform sampler2D uPts;
layout(location = 0) out vec4 outD;
layout(location = 1) out vec4 outC;
${sceneGlsl}
void main() {
  ivec2 c = ivec2(gl_FragCoord.xy);
  vec3 p = texelFetch(uPts, c, 0).xyz;
  outD = vec4(map(p), 0.0, 0.0, 1.0);
  outC = mapColor(p);
}`;
  const mk = (type: number, src: string) => {
    const s = gl.createShader(type)!;
    gl.shaderSource(s, src);
    gl.compileShader(s);
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS))
      throw new Error(gl.getShaderInfoLog(s) ?? 'compile error');
    return s;
  };
  const prog = gl.createProgram()!;
  gl.attachShader(prog, mk(gl.VERTEX_SHADER, VERT));
  gl.attachShader(prog, mk(gl.FRAGMENT_SHADER, fs));
  gl.bindAttribLocation(prog, 0, 'aPos');
  gl.linkProgram(prog);
  if (!gl.getProgramParameter(prog, gl.LINK_STATUS))
    throw new Error(gl.getProgramInfoLog(prog) ?? 'link error');
  gl.useProgram(prog);

  const buf = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, buf);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
  gl.enableVertexAttribArray(0);
  gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);

  const pts = new Float32Array(W * H * 4);
  for (let i = 0; i < n; i++) pts.set([points[i * 3], points[i * 3 + 1], points[i * 3 + 2], 1], i * 4);
  const tex = gl.createTexture();
  gl.activeTexture(gl.TEXTURE0);
  gl.bindTexture(gl.TEXTURE_2D, tex);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA32F, W, H, 0, gl.RGBA, gl.FLOAT, pts);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
  gl.uniform1i(gl.getUniformLocation(prog, 'uPts'), 0);
  const padded = new Float32Array(vec4s * 4);
  padded.set(P.subarray(0, padded.length));
  gl.uniform4fv(gl.getUniformLocation(prog, 'uP[0]'), padded);

  const targets = [0, 1].map(() => {
    const t = gl.createTexture()!;
    gl.bindTexture(gl.TEXTURE_2D, t);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA32F, W, H, 0, gl.RGBA, gl.FLOAT, null);
    return t;
  });
  const fbo = gl.createFramebuffer();
  gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
  gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, targets[0], 0);
  gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT1, gl.TEXTURE_2D, targets[1], 0);
  gl.drawBuffers([gl.COLOR_ATTACHMENT0, gl.COLOR_ATTACHMENT1]);
  gl.viewport(0, 0, W, H);
  // the render targets were bound to unit 0 while being created; rebind the points
  gl.activeTexture(gl.TEXTURE0);
  gl.bindTexture(gl.TEXTURE_2D, tex);
  gl.drawArrays(gl.TRIANGLES, 0, 3);

  const read = (att: number) => {
    gl.readBuffer(att);
    const out = new Float32Array(W * H * 4);
    gl.readPixels(0, 0, W, H, gl.RGBA, gl.FLOAT, out);
    return out;
  };
  const rawD = read(gl.COLOR_ATTACHMENT0);
  const rawC = read(gl.COLOR_ATTACHMENT1);
  const d = new Float32Array(n);
  const color = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) {
    d[i] = rawD[i * 4];
    color.set(rawC.subarray(i * 4, i * 4 + 3), i * 3);
  }
  gl.getExtension('WEBGL_lose_context')?.loseContext();
  return { d, color };
}
