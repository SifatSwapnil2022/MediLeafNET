// Shared, mutable scroll state for the story. Written by the scroll loop,
// read every frame by the 3D scene and the overlay. Kept outside React so
// scrolling never triggers re-renders.

export const story = {
  progress: 0, // 0..1 through the pinned story
  velocity: 0,
  time: 0,
}

export const clamp = (v: number, a = 0, b = 1) => Math.min(b, Math.max(a, v))
export const seg = (p: number, a: number, b: number) => clamp((p - a) / (b - a))
export const smooth = (t: number) => t * t * (3 - 2 * t)
export const easeInOut = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2)
export const lerp = (a: number, b: number, t: number) => a + (b - a) * t

// Where each chapter lives on the 0..1 scroll axis.
export const T = {
  flyEnd: 0.33, // camera reaches the Bala shrub
  focus: 0.36, // viewfinder appears
  shutter: 0.4, // flash peak, switch to the lab
  scanEnd: 0.49,
  explodeEnd: 0.56,
  tokensEnd: 0.63,
  layersEnd: 0.78,
  predEnd: 0.92,
} as const

// Fade window helper for overlay text: in over [a, a+f], out over [b-f, b].
export function windowOpacity(p: number, a: number, b: number, f = 0.025) {
  return Math.min(seg(p, a, a + f), 1 - seg(p, b - f, b))
}
