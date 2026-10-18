import { useEffect, useRef } from 'react'

// A soft ring that trails the pointer and swells over anything clickable.
// Skipped entirely on touch screens.
export function Cursor() {
  const ring = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!window.matchMedia('(pointer: fine)').matches) return
    const el = ring.current!
    el.style.display = 'block'
    let x = innerWidth / 2
    let y = innerHeight / 2
    let tx = x
    let ty = y
    let raf = 0
    const move = (e: PointerEvent) => {
      tx = e.clientX
      ty = e.clientY
      const hot = (e.target as Element)?.closest?.('a, button, input, textarea, label, select, [data-hot]')
      el.dataset.hot = hot ? 'true' : 'false'
    }
    const loop = () => {
      x += (tx - x) * 0.2
      y += (ty - y) * 0.2
      el.style.transform = `translate3d(${x}px, ${y}px, 0)`
      raf = requestAnimationFrame(loop)
    }
    window.addEventListener('pointermove', move)
    raf = requestAnimationFrame(loop)
    return () => {
      window.removeEventListener('pointermove', move)
      cancelAnimationFrame(raf)
    }
  }, [])
  return <div ref={ring} className="cursor" aria-hidden="true" />
}
