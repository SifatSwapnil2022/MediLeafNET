import { useEffect, useRef } from 'react'
import { PLANTS } from '../../shared/plants'
import { seg, smooth, story, T, windowOpacity } from '../lib/story'

interface Chapter {
  a: number
  b: number
  side: 'left' | 'right' | 'center'
  kicker?: string
  title: React.ReactNode
  body?: React.ReactNode
  note?: string
}

const CHAPTERS: Chapter[] = [
  {
    a: 0.1,
    b: 0.195,
    side: 'right',
    kicker: 'July to November',
    title: 'We spent five months photographing leaves.',
    body: (
      <>
        In the National Botanic Garden, in Boldha Garden in Wari, and along the roads around Aftabnagar. Staff from the
        garden and experts from the Bangladesh National Herbarium helped us name every plant.
      </>
    ),
  },
  {
    a: 0.21,
    b: 0.32,
    side: 'left',
    kicker: 'Sida rhombifolia',
    title: (
      <>
        This one is <em>Bala.</em>
      </>
    ),
    body: 'A small woody shrub with toothed, diamond-shaped leaves. People use it for fever, diarrhea and asthma. It can also raise blood pressure, which matters a lot if you have a heart condition.',
  },
  {
    a: T.focus - 0.012,
    b: T.shutter + 0.004,
    side: 'right',
    title: 'One leaf. Plain paper. Daylight.',
    body: 'All of our photos were shot on phones in natural daylight. No microscope, no lab. It should work with the camera you already carry.',
  },
  {
    a: T.shutter + 0.012,
    b: T.scanEnd,
    side: 'left',
    kicker: '224 × 224 pixels',
    title: "The model doesn't see a leaf. It sees 196 squares.",
    body: 'The photo is cut into a 14 × 14 grid of 16-pixel patches. Nothing about the shape of a leaf is built in. It has to learn all of that from examples.',
  },
  {
    a: T.scanEnd + 0.005,
    b: T.explodeEnd + 0.004,
    side: 'right',
    kicker: 'patch → token',
    title: 'Each square becomes a list of 384 numbers.',
    body: 'A learned projection turns every patch into a vector. We add where it came from in the grid, so a patch from the tip and a patch from the stalk never get mixed up.',
  },
  {
    a: T.explodeEnd + 0.01,
    b: T.tokensEnd + 0.004,
    side: 'left',
    kicker: 'the class token',
    title: "And one gold token that doesn't belong to any square.",
    body: "It starts out empty. It never sees the photo directly, only what the other tokens tell it. At the end, it's the one we read the answer from.",
  },
  {
    a: T.tokensEnd + 0.012,
    b: T.layersEnd + 0.002,
    side: 'right',
    kicker: '6 layers · 6 heads',
    title: 'Six rounds of looking around.',
    body: 'In every layer, each token compares itself with every other token and decides what to pay attention to. A patch on the toothed edge can check what the veins in the middle look like before anything is decided.',
    note: 'The gold lines here are drawn from how much leaf each patch holds. The demo further down shows the real attention from the model.',
  },
]

const STEPS = [
  ['01', 'The garden', 0],
  ['02', 'Bala', 0.2],
  ['03', 'The photo', T.focus],
  ['04', 'Patches', T.shutter],
  ['05', 'Tokens', T.scanEnd],
  ['06', 'Attention', T.tokensEnd],
  ['07', 'The answer', T.layersEnd],
] as const

// Small spread for the losing classes. Only the winning number is real.
const OTHERS = [0.021, 0.017, 0.012, 0.009, 0.008, 0.006, 0.005, 0.004, 0.002, 0.002]

