// GLSL for the scene. Leaves are flat quads; the shape, veins and
// back-lighting are all drawn in the fragment shader.

const fogPars = /* glsl */ `
uniform vec3 uFogColor;
uniform float uFogDensity;
varying float vFogDepth;
`
const fogApply = /* glsl */ `
float fogFactor = 1.0 - exp(-uFogDensity * uFogDensity * vFogDepth * vFogDepth);
gl_FragColor.rgb = mix(gl_FragColor.rgb, uFogColor, clamp(fogFactor, 0.0, 1.0));
`

// ---------------------------------------------------------------- leaves
export const leafVert = /* glsl */ `
uniform float uTime;
uniform float uWind;
attribute float aRand;
varying vec2 vUv;
varying float vRand;
varying vec3 vTint;
varying vec3 vWorld;
varying float vFogDepth;
void main() {
  vUv = uv;
  vRand = aRand;
  #ifdef USE_INSTANCING_COLOR
    vTint = instanceColor;
  #else
    vTint = vec3(1.0);
  #endif
  vec3 p = position;
  // cup the blade a little and droop the tip
  p.z += (1.0 - pow(abs(uv.x - 0.5) * 2.0, 2.0)) * 0.08 + uv.y * uv.y * 0.18 * (0.4 + aRand);
  vec4 w = modelMatrix * instanceMatrix * vec4(p, 1.0);
  float gust = sin(uTime * 0.7 + w.x * 0.08) * 0.5 + 0.5;
  float sway = sin(uTime * (1.2 + aRand) + w.x * 0.35 + w.z * 0.25 + aRand * 6.2831);
  w.xyz += vec3(sway * 0.05, cos(uTime * 1.9 + aRand * 9.0) * 0.025, sway * 0.03) * uv.y * uWind * (0.6 + gust);
  vWorld = w.xyz;
  vec4 mv = viewMatrix * w;
  vFogDepth = -mv.z;
  gl_Position = projectionMatrix * mv;
}
`

export const leafFrag = /* glsl */ `
uniform vec3 uSunDir;
uniform vec3 uBase;
uniform vec3 uLight;
uniform vec3 uBack;
uniform float uSerrate;
uniform float uRhomb;
uniform float uReveal;
uniform float uTime;
varying vec2 vUv;
varying float vRand;
varying vec3 vTint;
varying vec3 vWorld;
${fogPars}

float leafWidth(float y) {
  float lance = pow(sin(3.14159 * pow(y, 0.82)), 0.9) * 0.5;
  float rhomb = (y < 0.45 ? y / 0.45 : (1.0 - y) / 0.55) * 0.5;
  float w = mix(lance, rhomb, uRhomb);
  // toothed margin (Sida has a serrated edge)
  w *= 1.0 - uSerrate * 0.07 * abs(sin(y * 46.0)) * smoothstep(0.25, 0.4, y);
  return w;
}

void main() {
  float x = vUv.x - 0.5;
  float y = vUv.y;
  float w = leafWidth(y);
  float ax = abs(x);
  if (ax > w || y < 0.015) discard;

  float edge = smoothstep(w, w - 0.03, ax);
  float mid = 1.0 - smoothstep(0.0, 0.012 + 0.01 * (1.0 - y), ax);
  float d = abs(fract((y - ax * 1.15) * 8.0 + vRand) - 0.5);
  float vein = (1.0 - smoothstep(0.0, 0.05, d)) * smoothstep(w, w * 0.2, ax) * step(0.08, y);

  vec3 col = mix(uBase, uLight, smoothstep(0.0, 1.0, y * 0.7 + vRand * 0.3)) * vTint;
  col = mix(col, col * 1.35 + 0.03, (mid + vein * 0.6) * 0.55);
  col *= mix(0.55, 1.0, edge);
  // ground occlusion: leaves near the forest floor sit in shade
  col *= mix(0.38, 1.0, smoothstep(-0.2, 4.5, vWorld.y)) * mix(0.7, 1.0, y);

  // light coming through the leaf from behind
  vec3 viewDir = normalize(vWorld - cameraPosition);
  float through = pow(max(dot(viewDir, normalize(uSunDir)), 0.0), 2.2);
  col += uBack * through * (0.5 + 0.5 * vein) * 1.15 * smoothstep(0.0, 6.0, vWorld.y + 1.0);

  // hero leaf: veins light up as we get close
  float pulse = 0.5 + 0.5 * sin(uTime * 2.0 - y * 10.0);
  col += vec3(0.62, 0.95, 0.35) * uReveal * (vein * 0.9 + mid) * (0.6 + 0.4 * pulse);
  col += vec3(0.75, 1.0, 0.5) * uReveal * (1.0 - edge) * 0.8;

  gl_FragColor = vec4(col, 1.0);
  ${fogApply}
}
`

