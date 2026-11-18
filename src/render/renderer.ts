import { COPY_FRAG, VERT, fragmentSource } from './shaders';
import { type OrbitCamera, cameraBasis, cameraMatrix } from './camera';
import type { AABB } from '../core/nodes/types';

export type ViewMode = 'shaded' | 'normals' | 'print' | 'cost';
export type MaterialStyle = 'clay' | 'glossy' | 'metal';

export interface SceneTheme {
  bgTop: [number, number, number];
  bgBottom: [number, number, number];
  ground: [number, number, number];
  selection: [number, number, number];
}

export interface FrameState {
  camera: OrbitCamera;
  bounds: AABB | null;
  lipschitz: number;
  mode: ViewMode;
  material: MaterialStyle;
  selectionOn: boolean;
  grid: boolean;
  gridStep: number;
  thinLimit: number;
  theme: SceneTheme;
  transparent?: boolean;
}

interface Program {
  prog: WebGLProgram;
  vs: WebGLShader;
  fs: WebGLShader;
  uniforms: Map<string, WebGLUniformLocation | null>;
  vec4s: number;
  ready: boolean;
  failed: string | null;
}

const MODE_ID: Record<ViewMode, number> = { shaded: 0, normals: 1, print: 2, cost: 3 };
const MAT_ID: Record<MaterialStyle, number> = { clay: 0, glossy: 1, metal: 2 };

/** Halton sequence for sub-pixel jitter. */
function halton(i: number, b: number) {
  let f = 1,
    r = 0;
  while (i > 0) {
    f /= b;
    r += f * (i % b);
    i = Math.floor(i / b);
  }
  return r;
}

export interface RendererStats {
  fps: number;
  frameMs: number;
  scale: number;
  accumulated: number;
  width: number;
  height: number;
  compileMs: number;
  renderer: string;
}

/**
 * WebGL2 SDF ray marcher with on-demand rendering, dynamic resolution while
 * interacting and progressive anti-aliasing when idle.
 */
export class Renderer {
  readonly gl: WebGL2RenderingContext;
  private canvas: HTMLCanvasElement;
  private vao: WebGLVertexArrayObject;
  private copyProg: WebGLProgram;
  private current: Program | null = null;
  private pending: Program | null = null;
  private pendingStart = 0;
  private sceneSource = '';
  private parallel: { COMPLETION_STATUS_KHR: number } | null;
  private accumTex: WebGLTexture | null = null;
  private accumFbo: WebGLFramebuffer | null = null;
  private accumW = 0;
  private accumH = 0;
  private floatTargets: boolean;
  private params = new Float32Array(4);
  private frame: FrameState | null = null;
  private accumCount = 0;
  private maxAccum = 24;
  private interacting = false;
  private lastInteract = 0;
  private scale = 1;
  private raf = 0;
  private lastTime = 0;
  private frameMsSmoothed = 16;
  private lost = false;
  private disposed = false;
  private emptyScene = true;
  /** device pixel ratio cap */
  maxDpr = 2;
  onError: ((msg: string | null) => void) | null = null;
  onStats: ((s: RendererStats) => void) | null = null;
  onCompiled: (() => void) | null = null;
  stats: RendererStats = {
    fps: 0,
    frameMs: 0,
    scale: 1,
    accumulated: 0,
    width: 0,
    height: 0,
    compileMs: 0,
    renderer: '',
  };
  /** When true (tests), always render continuously at the given scale. */
  continuous = false;

