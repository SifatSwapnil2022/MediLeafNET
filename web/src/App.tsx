import Lenis from 'lenis'
import { lazy, Suspense, useEffect, useRef, useState } from 'react'
import { Cursor } from './components/Cursor'
import { Loader } from './components/Loader'
import { Nav } from './components/Nav'
import { StoryOverlay } from './components/StoryOverlay'
import { clamp, story } from './lib/story'
import { Credits } from './sections/Credits'
import { Dataset } from './sections/Dataset'
import { Knowledge } from './sections/Knowledge'
import { TryIt } from './sections/TryIt'
import { UnderTheHood } from './sections/UnderTheHood'

const Experience = lazy(() => import('./three/Experience'))

function webglOk() {
  try {
    const c = document.createElement('canvas')
    return !!(c.getContext('webgl2') || c.getContext('webgl'))
  } catch {
    return false
  }
}

export default function App() {
  const storyRef = useRef<HTMLDivElement>(null)
  const canvasWrap = useRef<HTMLDivElement>(null)
  const [ready, setReady] = useState(false)
  const [active, setActive] = useState(true)
  const [gl] = useState(webglOk)

  useEffect(() => {
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    const lenis = reduce ? null : new Lenis({ lerp: 0.085, wheelMultiplier: 0.9, touchMultiplier: 1.4 })
    ;(window as unknown as { __lenis?: Lenis | null }).__lenis = lenis
    let raf = 0
    let last = -1
    const tick = (time: number) => {
      lenis?.raf(time)
      const el = storyRef.current
      if (el) {
        const total = el.offsetHeight - window.innerHeight
        const p = clamp(-el.getBoundingClientRect().top / Math.max(total, 1))
        story.velocity = p - story.progress
        story.progress = p
        // fade the 3D out as the story hands over to the page
        if (canvasWrap.current) canvasWrap.current.style.opacity = String(1 - clamp((p - 0.955) / 0.045))
        const live = p < 0.999
        if (live !== (last === 1)) {
          last = live ? 1 : 0
          setActive(live)
        }
      }
      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => {
      cancelAnimationFrame(raf)
      lenis?.destroy()
    }
  }, [])

  return (
    <>
      <Loader done={ready || !gl} />
      <Cursor />
      <Nav />

      <div ref={canvasWrap} className="stage" aria-hidden="true">
        {gl ? (
          <Suspense fallback={null}>
            <Experience active={active} onReady={() => setTimeout(() => setReady(true), 350)} />
          </Suspense>
        ) : (
          <div className="stage-fallback" />
        )}
      </div>

      <main>
        <div ref={storyRef} className="story" id="story">
          <StoryOverlay />
        </div>
        <Knowledge />
        <TryIt />
        <Dataset />
        <UnderTheHood />
        <Credits />
      </main>
    </>
  )
}