// ---------------------------------------------------------------- pollen
export const pollenVert = /* glsl */ `
uniform float uTime;
uniform float uPixelRatio;
attribute float aRand;
varying float vRand;
varying float vFogDepth;
void main() {
  vRand = aRand;
  vec3 p = position;
  p.x += sin(uTime * 0.3 + aRand * 20.0) * 0.6;
  p.y += mod(uTime * (0.08 + aRand * 0.12) + aRand * 14.0, 14.0) - 7.0 + sin(uTime + aRand * 30.0) * 0.2;
  vec4 mv = modelViewMatrix * vec4(p, 1.0);
  vFogDepth = -mv.z;
  gl_PointSize = clamp((1.2 + aRand * 3.0) * uPixelRatio * 16.0 / max(-mv.z, 0.1), 1.0, 14.0 * uPixelRatio);
  gl_Position = projectionMatrix * mv;
}
`
export const pollenFrag = /* glsl */ `
uniform float uTime;
uniform float uOpacity;
varying float vRand;
varying float vFogDepth;
void main() {
  float d = length(gl_PointCoord - 0.5);
  float a = smoothstep(0.5, 0.0, d);
  float tw = 0.55 + 0.45 * sin(uTime * (1.5 + vRand * 3.0) + vRand * 40.0);
  float fade = exp(-vFogDepth * 0.025) * smoothstep(0.6, 2.5, vFogDepth);
  vec3 c = mix(vec3(1.0, 0.98, 0.86), vec3(0.93, 1.0, 0.8), vRand);
  gl_FragColor = vec4(c, a * a * tw * fade * uOpacity * 0.9);
}
`

// ---------------------------------------------------------------- light shafts
export const rayVert = /* glsl */ `
varying vec2 vUv;
varying float vFogDepth;
void main() {
  vUv = uv;
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  vFogDepth = -mv.z;
  gl_Position = projectionMatrix * mv;
}
`
export const rayFrag = /* glsl */ `
uniform float uTime;
uniform float uOpacity;
uniform float uSeed;
varying vec2 vUv;
varying float vFogDepth;
void main() {
  float side = smoothstep(0.0, 0.35, vUv.x) * smoothstep(1.0, 0.65, vUv.x);
  float len = smoothstep(0.0, 0.5, vUv.y) * smoothstep(1.0, 0.85, vUv.y);
  float flick = 0.75 + 0.25 * sin(uTime * 0.6 + uSeed * 10.0 + vUv.y * 3.0);
  float near = smoothstep(2.0, 12.0, vFogDepth); // don't blind the camera when it flies through
  float a = side * len * flick * near * uOpacity * 0.34;
  gl_FragColor = vec4(vec3(1.0, 0.97, 0.85) * a, a * 0.8);
}
`

