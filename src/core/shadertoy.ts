import { type Compiled, analyze, compile, packParams } from './compile';
import type { SdfDoc } from './graph/doc';

/**
 * A self-contained Shadertoy shader for the current shape: the generated
 * distance function with parameters baked in, plus a compact ray marcher.
 */
export function shadertoySource(doc: SdfDoc): string {
  const c: Compiled = compile(doc);
  const P = new Float32Array(c.paramCount);
  packParams(doc, c, P);
  const b = analyze(doc, c.rootId).bounds ?? { min: [-1, -1, -1], max: [1, 1, 1] };
  const ctr = b.min.map((v, i) => (v + b.max[i]) / 2);
  const rad = Math.max(0.5, Math.hypot(...b.max.map((v, i) => v - b.min[i])) / 2);
  const f = (v: number) => (Number.isInteger(v) ? v.toFixed(1) : String(+v.toFixed(4)));
  // re-emit with inlined params by substituting uniform reads
  const glsl = c.glsl.replace(/uP\[(\d+)\]\.([xyzw])/g, (_m, i, comp) => {
    const v = P[Number(i) * 4 + 'xyzw'.indexOf(comp)];
    const s = String(Math.fround(v));
    return v < 0 ? `(${/[.e]/.test(s) ? s : s + '.0'})` : /[.e]/.test(s) ? s : s + '.0';
  });
  return `// ${doc.title}
// Made with SDF Forge by Vin's Atelier — https://vincentwesley.github.io/sdf-forge/
// SDF formulas after Inigo Quilez (iquilezles.org, MIT). Paste into a new shader at shadertoy.com.

${glsl}

vec3 calcNormal(vec3 p) {
  const vec2 k = vec2(1.0, -1.0);
  const float h = 0.0005;
  return normalize(k.xyy * map(p + k.xyy * h) + k.yyx * map(p + k.yyx * h) +
                   k.yxy * map(p + k.yxy * h) + k.xxx * map(p + k.xxx * h));
}

float softShadow(vec3 ro, vec3 rd) {
  float res = 1.0, t = 0.02;
  for (int i = 0; i < 48; i++) {
    float h = map(ro + rd * t);
    res = min(res, 10.0 * h / t);
    t += clamp(h, 0.02, 0.25);
    if (res < 0.005 || t > 12.0) break;
  }
  return clamp(res, 0.0, 1.0);
}

void mainImage(out vec4 fragColor, in vec2 fragCoord) {
  vec2 uv = (2.0 * fragCoord - iResolution.xy) / iResolution.y;
  float an = 0.4 * iTime + 6.2831 * iMouse.x / iResolution.x;
  vec3 ta = vec3(${f(ctr[0])}, ${f(ctr[1])}, ${f(ctr[2])});
  float dist = ${f(rad * 3.2)};
  vec3 ro = ta + vec3(dist * sin(an), dist * 0.45, dist * cos(an));
  vec3 ww = normalize(ta - ro), uu = normalize(cross(ww, vec3(0, 1, 0))), vv = cross(uu, ww);
  vec3 rd = normalize(uv.x * uu + uv.y * vv + 2.2 * ww);
  vec3 col = mix(vec3(0.07), vec3(0.14, 0.145, 0.16), 0.5 + 0.5 * rd.y);
  float t = 0.0;
  for (int i = 0; i < 256; i++) {
    float h = map(ro + rd * t);
    if (abs(h) < 0.0005 * t) break;
    t += h * 0.9;
    if (t > dist * 3.0) break;
  }
  if (t < dist * 3.0) {
    vec3 p = ro + rd * t;
    vec3 n = calcNormal(p);
    vec3 base = pow(clamp(mapColor(p).rgb, 0.0, 1.0), vec3(2.2));
    vec3 L = normalize(vec3(0.6, 0.8, 0.4));
    float dif = clamp(dot(n, L), 0.0, 1.0) * softShadow(p + n * 0.002, L);
    float sky = 0.5 + 0.5 * n.y;
    col = base * (2.0 * dif * vec3(1.0, 0.95, 0.88) + 0.35 * sky * vec3(0.55, 0.62, 0.78));
    col += pow(clamp(dot(reflect(rd, n), L), 0.0, 1.0), 24.0) * 0.3 * dif;
    col = pow(col / (1.0 + col), vec3(1.0 / 2.2));
  }
  fragColor = vec4(col, 1.0);
}
`;
}

/** Just the distance function with parameters baked in (for use in other projects). */
export function glslLibrary(doc: SdfDoc): string {
  return shadertoySource(doc).split('vec3 calcNormal')[0].trimEnd() + '\n';
}
