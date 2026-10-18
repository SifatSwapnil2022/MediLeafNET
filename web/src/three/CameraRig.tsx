import { useFrame, useThree } from '@react-three/fiber'
import { useRef } from 'react'
import * as THREE from 'three'
import { easeInOut, seg, smooth, story, T } from '../lib/story'
import { CAMERA_PATH, HERO_LEAF, LAB, LOOK_PATH } from './world'

const v = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z).add(LAB)

// Camera keyframes inside the lab, as [progress, position, look-at].
const LAB_KEYS: [number, THREE.Vector3, THREE.Vector3][] = [
  // photo sits right of centre while the text is on the left
  [T.shutter, v(-2.1, 0, 7.6), v(-2.1, 0, 0)],
  [T.scanEnd - 0.005, v(-1.9, 0, 6.9), v(-1.9, 0, 0)],
  // patches fly apart on the left, text on the right
  [T.scanEnd + 0.02, v(4.2, 1.4, 8.2), v(2.6, -0.1, -0.9)],
  [T.explodeEnd, v(4.8, 2.2, 7.8), v(2.8, -0.2, -1.0)],
  // tokens land on the right, text on the left
  [T.tokensEnd - 0.012, v(4.4, 5.6, 8.6), v(-1.6, -1.2, 0)],
  // layers on the left, text on the right
  [T.tokensEnd + 0.02, v(6.2, 6.6, 6.4), v(1.4, 1.0, -1.8)],
  [T.layersEnd, v(5.2, 9.6, 8.2), v(1.6, 2.8, -1.4)],
  // looking up the beam; prediction panel sits on the right
  [T.predEnd, v(-1.2, 14.5, 7.6), v(2.8, 5.8, -1.0)],
]

// Phones: text sits at the bottom, so keep the subject centred and high.
const PORTRAIT_KEYS: [number, THREE.Vector3, THREE.Vector3][] = [
  [T.shutter, v(0, -0.6, 12.5), v(0, -1.7, 0)],
  [T.scanEnd - 0.005, v(0, -0.6, 12), v(0, -1.7, 0)],
  [T.scanEnd + 0.02, v(4.5, 1.2, 11.5), v(0, -1.5, 0)],
  [T.explodeEnd, v(5, 2, 11), v(0, -1.5, 0)],
  [T.tokensEnd - 0.012, v(5, 8, 11.5), v(0, -3.4, 0)],
  [T.tokensEnd + 0.02, v(7.5, 9.5, 10), v(0, -0.8, 0)],
  [T.layersEnd, v(6.5, 13, 11), v(0, 0.6, 0)],
  [T.predEnd, v(0.01, 20, 9.5), v(0, 3.4, 0)],
]

function labPose(p: number, pos: THREE.Vector3, look: THREE.Vector3, keys = LAB_KEYS) {
  for (let i = 0; i < keys.length - 1; i++) {
    const [a, pa, la] = keys[i]
    const [b, pb, lb] = keys[i + 1]
    if (p <= b || i === keys.length - 2) {
      const t = easeInOut(seg(p, a, b))
      pos.copy(pa).lerp(pb, t)
      look.copy(la).lerp(lb, t)
      return
    }
  }
}

export function CameraRig() {
  const { camera } = useThree()
  const look = useRef(new THREE.Vector3(0, 5, 12))
  const wantPos = useRef(new THREE.Vector3())
  const wantLook = useRef(new THREE.Vector3())
  const wasLab = useRef(false)
  const mouse = useRef(new THREE.Vector2())

  useFrame((state, dt) => {
    const p = story.progress
    const t = story.time
    mouse.current.lerp(state.pointer, 1 - Math.exp(-dt * 2))
    const inLab = p >= T.shutter

    if (!inLab) {
      // fly the path, then lean in on the leaf while "focusing"
      const fly = easeInOut(seg(p, 0, T.flyEnd))
      CAMERA_PATH.getPointAt(fly, wantPos.current)
      LOOK_PATH.getPointAt(fly, wantLook.current)
      const leafCenter = HERO_LEAF.clone().add(new THREE.Vector3(0, -0.36, 0))
      const push = smooth(seg(p, T.flyEnd, T.shutter))
      wantPos.current.lerp(leafCenter.clone().add(new THREE.Vector3(0, 0.02, 0.85)), push * 0.55)
      wantLook.current.lerp(leafCenter, push)
      // a slow handheld drift, calmer as we focus
      const calm = 1 - push * 0.8
      wantPos.current.x += Math.sin(t * 0.37) * 0.06 * calm + mouse.current.x * 0.35 * calm
      wantPos.current.y += Math.sin(t * 0.51) * 0.04 * calm + mouse.current.y * 0.2 * calm
    } else {
      const portrait = state.size.width / state.size.height < 0.85
      labPose(p, wantPos.current, wantLook.current, portrait ? PORTRAIT_KEYS : LAB_KEYS)
      wantPos.current.x += mouse.current.x * 0.4
      wantPos.current.y += mouse.current.y * 0.25
    }

    // snap under the shutter flash, otherwise ease toward the target
    if (inLab !== wasLab.current) {
      camera.position.copy(wantPos.current)
      look.current.copy(wantLook.current)
      wasLab.current = inLab
    } else {
      const k = 1 - Math.exp(-dt * 5)
      camera.position.lerp(wantPos.current, k)
      look.current.lerp(wantLook.current, k)
    }
    camera.lookAt(look.current)
  })
  return null
}