// ---------------------------------------------------------------- photo patches -> tokens
export const patchVert = /* glsl */ `
uniform float uExplode;
uniform float uFlat;
uniform float uTime;
uniform float uSize;     // patch edge in world units
uniform float uGap;      // token spacing on the floor
uniform float uWave;     // 0..6, which layer the activation wave is in
attribute vec2 aCell;    // (column, row from top)
attribute float aRand;
attribute float aSal;    // 0..1, how much leaf is in this patch
varying vec2 vUv;
varying vec2 vCell;
varying float vSal;
varying float vRand;
varying float vLift;

mat3 rotX(float a) { float c = cos(a), s = sin(a); return mat3(1,0,0, 0,c,s, 0,-s,c); }
mat3 rotY(float a) { float c = cos(a), s = sin(a); return mat3(c,0,-s, 0,1,0, s,0,c); }

void main() {
  vUv = uv; vCell = aCell; vSal = aSal; vRand = aRand;
  vec3 c0 = vec3((aCell.x - 6.5) * uSize, (6.5 - aCell.y) * uSize, 0.0);
  vec3 c1 = c0 * 1.22 + vec3(0.0, 0.0, (aRand - 0.5) * 2.6 + aSal * 1.2);
  vec3 c2 = vec3((aCell.x - 6.5) * uGap, -1.6, (aCell.y - 6.5) * uGap);

  float e = smoothstep(0.0, 1.0, clamp(uExplode * 1.4 - aRand * 0.4, 0.0, 1.0));
  float f = smoothstep(0.0, 1.0, clamp(uFlat * 1.5 - aRand * 0.5, 0.0, 1.0));

  vec3 center = mix(c0, c1, e);
  // arc up and over on the way to the floor
  vec3 path = mix(center, c2, f) + vec3(0.0, sin(f * 3.14159) * (1.5 + aRand * 1.5), 0.0);

  // token pulse when the activation wave passes overhead
  float beat = exp(-pow(uWave - 0.5 - aRand * 0.4, 2.0) * 0.6) * step(0.001, uWave) * (0.25 + aSal);
  path.y += beat * 0.25 * f;
  vLift = beat;

  float scale = mix(1.0, 0.82, f);
  mat3 r = rotX(mix(0.0, -1.5708, f)) * rotY(e * (1.0 - f) * (aRand - 0.5) * 0.9);
  vec3 p = r * (position * uSize * mix(0.97, 1.0, 1.0 - e) * scale);
  vec4 mv = modelViewMatrix * vec4(path + p, 1.0);
  gl_Position = projectionMatrix * mv;
}
`

export const patchFrag = /* glsl */ `
uniform sampler2D uMap;
uniform float uScan;
uniform float uGrid;
uniform float uToken;
uniform float uTime;
varying vec2 vUv;
varying vec2 vCell;
varying float vSal;
varying float vRand;
varying float vLift;
void main() {
  vec2 uv = vec2((vCell.x + vUv.x) / 14.0, 1.0 - (vCell.y + (1.0 - vUv.y)) / 14.0);
  vec3 tex = texture2D(uMap, uv).rgb;
  // soften the bluish paper toward the page's mint so the leaf carries the colour
  float l0 = dot(tex, vec3(0.3, 0.59, 0.11));
  tex = mix(tex, vec3(l0) * vec3(0.98, 1.0, 0.95), 0.45 * (1.0 - smoothstep(0.1, 0.5, vSal)));

  // scan line drawing the 14x14 grid, row by row
  float rowY = (vCell.y + (1.0 - vUv.y)) / 14.0;
  float scanned = step(rowY, uScan);
  float line = 1.0 - smoothstep(0.0, 0.035, min(min(vUv.x, 1.0 - vUv.x), min(vUv.y, 1.0 - vUv.y)));
  float beam = exp(-pow((rowY - uScan) * 40.0, 2.0)) * step(0.001, uScan) * step(uScan, 0.999);

  vec3 col = tex;
  col = mix(col, vec3(0.2, 0.5, 0.2), line * scanned * uGrid * 0.85);
  col = mix(col, vec3(0.45, 0.8, 0.28), beam * 0.85);

  // as a token: keep a hint of the photo, glow by how much leaf it holds
  float lum = dot(tex, vec3(0.3, 0.59, 0.11));
  vec3 leafTok = mix(vec3(0.24, 0.56, 0.2), vec3(0.5, 0.78, 0.27), vRand) * (0.8 + lum * 0.5);
  vec3 bgTok = vec3(0.78, 0.84, 0.77) + lum * 0.04;
  vec3 tok = mix(bgTok, leafTok, smoothstep(0.12, 0.55, vSal));
  tok = mix(tok, vec3(0.16, 0.36, 0.17), line * 0.35);
  tok = mix(tok, vec3(0.88, 0.66, 0.15), clamp(vLift * 0.9, 0.0, 0.8) * smoothstep(0.15, 0.5, vSal));
  col = mix(col, tok, uToken);

  gl_FragColor = vec4(col, 1.0);
}
`

