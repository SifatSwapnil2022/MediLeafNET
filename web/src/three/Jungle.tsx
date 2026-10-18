import { useFrame, useThree } from '@react-three/fiber'
import { useLayoutEffect, useMemo, useRef } from 'react'
import * as THREE from 'three'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'
import { story, seg, T } from '../lib/story'
import { leafFrag, leafVert, pollenFrag, pollenVert, rayFrag, rayVert } from './shaders'
import { CAMERA_PATH, HERO, SUN_DIR, rng } from './world'

const FOG = new THREE.Color('#cadcc2')

export function makeLeafMaterial(opts: Partial<Record<string, number>> = {}) {
  return new THREE.ShaderMaterial({
    vertexShader: leafVert,
    fragmentShader: leafFrag,
    side: THREE.DoubleSide,
    uniforms: {
      uTime: { value: 0 },
      uWind: { value: 1 },
      uSunDir: { value: SUN_DIR.clone() },
      uBase: { value: new THREE.Color('#2a5a28') },
      uLight: { value: new THREE.Color('#6caa42') },
      uBack: { value: new THREE.Color('#e9ff9e') },
      uSerrate: { value: opts.serrate ?? 0 },
      uRhomb: { value: opts.rhomb ?? 0 },
      uReveal: { value: 0 },
      uFogColor: { value: FOG.clone() },
      uFogDensity: { value: 0.019 },
    },
  })
}

function leafGeometry() {
  const g = new THREE.PlaneGeometry(1, 1, 2, 6)
  g.translate(0, 0.5, 0)
  return g
}

interface LeafSpec {
  pos: THREE.Vector3
  rot: THREE.Euler
  scale: THREE.Vector3
  color: THREE.Color
}

function Leaves({ specs, material }: { specs: LeafSpec[]; material: THREE.ShaderMaterial }) {
  const ref = useRef<THREE.InstancedMesh>(null!)
  const geom = useMemo(() => {
    const g = leafGeometry()
    const r = rng(specs.length)
    g.setAttribute('aRand', new THREE.InstancedBufferAttribute(Float32Array.from(specs, () => r()), 1))
    return g
  }, [specs])

  useLayoutEffect(() => {
    const m = new THREE.Matrix4()
    const q = new THREE.Quaternion()
    specs.forEach((s, i) => {
      m.compose(s.pos, q.setFromEuler(s.rot), s.scale)
      ref.current.setMatrixAt(i, m)
      ref.current.setColorAt(i, s.color)
    })
    ref.current.instanceMatrix.needsUpdate = true
    if (ref.current.instanceColor) ref.current.instanceColor.needsUpdate = true
    ref.current.computeBoundingSphere()
  }, [specs])

  return <instancedMesh ref={ref} args={[geom, material, specs.length]} frustumCulled={false} />
}

function pathXAt(z: number) {
  let best = 0
  let bestD = Infinity
  for (let i = 0; i <= 200; i++) {
    const p = CAMERA_PATH.getPointAt(i / 200)
    const d = Math.abs(p.z - z)
    if (d < bestD) ((bestD = d), (best = p.x))
  }
  return best
}

