import { useTexture } from '@react-three/drei'
import { useFrame } from '@react-three/fiber'
import { useMemo, useRef } from 'react'
import * as THREE from 'three'
import { seg, smooth, story, T } from '../lib/story'
import { arcFrag, arcVert, beadFrag, beadVert, beamFrag, layerFrag, layerVert, patchFrag, patchVert } from './shaders'
import { LAB, rng } from './world'

const GRID = 14
const PATCH = 0.36 // world size of one 16px patch while it is still a photo
const GAP = 0.44 // spacing once patches become tokens on the floor
export const LAYER_Y = (k: number) => -0.5 + k * 1.2 // six layers stacked above the tokens

// How much leaf (vs white paper) each patch holds. Drives which tokens glow
// and where the attention lines go. Computed from the photo itself.
function saliency(img: HTMLImageElement): Float32Array {
  const c = document.createElement('canvas')
  c.width = c.height = GRID * 8
  const ctx = c.getContext('2d', { willReadFrequently: true })!
  ctx.drawImage(img, 0, 0, c.width, c.height)
  const { data } = ctx.getImageData(0, 0, c.width, c.height)
  const out = new Float32Array(GRID * GRID)
  for (let j = 0; j < GRID; j++)
    for (let i = 0; i < GRID; i++) {
      let s = 0
      for (let y = 0; y < 8; y++)
        for (let x = 0; x < 8; x++) {
          const k = ((j * 8 + y) * c.width + (i * 8 + x)) * 4
          const r = data[k] / 255
          const g = data[k + 1] / 255
          const b = data[k + 2] / 255
          const green = g - (r + b) / 2
          const dark = 1 - (r + g + b) / 3
          s += Math.max(0, green * 3 + dark * 1.2 - 0.25)
        }
      out[j * GRID + i] = s / 64
    }
  const max = Math.max(...out) || 1
  return out.map((v) => Math.min(1, v / max))
}

