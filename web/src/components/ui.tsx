import { PLANTS } from '../../shared/plants'
import type { AskResult } from '../../shared/rag'

export type IconName = 'leaf' | 'arrow' | 'camera' | 'shield' | 'chip' | 'spark' | 'send' | 'book' | 'info'

const ICONS: Record<IconName, React.ReactNode> = {
  leaf: (
    <>
      <path d="M5 19c0-8 5-13 14-14 0 9-5 14-13 14" />
      <path d="M5 19 13 11" />
    </>
  ),
  arrow: <path d="M5 12h14M13 6l6 6-6 6" />,
  camera: (
    <>
      <path d="M4 8h3l2-3h6l2 3h3v11H4z" />
      <circle cx="12" cy="13" r="3.5" />
    </>
  ),
  shield: <path d="M12 3l8 3v6c0 4.5-3.4 8.2-8 9-4.6-.8-8-4.5-8-9V6z" />,
  chip: (
    <>
      <rect x="6" y="6" width="12" height="12" rx="2" />
      <path d="M9 2v4M15 2v4M9 18v4M15 18v4M2 9h4M2 15h4M18 9h4M18 15h4" />
    </>
  ),
  spark: <path d="M13 2 4 14h7l-1 8 9-12h-7z" />,
  send: <path d="M4 12h14M12 5l7 7-7 7" />,
  book: (
    <>
      <path d="M4 5a2 2 0 0 1 2-2h13v16H6a2 2 0 0 0-2 2z" />
      <path d="M4 19V5" />
    </>
  ),
  info: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 11v5M12 8h.01" />
    </>
  ),
}

export function Icon({ name, size = 20 }: { name: IconName; size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {ICONS[name]}
    </svg>
  )
}

export function PlantSelect({ value, onChange, id = 'plant-select' }: { value: string; onChange: (v: string) => void; id?: string }) {
  return (
    <label className="select" htmlFor={id}>
      <span className="sr-only">Plant</span>
      <select id={id} value={value} onChange={(e) => onChange(e.target.value)}>
        <option value="">Choose a plant…</option>
        {PLANTS.map((p) => (
          <option key={p.id} value={p.id}>
            {p.sci} · {p.local}
          </option>
        ))}
      </select>
    </label>
  )
}

function withCites(text: string, a: AskResult) {
  return text.split(/(\[\d+\])/g).map((part, i) => {
    const m = part.match(/^\[(\d+)\]$/)
    if (!m) return <span key={i}>{part}</span>
    const c = a.citations.find((x) => x.n === Number(m[1]))
    return (
      <a key={i} className="cite" href={c?.url} target="_blank" rel="noreferrer" title={c?.title}>
        {m[1]}
      </a>
    )
  })
}

export function Answer({ a, showPassages = false }: { a: AskResult; showPassages?: boolean }) {
  return (
    <div className={`bubble-a ${a.refused ? 'bubble-a--refused' : ''}`}>
      {a.answer && <p>{withCites(a.answer, a)}</p>}
      {a.general && (
        <div className="general">
          <span className="general-tag">
            <Icon name="info" size={14} /> General knowledge, not from our sources
          </span>
          <p>{a.general}</p>
        </div>
      )}
      {a.citations.length > 0 && !a.refused && (
        <ol className="sources">
          {a.citations.map((c) => (
            <li key={c.n}>
              <a href={c.url} target="_blank" rel="noreferrer">
                {c.title}
              </a>
              {showPassages && <q>{c.text}</q>}
            </li>
          ))}
        </ol>
      )}
      <p className="bubble-meta">
        {a.refused
          ? a.reason === 'rate_limited'
            ? 'Slow down a little.'
            : 'No answer, on purpose.'
          : a.mode === 'live'
            ? [a.model, a.ms ? `${(a.ms / 1000).toFixed(1)} s` : null, a.coverage === 'sources' ? 'all from sources' : a.coverage === 'partial' ? 'sources + general' : 'general only'].filter(Boolean).join(' · ')
            : 'Offline · matching passages, word for word'}
      </p>
    </div>
  )
}