export function Jungle({ density = 1 }: { density?: number }) {
  const group = useRef<THREE.Group>(null!)
  const leafMat = useMemo(() => makeLeafMaterial(), [])
  const fernMat = useMemo(() => makeLeafMaterial({ rhomb: 0.15 }), [])
  const { gl } = useThree()

  const { trunks, canopy, understory } = useMemo(() => {
    const r = rng(7)
    const trunkGeoms: THREE.BufferGeometry[] = []
    const canopy: LeafSpec[] = []
    const understory: LeafSpec[] = []
    const greens = ['#9fd36b', '#7fbf55', '#c4e07a', '#6aa84f', '#b5d96a', '#8cc063'].map((c) => new THREE.Color(c))
    const pick = () => greens[Math.floor(r() * greens.length)].clone().multiplyScalar(0.55 + r() * 0.45)

    const nTrees = Math.round(52 * density)
    let placed = 0
    let guard = 0
    while (placed < nTrees && guard++ < 2000) {
      const z = 22 - r() * 150
      const x = (r() - 0.5) * 70
      if (Math.abs(x - pathXAt(z)) < 3.2) continue
      if (Math.hypot(x - HERO.x, z - HERO.z) < 6) continue
      placed++
      const h = 9 + r() * 13
      const lean = new THREE.Vector3((r() - 0.5) * 2.5, 0, (r() - 0.5) * 2.5)
      const pts = [
        new THREE.Vector3(x, -0.5, z),
        new THREE.Vector3(x + lean.x * 0.2, h * 0.35, z + lean.z * 0.2),
        new THREE.Vector3(x + lean.x * 0.6, h * 0.7, z + lean.z * 0.6),
        new THREE.Vector3(x + lean.x, h, z + lean.z),
      ]
      const radius = 0.22 + r() * 0.35
      trunkGeoms.push(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 10, radius, 6, false))
      // buttress roots
      for (let k = 0; k < 3; k++) {
        const a = r() * Math.PI * 2
        const root = new THREE.CatmullRomCurve3([
          new THREE.Vector3(x, 1.2, z),
          new THREE.Vector3(x + Math.cos(a) * 0.9, 0.35, z + Math.sin(a) * 0.9),
          new THREE.Vector3(x + Math.cos(a) * 1.8, -0.2, z + Math.sin(a) * 1.8),
        ])
        trunkGeoms.push(new THREE.TubeGeometry(root, 5, radius * 0.45, 5, false))
      }
      const clusters = 3 + Math.floor(r() * 3)
      for (let c = 0; c < clusters; c++) {
        const from = pts[2].clone().lerp(pts[3], r())
        const dir = new THREE.Vector3(r() - 0.5, 0.35 + r() * 0.4, r() - 0.5).normalize()
        const end = from.clone().addScaledVector(dir, 2 + r() * 3.5)
        trunkGeoms.push(
          new THREE.TubeGeometry(new THREE.CatmullRomCurve3([from, from.clone().lerp(end, 0.5).add(new THREE.Vector3(0, 0.4, 0)), end]), 6, radius * 0.35, 5, false),
        )
        const n = Math.round((70 + r() * 50) * density)
        const rad = 1.6 + r() * 1.6
        for (let i = 0; i < n; i++) {
          const off = new THREE.Vector3(r() - 0.5, (r() - 0.5) * 0.6, r() - 0.5).normalize().multiplyScalar(rad * Math.cbrt(r()))
          const s = 0.55 + r() * 0.7
          canopy.push({
            pos: end.clone().add(off),
            rot: new THREE.Euler(r() * Math.PI, r() * Math.PI * 2, r() * Math.PI),
            scale: new THREE.Vector3(s * 0.55, s, s),
            color: pick(),
          })
        }
      }
      // epiphytes and hanging leaves lower on the trunk
      for (let i = 0; i < 18 * density; i++) {
        const t = 0.15 + r() * 0.5
        const p = new THREE.CatmullRomCurve3(pts).getPoint(t)
        const s = 0.4 + r() * 0.5
        canopy.push({
          pos: p.add(new THREE.Vector3((r() - 0.5) * 1.2, 0, (r() - 0.5) * 1.2)),
          rot: new THREE.Euler(Math.PI * (0.6 + r() * 0.5), r() * Math.PI * 2, 0),
          scale: new THREE.Vector3(s * 0.5, s, s),
          color: pick(),
        })
      }
    }

    // a loose roof of foliage so light only gets in through gaps
    for (let k = 0; k < Math.round(170 * density); k++) {
      const c = new THREE.Vector3((r() - 0.5) * 80, 11 + r() * 7, 24 - r() * 150)
      const n = 30 + Math.floor(r() * 25)
      for (let i = 0; i < n; i++) {
        const off = new THREE.Vector3(r() - 0.5, (r() - 0.5) * 0.4, r() - 0.5).multiplyScalar(5)
        const s = 0.9 + r() * 1.1
        canopy.push({
          pos: c.clone().add(off),
          rot: new THREE.Euler(Math.PI * 0.5 + (r() - 0.5) * 1.2, r() * Math.PI * 2, (r() - 0.5) * 0.8),
          scale: new THREE.Vector3(s * 0.55, s, s),
          color: pick().multiplyScalar(0.8),
        })
      }
    }

    // understory: shrubs and ferns hugging the path
    const nShrubs = Math.round(320 * density)
    for (let k = 0; k < nShrubs; k++) {
      const z = 22 - r() * 148
      const px = pathXAt(z)
      const side = r() < 0.5 ? -1 : 1
      const x = px + side * (1.3 + Math.pow(r(), 1.4) * 22)
      if (Math.hypot(x - HERO.x, z - HERO.z) < 2.2) continue
      const n = 14 + Math.floor(r() * 26)
      const height = 0.6 + r() * 2.4
      for (let i = 0; i < n; i++) {
        const a = r() * Math.PI * 2
        const rr = r() * 0.7
        const s = 0.35 + r() * 0.75
        const fern = r() < 0.35
        understory.push({
          pos: new THREE.Vector3(x + Math.cos(a) * rr, r() * height, z + Math.sin(a) * rr),
          rot: new THREE.Euler(-0.3 - r() * 0.9, a + Math.PI / 2, (r() - 0.5) * 0.6),
          scale: fern ? new THREE.Vector3(s * 0.35, s * 2.1, s) : new THREE.Vector3(s * 0.6, s, s),
          color: pick().multiplyScalar(0.85),
        })
      }
    }

    // leaf litter on the forest floor
    for (let i = 0; i < Math.round(4200 * density); i++) {
      const z = 24 - r() * 150
      const x = (r() - 0.5) * 60
      const s = 0.25 + r() * 0.45
      understory.push({
        pos: new THREE.Vector3(x, -0.24 + r() * 0.05, z),
        rot: new THREE.Euler(-Math.PI / 2 + (r() - 0.5) * 0.4, 0, r() * Math.PI * 2),
        scale: new THREE.Vector3(s * 0.6, s, s),
        color: new THREE.Color().setHSL(0.12 + r() * 0.12, 0.35 + r() * 0.2, 0.18 + r() * 0.12),
      })
    }

    const trunks = mergeGeometries(trunkGeoms)!
    trunkGeoms.forEach((g) => g.dispose())
    return { trunks, canopy, understory }
  }, [density])

  const pollen = useMemo(() => {
    const r = rng(3)
    const n = Math.round(900 * density)
    const pos = new Float32Array(n * 3)
    const rand = new Float32Array(n)
    for (let i = 0; i < n; i++) {
      pos[i * 3] = (r() - 0.5) * 50
      pos[i * 3 + 1] = r() * 12 + 0.5
      pos[i * 3 + 2] = 25 - r() * 135
      rand[i] = r()
    }
    const g = new THREE.BufferGeometry()
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3))
    g.setAttribute('aRand', new THREE.BufferAttribute(rand, 1))
    return g
  }, [density])
  const pollenMat = useMemo(
    () =>
      new THREE.ShaderMaterial({
        vertexShader: pollenVert,
        fragmentShader: pollenFrag,
        transparent: true,
        depthWrite: false,
        uniforms: { uTime: { value: 0 }, uPixelRatio: { value: gl.getPixelRatio() }, uOpacity: { value: 1 } },
      }),
    [gl],
  )

  const rays = useMemo(() => {
    const r = rng(11)
    return Array.from({ length: 12 }, (_, i) => ({
      pos: [(r() - 0.5) * 16, 12, 12 - i * 10 - r() * 6] as [number, number, number],
      rot: [0, 0, -0.35 - r() * 0.15] as [number, number, number],
      scale: [3 + r() * 5, 36, 1] as [number, number, number],
      seed: r(),
    }))
  }, [])
  const rayMats = useMemo(
    () =>
      rays.map(
        (ray) =>
          new THREE.ShaderMaterial({
            vertexShader: rayVert,
            fragmentShader: rayFrag,
            transparent: true,
            depthWrite: false,
            blending: THREE.AdditiveBlending,
            side: THREE.DoubleSide,
            uniforms: { uTime: { value: 0 }, uOpacity: { value: 1 }, uSeed: { value: ray.seed } },
          }),
      ),
    [rays],
  )

  useFrame((_, dt) => {
    const p = story.progress
    const t = story.time
    group.current.visible = p < T.shutter + 0.01
    if (!group.current.visible) return
    const density = 0.019 - seg(p, 0.2, T.flyEnd) * 0.004
    for (const m of [leafMat, fernMat]) {
      m.uniforms.uTime.value = t
      m.uniforms.uFogDensity.value = density
    }
    pollenMat.uniforms.uTime.value = t
    rayMats.forEach((m) => (m.uniforms.uTime.value = t))
    void dt
  })

  return (
    <group ref={group}>
      <mesh geometry={trunks} castShadow={false}>
        <meshStandardMaterial color="#4f4033" roughness={0.95} />
      </mesh>
      <Leaves specs={canopy} material={leafMat} />
      <Leaves specs={understory} material={fernMat} />
      <points geometry={pollen} material={pollenMat} frustumCulled={false} />
      {rays.map((ray, i) => (
        <mesh key={i} position={ray.pos} rotation={ray.rot} scale={ray.scale} material={rayMats[i]}>
          <planeGeometry args={[1, 1]} />
        </mesh>
      ))}
      <SunGlow />
      <mesh rotation-x={-Math.PI / 2} position={[0, -0.3, -50]}>
        <planeGeometry args={[220, 220]} />
        <meshStandardMaterial color="#6f8f5c" roughness={1} />
      </mesh>
    </group>
  )
}

// Warm haze deep in the forest. Not fogged, so trees read as silhouettes against it.
function SunGlow() {
  const tex = useMemo(() => {
    const c = document.createElement('canvas')
    c.width = c.height = 256
    const g = c.getContext('2d')!
    const grd = g.createRadialGradient(128, 110, 4, 128, 128, 128)
    grd.addColorStop(0, 'rgba(255,252,235,1)')
    grd.addColorStop(0.2, 'rgba(255,240,190,0.6)')
    grd.addColorStop(0.55, 'rgba(230,245,200,0.2)')
    grd.addColorStop(1, 'rgba(0,0,0,0)')
    g.fillStyle = grd
    g.fillRect(0, 0, 256, 256)
    const t = new THREE.CanvasTexture(c)
    t.colorSpace = THREE.SRGBColorSpace
    return t
  }, [])
  return (
    <mesh position={[-6, 16, -175]} renderOrder={-1}>
      <planeGeometry args={[220, 150]} />
      <meshBasicMaterial map={tex} transparent depthWrite={false} fog={false} blending={THREE.AdditiveBlending} toneMapped={false} opacity={0.85} />
    </mesh>
  )
}