// ---------------------------------------------------------------- transformer layers
export const layerVert = /* glsl */ `
varying vec2 vUv;
void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }
`
export const layerFrag = /* glsl */ `
uniform float uGlow;
uniform float uOpacity;
uniform float uTime;
varying vec2 vUv;
void main() {
  vec2 g = abs(fract(vUv * 14.0) - 0.5);
  float grid = 1.0 - smoothstep(0.46, 0.5, max(g.x, g.y));
  grid = 1.0 - grid;
  float frame = 1.0 - smoothstep(0.0, 0.012, min(min(vUv.x, 1.0 - vUv.x), min(vUv.y, 1.0 - vUv.y)));
  float sweep = exp(-pow((vUv.y - fract(uTime * 0.35)) * 8.0, 2.0));
  vec3 col = mix(vec3(0.97, 1.0, 0.95), vec3(0.18, 0.44, 0.2), clamp(frame * 1.0 + grid * 0.4, 0.0, 1.0));
  col = mix(col, vec3(0.5, 0.8, 0.3), uGlow * 0.45 + sweep * uGlow * 0.3);
  float a = 0.05 + frame * 0.75 + grid * 0.12 + uGlow * 0.12 + sweep * uGlow * 0.1;
  gl_FragColor = vec4(col, clamp(a, 0.0, 1.0) * uOpacity);
}
`

// ---------------------------------------------------------------- attention arcs
export const arcVert = /* glsl */ `
uniform vec3 uHub;
uniform float uTime;
attribute vec3 aTarget;
attribute float aT;
attribute float aW;
attribute float aPhase;
varying float vT;
varying float vW;
varying float vPhase;
void main() {
  vT = aT; vW = aW; vPhase = aPhase;
  vec3 p = mix(uHub, aTarget, aT);
  p.y += sin(aT * 3.14159) * (0.6 + aW * 1.2);
  gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0);
}
`
export const arcFrag = /* glsl */ `
uniform float uTime;
uniform float uOpacity;
varying float vT;
varying float vW;
varying float vPhase;
void main() {
  float dash = smoothstep(0.75, 1.0, fract(vT * 2.0 - uTime * 0.9 + vPhase));
  float a = vW * (0.4 + dash * 0.9) * uOpacity;
  gl_FragColor = vec4(mix(vec3(0.2, 0.45, 0.18), vec3(0.85, 0.55, 0.05), dash), min(a, 1.0));
}
`

// ---------------------------------------------------------------- answer beam
export const beamFrag = /* glsl */ `
uniform float uOpacity;
uniform float uTime;
varying vec2 vUv;
void main() {
  float fade = pow(1.0 - vUv.y, 1.6);
  float ripple = 0.7 + 0.3 * sin(vUv.y * 40.0 - uTime * 8.0);
  vec3 c = vec3(0.89, 0.63, 0.1);
  gl_FragColor = vec4(c, fade * ripple * uOpacity * 0.75);
}
`

// attention as beads flowing from the class token down to the patches
export const beadVert = /* glsl */ `
uniform vec3 uHub;
uniform float uTime;
uniform float uPixelRatio;
attribute vec3 aTarget;
attribute float aT;
attribute float aW;
attribute float aPhase;
varying float vA;
void main() {
  float t = fract(aT + uTime * 0.35 + aPhase);
  vec3 p = mix(uHub, aTarget, t);
  p.y += sin(t * 3.14159) * (0.6 + aW * 1.2);
  vec4 mv = modelViewMatrix * vec4(p, 1.0);
  vA = aW * smoothstep(0.0, 0.08, t) * smoothstep(1.0, 0.85, t);
  gl_PointSize = (2.5 + aW * 3.5) * uPixelRatio * 6.0 / max(-mv.z, 1.0) + 1.5;
  gl_Position = projectionMatrix * mv;
}
`
export const beadFrag = /* glsl */ `
uniform float uOpacity;
varying float vA;
void main() {
  float d = length(gl_PointCoord - 0.5);
  if (d > 0.5) discard;
  gl_FragColor = vec4(mix(vec3(0.85, 0.55, 0.05), vec3(0.95, 0.72, 0.2), smoothstep(0.5, 0.0, d)), vA * uOpacity);
}
`