  constructor(canvas: HTMLCanvasElement, opts: { preserveDrawingBuffer?: boolean } = {}) {
    this.canvas = canvas;
    const gl = canvas.getContext('webgl2', {
      antialias: false,
      alpha: true,
      premultipliedAlpha: false,
      depth: false,
      stencil: false,
      preserveDrawingBuffer: opts.preserveDrawingBuffer ?? false,
      powerPreference: 'high-performance',
    });
    if (!gl) throw new Error('WebGL2 is not available');
    this.gl = gl;
    this.floatTargets = !!gl.getExtension('EXT_color_buffer_float');
    this.parallel = gl.getExtension('KHR_parallel_shader_compile');
    const dbg = gl.getExtension('WEBGL_debug_renderer_info');
    this.stats.renderer = dbg ? String(gl.getParameter(dbg.UNMASKED_RENDERER_WEBGL)) : 'WebGL2';

    const buf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
    this.vao = gl.createVertexArray()!;
    gl.bindVertexArray(this.vao);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
    this.copyProg = this.link(VERT, COPY_FRAG, true)!.prog;

    canvas.addEventListener('webglcontextlost', this.handleLost);
    canvas.addEventListener('webglcontextrestored', this.handleRestored);
  }

  private handleLost = (e: Event) => {
    e.preventDefault();
    this.lost = true;
    cancelAnimationFrame(this.raf);
    this.onError?.('The graphics context was lost. It will be restored automatically.');
  };
  private handleRestored = () => {
    // simplest robust recovery: ask the owner to rebuild us
    this.onError?.('restore');
  };

  get maxUniformVec4s(): number {
    return this.gl.getParameter(this.gl.MAX_FRAGMENT_UNIFORM_VECTORS) as number;
  }

  private compileShader(type: number, src: string): WebGLShader {
    const gl = this.gl;
    const sh = gl.createShader(type)!;
    gl.shaderSource(sh, src);
    gl.compileShader(sh);
    return sh;
  }

  private link(vsSrc: string, fsSrc: string, sync: boolean): Program | null {
    const gl = this.gl;
    const vs = this.compileShader(gl.VERTEX_SHADER, vsSrc);
    const fs = this.compileShader(gl.FRAGMENT_SHADER, fsSrc);
    const prog = gl.createProgram()!;
    gl.attachShader(prog, vs);
    gl.attachShader(prog, fs);
    gl.bindAttribLocation(prog, 0, 'aPos');
    gl.linkProgram(prog);
    const p: Program = { prog, vs, fs, uniforms: new Map(), vec4s: 0, ready: false, failed: null };
    if (sync) this.finishLink(p);
    return p;
  }

  private finishLink(p: Program): boolean {
    const gl = this.gl;
    if (!gl.getProgramParameter(p.prog, gl.LINK_STATUS)) {
      const log = gl.getShaderInfoLog(p.fs) || gl.getProgramInfoLog(p.prog) || 'unknown error';
      p.failed = log;
      return false;
    }
    p.ready = true;
    return true;
  }

  /** Set the generated scene code. Recompiles only if it changed. */
  setScene(sceneGlsl: string, paramCount: number, empty: boolean) {
    this.emptyScene = empty;
    const vec4s = Math.max(1, Math.ceil(paramCount / 4));
    const src = fragmentSource(sceneGlsl, vec4s);
    if (src === this.sceneSource) return;
    this.sceneSource = src;
    if (this.pending && this.pending !== this.current) this.deleteProgram(this.pending);
    this.pendingStart = performance.now();
    const p = this.link(VERT, src, false)!;
    p.vec4s = vec4s;
    this.pending = p;
    if (!this.parallel) this.promotePending();
    this.requestRender();
  }

  /** True while a new shader is compiling. */
  get compiling(): boolean {
    return !!this.pending;
  }

  private promotePending(): boolean {
    const p = this.pending;
    if (!p) return false;
    const gl = this.gl;
    if (this.parallel && !gl.getProgramParameter(p.prog, this.parallel.COMPLETION_STATUS_KHR)) return false;
    this.pending = null;
    this.stats.compileMs = performance.now() - this.pendingStart;
    if (!this.finishLink(p)) {
      console.error('Shader compile failed:', p.failed);
      this.onError?.('The shape could not be drawn (shader error). Try undoing the last change.');
      this.deleteProgram(p);
      return false;
    }
    if (this.current) this.deleteProgram(this.current);
    this.current = p;
    this.onError?.(null);
    this.accumCount = 0;
    this.onCompiled?.();
    return true;
  }

