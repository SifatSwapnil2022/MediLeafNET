import * as THREE from 'three'

// Seeded random so the forest is the same on every visit.
export function rng(seed: number) {
  let a = seed >>> 0 || 1
  return () => {
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

// Direction from the scene toward the low morning sun (ahead and above).
export const SUN_DIR = new THREE.Vector3(-0.15, 0.42, -1).normalize()

export const HERO = new THREE.Vector3(0.4, 0, -96) // the Bala shrub
export const HERO_LEAF = new THREE.Vector3(0.42, 2.36, -96.3) // pivot at the stalk; the blade hangs below

export const CAMERA_PATH = new THREE.CatmullRomCurve3(
  [
    [0, 6.5, 32],
    [1.6, 5.2, 14],
    [-2.4, 3.8, -8],
    [2.2, 3.1, -32],
    [-1.6, 2.6, -56],
    [1.0, 2.3, -76],
    [0.5, 2.1, -90],
    [0.42, 2.02, -94.9],
  ].map((v) => new THREE.Vector3(...(v as [number, number, number]))),
  false,
  'centripetal',
)

export const LOOK_PATH = new THREE.CatmullRomCurve3(
  [
    [0, 5, 12],
    [-0.6, 3.8, -6],
    [1.4, 3, -28],
    [-1, 2.6, -50],
    [0.8, 2.3, -72],
    [0.5, 2.1, -88],
    [0.42, 2.02, -94],
    [0.42, 2.0, -96.3],
  ].map((v) => new THREE.Vector3(...(v as [number, number, number]))),
  false,
  'centripetal',
)

// The "lab" where the photo gets taken apart. Far from the forest; the
// camera teleports here under the shutter flash.
export const LAB = new THREE.Vector3(0, 0, -420)