export function StoryOverlay() {
  const root = useRef<HTMLDivElement>(null)

  useEffect(() => {
    let raf = 0
    const el = root.current!
    const hero = el.querySelector<HTMLElement>('[data-hero]')!
    const chapters = [...el.querySelectorAll<HTMLElement>('[data-ch]')]
    const finder = el.querySelector<HTMLElement>('[data-finder]')!
    const focusBox = el.querySelector<HTMLElement>('[data-focus]')!
    const flash = el.querySelector<HTMLElement>('[data-flash]')!
    const pred = el.querySelector<HTMLElement>('[data-pred]')!
    const bars = [...el.querySelectorAll<HTMLElement>('[data-bar]')]
    const pct = el.querySelector<HTMLElement>('[data-pct]')!
    const hud = el.querySelector<HTMLElement>('[data-hud]')!
    const hudFill = el.querySelector<HTMLElement>('[data-hud-fill]')!
    const hudLabel = el.querySelector<HTMLElement>('[data-hud-label]')!
    const hint = el.querySelector<HTMLElement>('[data-hint]')!

    const loop = () => {
      const p = story.progress
      const h = 1 - seg(p, 0.035, 0.085)
      hero.style.opacity = String(h)
      hero.style.transform = `translate3d(0, ${-(1 - h) * 60}px, 0)`
      hero.style.visibility = h <= 0.001 ? 'hidden' : 'visible'
      hint.style.opacity = String(1 - seg(p, 0.005, 0.03))

      chapters.forEach((c, i) => {
        const ch = CHAPTERS[i]
        const o = windowOpacity(p, ch.a, ch.b, 0.018)
        c.style.opacity = String(o)
        c.style.transform = `translate3d(0, ${(1 - o) * 24 * (p < (ch.a + ch.b) / 2 ? 1 : -1)}px, 0)`
        c.style.visibility = o <= 0.001 ? 'hidden' : 'visible'
      })

      const f = windowOpacity(p, T.focus, T.shutter + 0.002, 0.012)
      finder.style.opacity = String(f)
      finder.style.visibility = f <= 0.001 ? 'hidden' : 'visible'
      const focusT = smooth(seg(p, T.focus, T.shutter - 0.012))
      focusBox.style.transform = `translate(-50%, -50%) scale(${1.6 - focusT * 0.6})`
      focusBox.dataset.locked = focusT > 0.98 ? 'true' : 'false'

      const flashT = Math.max(0, 1 - Math.abs(p - T.shutter) / 0.012)
      flash.style.opacity = String(Math.pow(flashT, 1.6))

      const po = windowOpacity(p, T.layersEnd + 0.012, 1.01, 0.02)
      pred.style.opacity = String(po)
      pred.style.visibility = po <= 0.001 ? 'hidden' : 'visible'
      const grow = smooth(seg(p, T.layersEnd + 0.02, T.layersEnd + 0.09))
      bars.forEach((b, i) => {
        const v = i === 0 ? 0.914 : OTHERS[i - 1]
        b.style.transform = `scaleX(${Math.max(0.004, v * grow)})`
      })
      pct.textContent = `${(91.4 * grow).toFixed(1)}%`

      const ho = 1 - seg(p, 0.95, 0.99)
      hud.style.opacity = String(Math.min(ho, seg(p, 0.02, 0.06)))
      hudFill.style.transform = `scaleY(${p})`
      let label: (typeof STEPS)[number] = STEPS[0]
      for (const s of STEPS) if (p >= s[2]) label = s
      if (hudLabel.dataset.v !== label[0]) {
        hudLabel.dataset.v = label[0]
        hudLabel.innerHTML = `<b>${label[0]}</b> ${label[1]}`
      }
      raf = requestAnimationFrame(loop)
    }
    raf = requestAnimationFrame(loop)
    return () => cancelAnimationFrame(raf)
  }, [])

  const ranked = [PLANTS.find((p) => p.id === 'Sida_Rhombifolia')!, ...PLANTS.filter((p) => p.id !== 'Sida_Rhombifolia')]

  return (
    <div className="story-pin" ref={root}>
      <section className="hero" data-hero>
        <p className="kicker">MediLeafNET · a thesis project from East West University, Dhaka</p>
        <h1 className="hero-title">
          Most of us walk past <em>medicine</em> every day.
        </h1>
        <p className="hero-body">
          Bala, Basak, Neem, Dhutura. They grow by the roadside and in the botanical garden, and most people can't tell
          them apart. Some heal. Some can kill you. We trained a model to tell them apart from a photo of a single leaf.
        </p>
      </section>

      <div className="scroll-hint" data-hint>
        <span>Scroll. It's a short walk.</span>
        <i aria-hidden="true" />
      </div>

      {CHAPTERS.map((c, i) => (
        <section key={i} data-ch className={`chapter chapter--${c.side}`}>
          {c.kicker && <p className="kicker">{c.kicker}</p>}
          <h2 className="chapter-title">{c.title}</h2>
          {c.body && <p className="chapter-body">{c.body}</p>}
          {c.note && <p className="chapter-note">{c.note}</p>}
        </section>
      ))}

      <div className="finder" data-finder aria-hidden="true">
        <div className="finder-thirds" />
        <span className="finder-corner tl" />
        <span className="finder-corner tr" />
        <span className="finder-corner bl" />
        <span className="finder-corner br" />
        <div className="finder-focus" data-focus />
        <div className="finder-top">
          <span>Boldha Garden · Wari, Dhaka</span>
          <span>1× · ƒ1.78</span>
        </div>
        <div className="finder-bottom">
          <span className="finder-mode">PHOTO</span>
          <span className="finder-shutter" />
        </div>
      </div>
      <div className="flash" data-flash aria-hidden="true" />

      <section className="pred" data-pred>
        <p className="kicker">what the class token says</p>
        <h2 className="pred-title">
          <em>Sida rhombifolia.</em> Bala.
        </h2>
        <div className="pred-big">
          <span data-pct>0.0%</span>
          <small>for this exact photo, the number our app logged</small>
        </div>
        <ol className="pred-bars" aria-label="Class probabilities">
          {ranked.map((p, i) => (
            <li key={p.id} className={i === 0 ? 'win' : ''}>
              <span className="pred-name">{p.sci}</span>
              <span className="pred-track">
                <span className="pred-fill" data-bar />
                {i === 0 && <span className="pred-threshold" title="0.70 threshold" />}
              </span>
            </li>
          ))}
        </ol>
        <p className="pred-body">
          Below 70%, MediLeafNET won't name a plant at all. With something like Akondo, which is toxic to the heart, a
          confident wrong answer is worse than no answer.
        </p>
        <p className="chapter-note">Only the top number is real. The other ten bars just share the remaining 8.6%.</p>
      </section>

      <div className="hud" data-hud aria-hidden="true">
        <span data-hud-label />
        <span className="hud-track">
          <span className="hud-fill" data-hud-fill />
        </span>
      </div>
    </div>
  )
}