  private deleteProgram(p: Program) {
    const gl = this.gl;
    gl.deleteProgram(p.prog);
    gl.deleteShader(p.vs);
    gl.deleteShader(p.fs);
  }

  setParams(P: Float32Array) {
    if (this.params.length !== P.length) this.params = new Float32Array(P.length);
    this.params.set(P);
    this.reset();
  }

  setFrame(f: FrameState) {
    this.frame = f;
    this.reset();
  }

  /** Mark the view as being interacted with (lower resolution, no accumulation). */
  interact() {
    this.interacting = true;
    this.lastInteract = performance.now();
    this.reset();
  }

  private reset() {
    this.accumCount = 0;
    this.requestRender();
  }

  requestRender() {
    if (this.raf || this.lost || this.disposed) return;
    this.raf = requestAnimationFrame(this.tick);
  }

  private tick = (time: number) => {
    this.raf = 0;
    if (this.lost || this.disposed) return;
    if (this.pending) this.promotePending();
    const dt = this.lastTime ? time - this.lastTime : 16;
    this.lastTime = time;
    if (this.interacting && performance.now() - this.lastInteract > 180) {
      this.interacting = false;
      this.accumCount = 0;
    }
    const drawNow =
      this.continuous || this.accumCount < (this.interacting ? 1 : this.maxAccum) || !!this.pending;
    if (!drawNow) {
      // keep polling while an interaction is settling so we re-render at full quality afterwards
      if (this.interacting) this.raf = requestAnimationFrame(this.tick);
      else this.lastTime = 0;
      return;
    }
    if (this.accumCount === 0 || this.continuous) this.adaptScale(dt);
    this.draw();
    this.stats.fps = this.stats.fps * 0.9 + (1000 / Math.max(dt, 1)) * 0.1;
    this.stats.frameMs = dt;
    this.onStats?.(this.stats);
    this.raf = requestAnimationFrame(this.tick);
  };

  private adaptScale(dt: number) {
    // Only adapt during interaction; when idle we render full quality progressively.
    this.frameMsSmoothed = this.frameMsSmoothed * 0.7 + dt * 0.3;
    if (this.interacting || this.continuous) {
      if (this.frameMsSmoothed > 24) this.scale = Math.max(0.3, this.scale * 0.85);
      else if (this.frameMsSmoothed < 15) this.scale = Math.min(1, this.scale * 1.08);
    }
  }

  /** Render one frame now (also used for exports and tests). */
  draw(opts: { scale?: number; target?: { width: number; height: number } } = {}) {
    const gl = this.gl;
    const f = this.frame;
    const prog = this.current;
    const dpr = Math.min(window.devicePixelRatio || 1, this.maxDpr);
    const cw = opts.target?.width ?? Math.max(1, Math.round(this.canvas.clientWidth * dpr));
    const ch = opts.target?.height ?? Math.max(1, Math.round(this.canvas.clientHeight * dpr));
    if (this.canvas.width !== cw || this.canvas.height !== ch) {
      this.canvas.width = cw;
      this.canvas.height = ch;
      this.accumCount = 0;
    }
    if (!f || !prog) {
      gl.viewport(0, 0, cw, ch);
      gl.clearColor(0, 0, 0, 0);
      gl.clear(gl.COLOR_BUFFER_BIT);
      return;
    }
    const idle = !this.interacting && !this.continuous;
    const scale = opts.scale ?? (idle ? 1 : this.scale);
    const w = Math.max(1, Math.round(cw * scale));
    const h = Math.max(1, Math.round(ch * scale));
    this.ensureAccum(w, h);
    this.stats.scale = scale;
    this.stats.width = w;
    this.stats.height = h;

    // --- scene pass into the accumulation buffer ---
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.accumFbo);
    gl.viewport(0, 0, w, h);
    gl.useProgram(prog.prog);
    gl.bindVertexArray(this.vao);
    const n = this.accumCount;
    const jitter = n === 0 ? [0, 0] : [halton(n + 1, 2) - 0.5, halton(n + 1, 3) - 0.5];
    this.setUniforms(prog, f, w, h, jitter, idle);
    if (n === 0) gl.disable(gl.BLEND);
    else {
      gl.enable(gl.BLEND);
      gl.blendFunc(gl.CONSTANT_ALPHA, gl.ONE_MINUS_CONSTANT_ALPHA);
      gl.blendColor(0, 0, 0, 1 / (n + 1));
    }
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    gl.disable(gl.BLEND);
    this.accumCount = n + 1;
    this.stats.accumulated = this.accumCount;

