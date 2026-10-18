import type Lenis from 'lenis'

function go(id: string) {
  return (e: React.MouseEvent) => {
    e.preventDefault()
    const target = document.getElementById(id)
    const lenis = (window as unknown as { __lenis?: Lenis | null }).__lenis
    if (!target) return
    if (lenis) lenis.scrollTo(target, { duration: 1.6 })
    else target.scrollIntoView({ behavior: 'smooth' })
  }
}

export function Nav() {
  return (
    <header className="nav">
      <a href="#story" className="nav-brand" onClick={go('story')}>
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden="true">
          <path d="M5 19c0-8 5-13 14-14 0 9-5 14-13 14" />
          <path d="M5 19 13 11" />
        </svg>
        MediLeafNET
      </a>
      <nav aria-label="Sections">
        <a href="#try" onClick={go('try')}>
          Try it
        </a>
        <a href="#dataset" onClick={go('dataset')}>
          Dataset
        </a>
        <a href="#how" onClick={go('how')}>
          How it works
        </a>
        <a href={`${import.meta.env.BASE_URL}playground`}>Playground</a>
        <a href="https://github.com/SifatSwapnil2022/MediLeafNET" target="_blank" rel="noreferrer">
          GitHub ↗
        </a>
      </nav>
    </header>
  )
}
