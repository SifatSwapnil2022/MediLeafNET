import { useFrame } from '@react-three/fiber'
import { useLayoutEffect, useMemo, useRef } from 'react'
import * as THREE from 'three'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'
import { seg, story, T } from '../lib/story'
import { makeLeafMaterial } from './Jungle'
import { HERO, HERO_LEAF, rng } from './world'

// Bala (Sida rhombifolia): a small woody shrub with toothed, diamond-ish leaves.
export function HeroShrub() {
  const group = useRef<THREE.Group>(null!)
  const inst = useRef<THREE.InstancedMesh>(null!)
  const hero = useRef<THREE.InstancedMesh>(null!)
  const mat = useMemo(() => makeLeafMaterial({ serrate: 1, rhomb: 0.75 }), [])
  const heroMat = useMemo(() => {
    const m = makeLeafMaterial({ serrate: 1, rhomb: 0.75 })
    m.uniforms.uBase.value.set('#2c6b2a')
    m.uniforms.uLight.value.set('#7dbb4a')
    return m
  }, [])

  const { stems, leaves, rand } = useMemo(() => {
    const r = rng(42)
    const stems: THREE.BufferGeometry[] = []
    const leaves: THREE.Matrix4[] = []
    const view = HERO_LEAF.clone().add(new THREE.Vector3(0, -0.36, 0)) // keep the camera's line to this clear
    for (let s = 0; s < 12; s++) {
      const a = (s / 12) * Math.PI * 2 + r() * 0.3
      if (Math.sin(a) > 0.2) continue // stems leaning toward the camera would block the hero leaf
      const lean = 0.25 + r() * 0.5
      const h = 1.6 + r() * 1.1
      const pts = [0, 0.33, 0.66, 1].map(
        (t) => new THREE.Vector3(HERO.x + Math.cos(a) * lean * t * h * 0.5, t * h, HERO.z - 0.6 + Math.sin(a) * lean * t * h * 0.5),
      )
      const curve = new THREE.CatmullRomCurve3(pts)
      stems.push(new THREE.TubeGeometry(curve, 8, 0.011, 4, false))
      for (let k = 0; k < 16; k++) {
        const t = 0.25 + (k / 16) * 0.75
        const p = curve.getPoint(t)
        if (p.z > view.z - 0.25 && Math.hypot(p.x - view.x, p.y - view.y) < 0.75) continue
        const side = k % 2 ? 1 : -1
        const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(-0.9 - r() * 0.5, a + side * 1.3 + (r() - 0.5) * 0.5, 0))
        const sc = 0.18 + r() * 0.14
        leaves.push(new THREE.Matrix4().compose(p, q, new THREE.Vector3(sc * 0.75, sc, sc)))
      }
    }
    // the hero leaf's own stalk, back to the nearest stem
    stems.push(
      new THREE.TubeGeometry(
        new THREE.CatmullRomCurve3([HERO_LEAF.clone(), HERO_LEAF.clone().add(new THREE.Vector3(-0.02, 0.12, -0.2)), new THREE.Vector3(HERO.x, 2.55, HERO.z - 0.7)]),
        8,
        0.008,
        4,
        false,
      ),
    )
    const rand = Float32Array.from(leaves, () => r())
    return { stems: mergeGeometries(stems)!, leaves, rand }
  }, [])

  const geom = useMemo(() => {
    const g = new THREE.PlaneGeometry(1, 1, 2, 6)
    g.translate(0, 0.5, 0)
    g.setAttribute('aRand', new THREE.InstancedBufferAttribute(rand, 1))
    return g
  }, [rand])

  const heroGeom = useMemo(() => {
    const g = new THREE.PlaneGeometry(1, 1, 24, 48)
    g.translate(0, -0.5, 0) // pivot at the tip so it hangs toward us
    g.setAttribute('aRand', new THREE.InstancedBufferAttribute(new Float32Array([0.35]), 1))
    return g
  }, [])

  useLayoutEffect(() => {
    const c = new THREE.Color()
    leaves.forEach((m, i) => {
      inst.current.setMatrixAt(i, m)
      inst.current.setColorAt(i, c.setHSL(0.27 + rand[i] * 0.04, 0.45, 0.42 + rand[i] * 0.15))
    })
    inst.current.instanceMatrix.needsUpdate = true
    inst.current.computeBoundingSphere()
  }, [leaves, rand])

  useFrame(() => {
    const p = story.progress
    group.current.visible = p < T.shutter + 0.01
    if (!group.current.visible) return
    const t = story.time
    const reveal = seg(p, 0.27, T.focus)
    for (const m of [mat, heroMat]) {
      m.uniforms.uTime.value = t
      m.uniforms.uFogDensity.value = 0.016
    }
    heroMat.uniforms.uReveal.value = reveal * (1 - seg(p, T.focus + 0.01, T.shutter) * 0.6)
    heroMat.uniforms.uWind.value = 0.3
    // the leaf turns gently to face the camera as we arrive
    hero.current.rotation.set(0.15 - reveal * 0.15 + Math.sin(t * 0.8) * 0.03, -0.25 + reveal * 0.25, Math.sin(t * 0.6) * 0.04)
  })

  return (
    <group ref={group}>
      <mesh geometry={stems}>
        <meshStandardMaterial color="#56703a" roughness={0.9} />
      </mesh>
      <instancedMesh ref={inst} args={[geom, mat, leaves.length]} frustumCulled={false} />
      {/* the leaf we photograph, held as an instance of one so it shares the leaf shader */}
      <instancedMesh
        ref={hero}
        args={[heroGeom, heroMat, 1]}
        position={HERO_LEAF.toArray()}
        scale={[0.5, 0.72, 0.6]}
        frustumCulled={false}
      />
    </group>
  )
}
