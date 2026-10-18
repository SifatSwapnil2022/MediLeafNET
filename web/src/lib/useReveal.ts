import { useEffect, useRef } from 'react'

// Adds `is-in` to every [data-reveal] child once it scrolls into view.
export function useReveal<T extends HTMLElement>() {
  const ref = useRef<T>(null)
  useEffect(() => {
    const items = ref.current?.querySelectorAll<HTMLElement>('[data-reveal]') ?? []
    const io = new IntersectionObserver(
      (entries) =>
        entries.forEach((e) => {
          if (e.isIntersecting) {
            e.target.classList.add('is-in')
            io.unobserve(e.target)
          }
        }),
      { rootMargin: '0px 0px -12% 0px', threshold: 0.1 },
    )
    items.forEach((el, i) => {
      el.style.setProperty('--d', `${(Number(el.dataset.reveal) || i % 4) * 90}ms`)
      io.observe(el)
    })
    return () => io.disconnect()
  }, [])
  return ref
}
