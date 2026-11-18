/**
 * Shader templates for the ray marcher. The generated scene code (`map` and
 * `mapColor`) is spliced in at SCENE.
 *
 * Lighting, soft shadows, AO and normals follow Inigo Quilez's articles
 * (MIT): rmshadows, normalsSDF, outdoorslighting.
 */

export const VERT = /* glsl */ `#version 300 es
in vec2 aPos;
out vec2 vUv;
void main() {
  vUv = aPos * 0.5 + 0.5;
  gl_Position = vec4(aPos, 0.0, 1.0);
}
`;

export function fragmentSource(scene: string, paramVec4s: number): string {
  return /* glsl */ `#version 300 es
precision highp float;
precision highp int;

uniform vec4 uP[${Math.max(1, paramVec4s)}];
uniform vec2 uRes;
uniform vec2 uJitter;
uniform vec3 uCamPos;
uniform mat3 uCamRot;
uniform float uTanFov;
uniform vec3 uBMin;
uniform vec3 uBMax;
uniform float uStepScale;
uniform int uMaxSteps;
uniform int uMode;        // 0 shaded, 1 normals, 2 print check, 3 cost
uniform int uMaterial;    // 0 clay, 1 glossy, 2 metal
uniform int uEmpty;
uniform float uSelOn;
uniform vec3 uSelColor;
uniform vec3 uBgTop;
uniform vec3 uBgBottom;
uniform vec3 uGroundCol;
uniform float uGridOn;
uniform float uGridStep;
uniform vec3 uKeyDir;
uniform float uThinLimit;
uniform float uShadowQuality; // 0 = fast, 1 = full
uniform float uTransparentBg;
uniform float uFrame;

out vec4 outColor;

${scene}

// ---------------------------------------------------------------------------

vec2 boxHit(vec3 ro, vec3 rd, vec3 bmin, vec3 bmax) {
  vec3 inv = 1.0 / rd;
  vec3 t0 = (bmin - ro) * inv;
  vec3 t1 = (bmax - ro) * inv;
  vec3 tmin = min(t0, t1), tmax = max(t0, t1);
  return vec2(max(max(tmin.x, tmin.y), tmin.z), min(min(tmax.x, tmax.y), tmax.z));
}

int gSteps = 0;

// Sphere tracing with Lipschitz-scaled steps. Returns t, or -1.0 on miss.
float march(vec3 ro, vec3 rd, float tmin, float tmax, float pixelAngle) {
  float t = tmin;
  for (int i = 0; i < 512; i++) {
    if (i >= uMaxSteps) break;
    gSteps = i;
    vec3 p = ro + rd * t;
    float d = map(p) * uStepScale;
    float eps = max(1e-4, pixelAngle * t);
    if (abs(d) < eps) return t;
    t += d;
    if (t > tmax) break;
  }
  return -1.0;
}

vec3 calcNormal(vec3 p, float t) {
  float h = max(1e-4, 5e-4 * t);
  const vec2 k = vec2(1.0, -1.0);
  return normalize(k.xyy * map(p + k.xyy * h) + k.yyx * map(p + k.yyx * h) +
                   k.yxy * map(p + k.yxy * h) + k.xxx * map(p + k.xxx * h));
}

// Soft shadow, improved technique (Inigo Quilez, "rmshadows").
float softShadow(vec3 ro, vec3 rd, float tmin, float tmax, float w) {
  vec2 bt = boxHit(ro, rd, uBMin, uBMax);
  if (bt.y < max(bt.x, 0.0)) return 1.0;
  tmin = max(tmin, bt.x);
  tmax = min(tmax, bt.y);
  float res = 1.0;
  // per-pixel, per-frame jitter of the start turns banding into noise that
  // the progressive accumulation averages away
  float jit = fract(sin(dot(gl_FragCoord.xy + uFrame * 7.31, vec2(12.9898, 78.233))) * 43758.5453);
  float t = tmin + jit * 0.02;
  float ph = 1e10;
  int n = uShadowQuality > 0.5 ? 64 : 24;
  for (int i = 0; i < 64; i++) {
    if (i >= n) break;
    float h = map(ro + rd * t) * uStepScale;
    float y = h * h / (2.0 * ph);
    float d = sqrt(max(h * h - y * y, 0.0));
    res = min(res, d / (w * max(0.0, t - y)));
    ph = h;
    t += clamp(h, 0.01, 0.3);
    if (res < 0.002 || t > tmax) break;
  }
  res = clamp(res, 0.0, 1.0);
  return res * res * (3.0 - 2.0 * res);
}

float calcAO(vec3 p, vec3 n) {
  float occ = 0.0, sca = 1.0;
  for (int i = 0; i < 5; i++) {
    float h = 0.01 + 0.12 * float(i) / 4.0;
    float d = map(p + h * n);
    occ += (h - d) * sca;
    sca *= 0.95;
  }
  return clamp(1.0 - 3.0 * occ, 0.0, 1.0);
}

// Wall thickness: sample inward along -n; returns the first depth that is
// outside the solid (or a value above the limit if none is).
float thickness(vec3 p, vec3 n, float eps) {
  float start = 2.0 * eps + 0.002;
  for (int i = 1; i <= 12; i++) {
    float t = start + uThinLimit * 1.25 * float(i) / 12.0;
    if (map(p - n * t) > 0.0) return t;
  }
  return uThinLimit * 2.0;
}

vec3 background(vec3 rd, vec2 uv) {
  float g = clamp(rd.y * 0.6 + 0.5, 0.0, 1.0);
  vec3 c = mix(uBgBottom, uBgTop, g);
  float v = length(uv - 0.5);
  return c * (1.0 - 0.18 * v * v);
}

// Khronos PBR Neutral tone mapping (Apache-2.0, github.com/KhronosGroup/ToneMapping)
vec3 toneMap(vec3 color) {
  const float startCompression = 0.8 - 0.04;
  const float desaturation = 0.15;
  float x = min(color.r, min(color.g, color.b));
  float offset = x < 0.08 ? x - 6.25 * x * x : 0.04;
  color -= offset;
  float peak = max(color.r, max(color.g, color.b));
  if (peak < startCompression) return color;
  const float d = 1.0 - startCompression;
  float newPeak = 1.0 - d * d / (peak + d - startCompression);
  color *= newPeak / peak;
  float g = 1.0 - 1.0 / (desaturation * (peak - newPeak) + 1.0);
  return mix(color, newPeak * vec3(1.0), g);
}

vec3 shade(vec3 p, vec3 rd, float t) {
  vec3 n = calcNormal(p, t);
  vec4 mc = mapColor(p);
  vec3 base = pow(clamp(mc.rgb, 0.0, 1.0), vec3(2.2));
  if (uMode == 1) return n * 0.5 + 0.5;

  float rough = uMaterial == 0 ? 0.65 : (uMaterial == 1 ? 0.16 : 0.3);
  float metal = uMaterial == 2 ? 1.0 : 0.0;
  vec3 L = normalize(uKeyDir);
  vec3 H = normalize(L - rd);
  float ndl = clamp(dot(n, L), 0.0, 1.0);
  float ndh = clamp(dot(n, H), 0.0, 1.0);
  float ndv = clamp(dot(n, -rd), 0.0, 1.0);
  float ao = calcAO(p, n);
  float sh = ndl > 0.0 ? softShadow(p + n * 0.003, L, 0.01, 12.0, 0.08) : 0.0;

  if (uMode == 2) {
    // print check: neutral base, overhangs amber, thin walls red
    base = vec3(0.32);
    float over = smoothstep(-0.68, -0.76, n.y) * step(uBMin.y + 0.01, p.y);
    base = mix(base, vec3(0.95, 0.55, 0.12), over * 0.85);
    float th = thickness(p, n, max(1e-4, uTanFov * 2.0 / uRes.y * 0.75 * t));
    float thin = 1.0 - smoothstep(uThinLimit * 0.75, uThinLimit, th);
    base = mix(base, vec3(0.9, 0.08, 0.06), thin);
    metal = 0.0;
    rough = 0.7;
  }

  // GGX-ish specular with Schlick fresnel
  float a2 = rough * rough * rough * rough;
  float dn = ndh * ndh * (a2 - 1.0) + 1.0;
  float D = a2 / (3.14159 * dn * dn);
  vec3 F0 = mix(vec3(0.04), base, metal);
  vec3 F = F0 + (1.0 - F0) * pow(1.0 - clamp(dot(H, -rd), 0.0, 1.0), 5.0);
  vec3 spec = D * F * 0.25 / max(ndv * 0.5 + 0.5, 0.2);
  vec3 diff = base * (1.0 - metal);

  vec3 col = vec3(0.0);
  col += diff * ndl * sh * vec3(1.0, 0.95, 0.88) * 2.2;
  col += spec * ndl * sh * 2.2;
  // sky fill
  float sky = 0.5 + 0.5 * n.y;
  col += diff * sky * ao * vec3(0.55, 0.62, 0.78) * 0.32;
  // ground bounce
  col += diff * clamp(-n.y * 0.5 + 0.5, 0.0, 1.0) * ao * vec3(0.32, 0.27, 0.22) * 0.12;
  // back / rim
  float rim = pow(1.0 - ndv, 3.0);
  col += (diff * 0.3 + F0) * rim * ao * 0.35;
  // environment reflection for glossy/metal
  vec3 r = reflect(rd, n);
  vec3 env = mix(uBgBottom, uBgTop, clamp(r.y * 0.5 + 0.5, 0.0, 1.0)) * 1.4 + vec3(smoothstep(0.6, 0.95, r.y)) * 0.6;
  col += env * F * ao * (1.0 - rough) * 0.9;
  if (uMaterial == 1) {
    // glossy: a clear-coat style sharp highlight of the key light
    float cc = pow(ndh, 220.0) * 6.0 * sh;
    col += vec3(cc) * (0.04 + 0.96 * pow(1.0 - ndv, 5.0) + 0.3);
  }

  if (uSelOn > 0.5) {
    // compare against the scene distance at the same point so hit-point error cancels out
    float dScene = map(p);
    float s = 1.0 - smoothstep(0.0, max(0.01, 0.004 * t), abs(mc.w) - abs(dScene));
    // a light glow and rim in the accent colour; keeps the shape's own colour readable
    col = col * (1.0 - 0.12 * s) + uSelColor * s * (0.07 + 0.75 * rim);
  }
  return col;
}

void main() {
  vec2 frag = gl_FragCoord.xy + uJitter;
  vec2 uv = frag / uRes;
  vec2 ndc = (frag * 2.0 - uRes) / uRes.y;
  vec3 rd = normalize(uCamRot * vec3(ndc * uTanFov, -1.0));
  vec3 ro = uCamPos;
  float pixelAngle = uTanFov * 2.0 / uRes.y * 0.75;

  vec3 col = background(rd, uv);
  float alpha = uTransparentBg > 0.5 ? 0.0 : 1.0;
  float groundY = uBMin.y;
  float tGround = rd.y < 0.0 ? (groundY - ro.y) / rd.y : 1e9;
  if (tGround < 0.0) tGround = 1e9;

  float tHit = -1.0;
  if (uEmpty == 0) {
    vec2 bt = boxHit(ro, rd, uBMin - 1e-3, uBMax + 1e-3);
    if (bt.y > max(bt.x, 0.0)) tHit = march(ro, rd, max(bt.x, 0.0), bt.y, pixelAngle);
  }

  if (uMode == 3) {
    float c = float(gSteps) / float(uMaxSteps);
    outColor = vec4(mix(vec3(0.05, 0.1, 0.3), vec3(1.0, 0.85, 0.2), sqrt(c)) * (tHit > 0.0 ? 1.0 : 0.4), 1.0);
    return;
  }

  if (tHit > 0.0 && tHit < tGround) {
    vec3 p = ro + rd * tHit;
    col = shade(p, rd, tHit);
    if (uMode != 1) col = pow(toneMap(col), vec3(1.0 / 2.2));
    alpha = 1.0;
  } else if (tGround < 1e8 && uTransparentBg < 0.5) {
    // ground plane: shadow catcher + faint grid
    vec3 p = ro + rd * tGround;
    float fade = exp(-0.012 * tGround * tGround);
    float sh = uEmpty == 0 ? softShadow(p + vec3(0.0, 1e-3, 0.0), normalize(uKeyDir), 0.01, 20.0, 0.12) : 1.0;
    float occ = 1.0;
    if (uEmpty == 0) {
      // contact darkening under the shape
      float d0 = map(vec3(p.x, groundY + 0.05, p.z));
      occ = 0.55 + 0.45 * smoothstep(0.0, 0.6, d0);
    }
    vec3 g = uGroundCol * mix(0.55, 1.0, sh) * occ;
    if (uGridOn > 0.5) {
      vec2 q = p.xz / uGridStep;
      vec2 w = fwidth(q);
      vec2 gl = abs(fract(q - 0.5) - 0.5) / max(w, 1e-4);
      float line = 1.0 - min(min(gl.x, gl.y), 1.0);
      vec2 q10 = p.xz / (uGridStep * 10.0);
      vec2 w10 = fwidth(q10);
      vec2 gl10 = abs(fract(q10 - 0.5) - 0.5) / max(w10, 1e-4);
      float line10 = 1.0 - min(min(gl10.x, gl10.y), 1.0);
      float lum = dot(uGroundCol, vec3(0.333));
      vec3 lc = lum > 0.5 ? vec3(0.0) : vec3(1.0);
      g = mix(g, lc, (line * 0.07 + line10 * 0.12) * fade);
    }
    col = mix(col, g, fade);
  }
  outColor = vec4(col, alpha);
}
`;
}

/** Display pass: copies the accumulation buffer to the canvas (upscaling if needed). */
export const COPY_FRAG = /* glsl */ `#version 300 es
precision highp float;
uniform sampler2D uTex;
in vec2 vUv;
out vec4 outColor;
void main() { outColor = texture(uTex, vUv); }
`;
