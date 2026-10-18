import { Canvas, useFrame, useThree } from '@react-three/fiber'
import { Bloom, EffectComposer, Noise, Vignette } from '@react-three/postprocessing'
import { Suspense, useEffect, useMemo, useState } from 'react'
import * as THREE from 'three'
import { seg, story, T } from '../lib/story'
import { CameraRig } from './CameraRig'
import { HeroShrub } from './HeroShrub'
import { Jungle } from './Jungle'
import { Lab } from './Lab'
import { SUN_DIR } from './world'

const FOREST = new THREE.Color('#cadcc2')
const DAWN = new THREE.Color('#dbe6cc')
const LABBG = new THREE.Color('#eaf1e5')

function Atmosphere() {
  const { scene } = useThree()
  const fog = useMemo(() => new THREE.FogExp2(FOREST.getHex(), 0.03), [])
  const bg = useMemo(() => FOREST.clone(), [])
  useEffect(() => {
    scene.fog = fog
    scene.background = bg
  }, [scene, fog, bg])
  useFrame(() => {
    const p = story.progress
    if (p < T.shutter) {
      bg.copy(FOREST).lerp(DAWN, seg(p, 0.15, T.flyEnd))
      fog.color.copy(bg)
      fog.density = 0.019
    } else {
      bg.copy(LABBG)
      fog.color.copy(bg)
      fog.density = 0.0
    }
  })
  return (
    <>
      <hemisphereLight args={['#f4fbe8', '#53704a', 1.15]} />
      <directionalLight position={SUN_DIR.clone().multiplyScalar(60).toArray()} intensity={2.1} color="#fff1cf" />
      <ambientLight intensity={0.35} />
    </>
  )
}

function Clock() {
  useFrame((_, dt) => {
    story.time += Math.min(dt, 0.1)
  })
  return null
}

export default function Experience({ active, onReady }: { active: boolean; onReady: () => void }) {
  const [lowPower] = useState(() => window.innerWidth < 760 || (navigator.hardwareConcurrency ?? 8) <= 4)
  return (
    <Canvas
      dpr={lowPower ? [1, 1.25] : [1, 1.75]}
      frameloop={active ? 'always' : 'never'}
      gl={{ antialias: false, powerPreference: 'high-performance', stencil: false }}
      eventSource={document.body}
      eventPrefix="client"
      camera={{ fov: 50, near: 0.03, far: 400, position: [0, 6.5, 32] }}
      onCreated={({ gl }) => {
        gl.toneMapping = THREE.ACESFilmicToneMapping
        gl.toneMappingExposure = 1.0
        requestAnimationFrame(() => onReady())
      }}
    >
      <Clock />
      <Atmosphere />
      <CameraRig />
      <Suspense fallback={null}>
        <Jungle density={lowPower ? 0.55 : 1} />
        <HeroShrub />
        <Lab src={`${import.meta.env.BASE_URL}samples/sida_rhombifolia.jpg`} />
      </Suspense>
      <EffectComposer multisampling={0} enableNormalPass={false}>
        <Bloom mipmapBlur intensity={0.4} luminanceThreshold={0.93} luminanceSmoothing={0.15} />
        <Noise opacity={0.025} />
        <Vignette offset={0.32} darkness={0.32} />
      </EffectComposer>
    </Canvas>
  )
}