    // --- display pass ---
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.viewport(0, 0, cw, ch);
    gl.useProgram(this.copyProg);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.accumTex);
    gl.uniform1i(gl.getUniformLocation(this.copyProg, 'uTex'), 0);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
  }

  private ensureAccum(w: number, h: number) {
    if (this.accumTex && this.accumW === w && this.accumH === h) return;
    const gl = this.gl;
    if (this.accumTex) gl.deleteTexture(this.accumTex);
    if (this.accumFbo) gl.deleteFramebuffer(this.accumFbo);
    this.accumTex = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, this.accumTex);
    if (this.floatTargets) gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA16F, w, h, 0, gl.RGBA, gl.HALF_FLOAT, null);
    else gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, w, h, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    this.accumFbo = gl.createFramebuffer();
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.accumFbo);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, this.accumTex, 0);
    if (gl.checkFramebufferStatus(gl.FRAMEBUFFER) !== gl.FRAMEBUFFER_COMPLETE && this.floatTargets) {
      this.floatTargets = false;
      this.accumTex = null;
      this.ensureAccum(w, h);
      return;
    }
    this.accumW = w;
    this.accumH = h;
    this.accumCount = 0;
  }

  private u(p: Program, name: string) {
    let loc = p.uniforms.get(name);
    if (loc === undefined) {
      loc = this.gl.getUniformLocation(p.prog, name);
      p.uniforms.set(name, loc);
    }
    return loc;
  }

  private setUniforms(p: Program, f: FrameState, w: number, h: number, jitter: number[], idle: boolean) {
    const gl = this.gl;
    const P = this.params.length >= p.vec4s * 4 ? this.params : padTo(this.params, p.vec4s * 4);
    gl.uniform4fv(this.u(p, 'uP[0]'), P.subarray(0, p.vec4s * 4));
    gl.uniform2f(this.u(p, 'uRes'), w, h);
    gl.uniform2f(this.u(p, 'uJitter'), jitter[0], jitter[1]);
    const basis = cameraBasis(f.camera);
    gl.uniform3fv(this.u(p, 'uCamPos'), basis.pos);
    gl.uniformMatrix3fv(this.u(p, 'uCamRot'), false, cameraMatrix(f.camera));
    gl.uniform1f(this.u(p, 'uTanFov'), Math.tan(((f.camera.fov / 2) * Math.PI) / 180));
    const b = f.bounds ?? { min: [0, 0, 0], max: [0, 0, 0] };
    gl.uniform3fv(this.u(p, 'uBMin'), b.min);
    gl.uniform3fv(this.u(p, 'uBMax'), b.max);
    gl.uniform1f(this.u(p, 'uStepScale'), 1 / Math.max(1, f.lipschitz));
    const steps = Math.round(
      Math.min(400, (idle ? 200 : 110) * Math.min(3, Math.sqrt(Math.max(1, f.lipschitz)))),
    );
    gl.uniform1i(this.u(p, 'uMaxSteps'), steps);
    gl.uniform1i(this.u(p, 'uMode'), MODE_ID[f.mode]);
    gl.uniform1i(this.u(p, 'uMaterial'), MAT_ID[f.material]);
    gl.uniform1i(this.u(p, 'uEmpty'), this.emptyScene || !f.bounds ? 1 : 0);
    gl.uniform1f(this.u(p, 'uSelOn'), f.selectionOn ? 1 : 0);
    gl.uniform3fv(this.u(p, 'uSelColor'), f.theme.selection);
    gl.uniform3fv(this.u(p, 'uBgTop'), f.theme.bgTop);
    gl.uniform3fv(this.u(p, 'uBgBottom'), f.theme.bgBottom);
    gl.uniform3fv(this.u(p, 'uGroundCol'), f.theme.ground);
    gl.uniform1f(this.u(p, 'uGridOn'), f.grid ? 1 : 0);
    gl.uniform1f(this.u(p, 'uGridStep'), f.gridStep);
    // key light: upper left of the camera, rotating with the camera's yaw only
    const yaw = f.camera.yaw - 1.05;
    gl.uniform3f(this.u(p, 'uKeyDir'), Math.sin(yaw) * 0.62, 0.72, Math.cos(yaw) * 0.62);
    gl.uniform1f(this.u(p, 'uThinLimit'), f.thinLimit);
    gl.uniform1f(this.u(p, 'uShadowQuality'), idle ? 1 : 0);
    gl.uniform1f(this.u(p, 'uTransparentBg'), f.transparent ? 1 : 0);
  }

  /**
   * Render an accumulated still at a given size (and optionally another camera)
   * into the canvas. The canvas holds the image until control returns to the
   * browser, so read it synchronously (drawImage / toBlob) right after.
   */
  renderOffline(
    width: number,
    height: number,
    opts: { frames?: number; camera?: OrbitCamera; transparent?: boolean } = {},
  ) {
    if (!this.frame) throw new Error('Nothing to render yet');
    const saved = this.frame;
    this.frame = {
      ...saved,
      camera: opts.camera ?? saved.camera,
      transparent: !!opts.transparent,
      selectionOn: false,
    };
    const prevInteract = this.interacting;
    this.interacting = false;
    this.accumCount = 0;
    if (this.pending) this.promotePending();
    const frames = opts.frames ?? 16;
    for (let i = 0; i < frames; i++) this.draw({ scale: 1, target: { width, height } });
    this.frame = saved;
    this.interacting = prevInteract;
    return this.canvas;
  }

  /** Restore the on-screen size after offline rendering. */
  endOffline() {
    this.accumCount = 0;
    this.canvas.width = Math.max(
      1,
      Math.round(this.canvas.clientWidth * Math.min(window.devicePixelRatio || 1, this.maxDpr)),
    );
    this.canvas.height = Math.max(
      1,
      Math.round(this.canvas.clientHeight * Math.min(window.devicePixelRatio || 1, this.maxDpr)),
    );
    this.requestRender();
  }

  /** Render a PNG of the current view at the given size. */
  async capture(
    width: number,
    height: number,
    frames = 24,
    opts: { transparent?: boolean } = {},
  ): Promise<Blob> {
    const max = this.gl.getParameter(this.gl.MAX_RENDERBUFFER_SIZE) as number;
    const k = Math.min(1, max / Math.max(width, height));
    const canvas = this.renderOffline(Math.round(width * k), Math.round(height * k), {
      frames,
      transparent: opts.transparent,
    });
    // copy synchronously before the drawing buffer is discarded
    const copy = document.createElement('canvas');
    copy.width = canvas.width;
    copy.height = canvas.height;
    copy.getContext('2d')!.drawImage(canvas, 0, 0);
    this.endOffline();
    return new Promise<Blob>((res, rej) =>
      copy.toBlob((b) => (b ? res(b) : rej(new Error('capture failed'))), 'image/png'),
    );
  }

  dispose() {
    this.disposed = true;
    cancelAnimationFrame(this.raf);
    this.canvas.removeEventListener('webglcontextlost', this.handleLost);
    this.canvas.removeEventListener('webglcontextrestored', this.handleRestored);
    const gl = this.gl;
    if (this.current) this.deleteProgram(this.current);
    if (this.pending) this.deleteProgram(this.pending);
    gl.deleteProgram(this.copyProg);
    if (this.accumTex) gl.deleteTexture(this.accumTex);
    if (this.accumFbo) gl.deleteFramebuffer(this.accumFbo);
  }
}

function padTo(a: Float32Array, n: number) {
  const out = new Float32Array(n);
  out.set(a.subarray(0, n));
  return out;
}
