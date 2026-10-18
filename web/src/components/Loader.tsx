import { useEffect, useState } from 'react'

export function Loader({ done }: { done: boolean }) {
  const [gone, setGone] = useState(false)
  useEffect(() => {
    if (!done) return
    const t = setTimeout(() => setGone(true), 1100)
    return () => clearTimeout(t)
  }, [done])
  if (gone) return null
  return (
    <div className={`loader ${done ? 'loader--out' : ''}`} role="status" aria-live="polite">
      <svg viewBox="0 0 120 120" aria-hidden="true">
        <path className="loader-leaf" d="M24 98C24 52 52 26 98 22C96 70 70 96 26 96" />
        <path className="loader-rib" d="M24 98L72 48" />
      </svg>
      <p>Growing the forest…</p>
    </div>
  )
}