export function Lab({ src }: { src: string }) {
  const group = useRef<THREE.Group>(null!)
  const cls = useRef<THREE.Mesh>(null!)
  const beam = useRef<THREE.Mesh>(null!)
  const shadow = useRef<THREE.Mesh>(null!)
  const beamMat = useMemo(
    () =>
      new THREE.ShaderMaterial({
        vertexShader: layerVert,
        fragmentShader: beamFrag,
        transparent: true,
        depthWrite: false,
        side: THREE.DoubleSide,
        uniforms: { uOpacity: { value: 0 }, uTime: { value: 0 } },
      }),
    [],
  )
  const layerRefs = useRef<THREE.Mesh[]>([])
  const map = useTexture(src)
  map.colorSpace = THREE.SRGBColorSpace
  map.anisotropy = 4

  const sal = useMemo(() => saliency(map.image as HTMLImageElement), [map])

  const patchMat = useMemo(
    () =>
      new THREE.ShaderMaterial({
        vertexShader: patchVert,
        fragmentShader: patchFrag,
        side: THREE.DoubleSide,
        uniforms: {
          uMap: { value: map },
          uExplode: { value: 0 },
          uFlat: { value: 0 },
          uToken: { value: 0 },
          uScan: { value: 0 },
          uGrid: { value: 0 },
          uTime: { value: 0 },
          uWave: { value: 0 },
          uSize: { value: PATCH },
          uGap: { value: GAP },
        },
      }),
    [map],
  )

  const patches = useMemo(() => {
    const base = new THREE.PlaneGeometry(1, 1)
    const g = new THREE.InstancedBufferGeometry()
    g.index = base.index
    g.setAttribute('position', base.getAttribute('position'))
    g.setAttribute('uv', base.getAttribute('uv'))
    const cell = new Float32Array(GRID * GRID * 2)
    const rand = new Float32Array(GRID * GRID)
    const r = rng(5)
    for (let j = 0; j < GRID; j++)
      for (let i = 0; i < GRID; i++) {
        const k = j * GRID + i
        cell[k * 2] = i
        cell[k * 2 + 1] = j
        rand[k] = r()
      }
    g.setAttribute('aCell', new THREE.InstancedBufferAttribute(cell, 2))
    g.setAttribute('aRand', new THREE.InstancedBufferAttribute(rand, 1))
    g.setAttribute('aSal', new THREE.InstancedBufferAttribute(sal, 1))
    g.instanceCount = GRID * GRID
    return g
  }, [sal])

  // attention arcs from the CLS hub to the patches with the most leaf in them
  const arcs = useMemo(() => {
    const idx = Array.from(sal, (v, i) => [v, i] as const)
      .sort((a, b) => b[0] - a[0])
      .slice(0, 46)
    const SEGS = 28
    const n = idx.length * SEGS * 2
    const target = new Float32Array(n * 3)
    const t = new Float32Array(n)
    const w = new Float32Array(n)
    const phase = new Float32Array(n)
    const r = rng(9)
    let v = 0
    idx.forEach(([s, i]) => {
      const x = ((i % GRID) - 6.5) * GAP
      const z = (Math.floor(i / GRID) - 6.5) * GAP
      const ph = r()
      for (let k = 0; k < SEGS; k++)
        for (const e of [k, k + 1]) {
          target.set([x, -1.55, z], v * 3)
          t[v] = e / SEGS
          w[v] = 0.35 + s * 0.65
          phase[v] = ph
          v++
        }
    })
    const g = new THREE.BufferGeometry()
    g.setAttribute('position', new THREE.BufferAttribute(target.slice(), 3))
    g.setAttribute('aTarget', new THREE.BufferAttribute(target, 3))
    g.setAttribute('aT', new THREE.BufferAttribute(t, 1))
    g.setAttribute('aW', new THREE.BufferAttribute(w, 1))
    g.setAttribute('aPhase', new THREE.BufferAttribute(phase, 1))
    return g
  }, [sal])
  const arcMat = useMemo(
    () =>
      new THREE.ShaderMaterial({
        vertexShader: arcVert,
        fragmentShader: arcFrag,
        transparent: true,
        depthWrite: false,
        depthTest: false,
        uniforms: { uHub: { value: new THREE.Vector3() }, uTime: { value: 0 }, uOpacity: { value: 0 } },
      }),
    [],
  )

  // beads: a few per attention line, each riding its curve
  const beads = useMemo(() => {
    const per = 5
    const src = arcs
    const tgt = src.getAttribute('aTarget') as THREE.BufferAttribute
    const w = src.getAttribute('aW') as THREE.BufferAttribute
    const ph = src.getAttribute('aPhase') as THREE.BufferAttribute
    const SEGS2 = 28 * 2
    const lines = tgt.count / SEGS2
    const n = lines * per
    const T3 = new Float32Array(n * 3)
    const T1 = new Float32Array(n)
    const W1 = new Float32Array(n)
    const P1 = new Float32Array(n)
    for (let l = 0; l < lines; l++)
      for (let k = 0; k < per; k++) {
        const i = l * per + k
        const v = l * SEGS2
        T3.set([tgt.getX(v), tgt.getY(v), tgt.getZ(v)], i * 3)
        T1[i] = k / per
        W1[i] = w.getX(v)
        P1[i] = ph.getX(v)
      }
    const g = new THREE.BufferGeometry()
    g.setAttribute('position', new THREE.BufferAttribute(T3.slice(), 3))
    g.setAttribute('aTarget', new THREE.BufferAttribute(T3, 3))
    g.setAttribute('aT', new THREE.BufferAttribute(T1, 1))
    g.setAttribute('aW', new THREE.BufferAttribute(W1, 1))
    g.setAttribute('aPhase', new THREE.BufferAttribute(P1, 1))
    return g
  }, [arcs])
  const beadMat = useMemo(
    () =>
      new THREE.ShaderMaterial({
        vertexShader: beadVert,
        fragmentShader: beadFrag,
        transparent: true,
        depthWrite: false,
        depthTest: false,
        uniforms: {
          uHub: arcMat.uniforms.uHub,
          uTime: { value: 0 },
          uOpacity: { value: 0 },
          uPixelRatio: { value: Math.min(window.devicePixelRatio, 2) },
        },
      }),
    [arcMat],
  )

  const layerMats = useMemo(
    () =>
      Array.from(
        { length: 6 },
        () =>
          new THREE.ShaderMaterial({
            vertexShader: layerVert,
            fragmentShader: layerFrag,
            transparent: true,
            depthWrite: false,
            side: THREE.DoubleSide,
            uniforms: { uGlow: { value: 0 }, uOpacity: { value: 0 }, uTime: { value: 0 } },
          }),
      ),
    [],
  )

  const floor = useMemo(
    () =>
      new THREE.ShaderMaterial({
        transparent: true,
        depthWrite: false,
        uniforms: { uOpacity: { value: 0 } },
        vertexShader: layerVert,
        fragmentShader: /* glsl */ `
          uniform float uOpacity; varying vec2 vUv;
          void main(){
            vec2 g = abs(fract(vUv * 60.0) - 0.5);
            float line = 1.0 - smoothstep(0.47, 0.5, max(g.x, g.y));
            float fade = smoothstep(0.5, 0.05, length(vUv - 0.5));
            gl_FragColor = vec4(vec3(0.2, 0.4, 0.22), (1.0 - line) * 0.16 * fade * uOpacity);
          }`,
      }),
    [],
  )

  useFrame(() => {
    const p = story.progress
    const t = story.time
    group.current.visible = p > T.shutter - 0.01
    if (!group.current.visible) return

    const scan = seg(p, T.shutter + 0.015, T.scanEnd - 0.01)
    const explode = seg(p, T.scanEnd, T.explodeEnd)
    const flat = seg(p, T.explodeEnd - 0.005, T.tokensEnd)
    const layers = seg(p, T.tokensEnd, T.layersEnd)
    const pred = seg(p, T.layersEnd, T.predEnd)

    const u = patchMat.uniforms
    u.uTime.value = t
    u.uScan.value = scan
    u.uGrid.value = smooth(seg(p, T.shutter + 0.01, T.shutter + 0.03)) * (1 - flat * 0.7)
    u.uExplode.value = smooth(explode) * (1 - smooth(flat))
    u.uFlat.value = smooth(flat)
    u.uToken.value = smooth(seg(p, T.explodeEnd - 0.02, T.tokensEnd - 0.01))
    const wave = layers * 6.8 - 0.4
    u.uWave.value = layers > 0 && layers < 1 ? wave : 0

    layerMats.forEach((m, k) => {
      m.uniforms.uTime.value = t + k * 0.3
      m.uniforms.uOpacity.value = smooth(seg(p, T.tokensEnd - 0.02 + k * 0.006, T.tokensEnd + 0.03 + k * 0.006)) * (1 - pred * 0.75)
      m.uniforms.uGlow.value = Math.exp(-Math.pow(wave - k - 0.5, 2) * 1.6) * (layers < 1 ? 1 : 0) + pred * (k === 5 ? 0.6 : 0)
      const mesh = layerRefs.current[k]
      if (mesh) mesh.position.y = LAYER_Y(k) + (1 - smooth(seg(p, T.tokensEnd - 0.02, T.tokensEnd + 0.04))) * 3
    })

    // CLS token: waits at the front row, rides the wave up, then fires the answer
    const hubLayer = Math.min(5, Math.max(0, wave - 0.5))
    const clsY = layers <= 0 ? -1.55 : LAYER_Y(0) + hubLayer * 1.2 + smooth(pred) * 3.2
    const appear = smooth(seg(p, T.explodeEnd + 0.01, T.tokensEnd))
    cls.current.position.set(0, clsY, layers <= 0 ? -3.6 * (1 - smooth(seg(p, T.tokensEnd - 0.01, T.tokensEnd + 0.02))) : 0)
    cls.current.scale.setScalar(0.001 + appear * 0.34 * (1 + Math.sin(t * 4) * 0.06))
    cls.current.rotation.set(t * 0.6, t * 0.9, 0)

    beadMat.uniforms.uTime.value = t
    arcMat.uniforms.uTime.value = t
    arcMat.uniforms.uHub.value.set(0, clsY, 0)
    arcMat.uniforms.uOpacity.value = smooth(seg(p, T.tokensEnd + 0.01, T.tokensEnd + 0.04)) * (1 - smooth(seg(p, T.layersEnd - 0.01, T.layersEnd + 0.03)))

    beadMat.uniforms.uOpacity.value = arcMat.uniforms.uOpacity.value
    beam.current.visible = pred > 0
    const len = 9 * smooth(pred)
    beam.current.position.set(0, clsY + len / 2, 0)
    beam.current.scale.set(0.06, Math.max(len, 0.001), 0.06)
    beamMat.uniforms.uOpacity.value = smooth(pred)
    beamMat.uniforms.uTime.value = t
    ;(shadow.current.material as THREE.MeshBasicMaterial).opacity = 0.14 * (1 - smooth(explode))
    shadow.current.visible = explode < 0.99

    floor.uniforms.uOpacity.value = smooth(seg(p, T.explodeEnd, T.tokensEnd))
  })

  return (
    <group ref={group} position={LAB.toArray()}>
      {/* paper shadow behind the photo */}
      <mesh ref={shadow} position={[0.08, -0.1, -0.05]}>
        <planeGeometry args={[GRID * PATCH * 1.02, GRID * PATCH * 1.02]} />
        <meshBasicMaterial color="#1f3a22" transparent opacity={0.14} depthWrite={false} />
      </mesh>
      <mesh geometry={patches} material={patchMat} frustumCulled={false} />

      <mesh rotation-x={-Math.PI / 2} position={[0, -1.72, 0]} material={floor}>
        <planeGeometry args={[40, 40]} />
      </mesh>

      {layerMats.map((m, k) => (
        <mesh
          key={k}
          ref={(el) => {
            if (el) layerRefs.current[k] = el
          }}
          rotation-x={-Math.PI / 2}
          position={[0, LAYER_Y(k), 0]}
          material={m}
        >
          <planeGeometry args={[GRID * GAP + 0.6, GRID * GAP + 0.6]} />
        </mesh>
      ))}

      <lineSegments geometry={arcs} material={arcMat} frustumCulled={false} renderOrder={5} />
      <points geometry={beads} material={beadMat} frustumCulled={false} renderOrder={6} />

      <mesh ref={cls}>
        <octahedronGeometry args={[1, 0]} />
        <meshStandardMaterial color="#f2b224" emissive="#d18a06" emissiveIntensity={0.8} roughness={0.3} metalness={0.1} />
      </mesh>
      <mesh ref={beam} material={beamMat}>
        <cylinderGeometry args={[1, 1, 1, 24, 1, true]} />
      </mesh>
    </group>
  )
}
