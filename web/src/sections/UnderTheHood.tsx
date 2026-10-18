import { useEffect, useState } from 'react'
import { useReveal } from '../lib/useReveal'

interface Score {
  questions: number
  unanswerable: number
  hitAt4: number
  refusalAccuracy: number
  wrongRefusals: number
  citationCoverage: number
  faithfulness?: number
}
interface EvalResults extends Score {
  mode: 'live' | 'offline'
  set: 'holdout'
  date: string
  model?: string
  tuning?: Score
}

const PIPE = [
  ['Photo', 'never leaves your device'],
  ['Vision Transformer', '6 layers · 384-d · ONNX int8, runs in the browser'],
  ['Name or abstain', 'refuses to name below 70% confidence'],
  ['Rewrite', 'gpt-oss-20b on Groq, uses the chat so far'],
  ['Hybrid search', 'BM25 + Upstash Vector, fused by rank'],
  ['Answer + check', 'gpt-oss-120b; uncited sentences removed'],
]

const STACK = [
  'PyTorch',
  'Vision Transformer (from scratch)',
  'ONNX Runtime Web',
  'Groq · gpt-oss-120b / 20b',
  'Upstash Vector',
  'BM25 + reciprocal rank fusion',
  'React Three Fiber',
  'GLSL shaders',
  'Vite',
  'Vercel Functions',
  'Docker',
  'GitHub Actions',
]

const pct = (v: number) => `${Math.round(v * 100)}%`

export function UnderTheHood() {
  const ref = useReveal<HTMLElement>()
  const [ev, setEv] = useState<EvalResults | null>(null)
  useEffect(() => {
    fetch(`${import.meta.env.BASE_URL}eval/results.json`)
      .then((r) => (r.ok && r.headers.get('content-type')?.includes('json') ? r.json() : null))
      .then(setEv)
      .catch(() => setEv(null))
  }, [])

  return (
    <section className="section how" id="how" ref={ref} aria-labelledby="how-title">
      <div className="wrap">
        <p className="kicker" data-reveal>
          How it works
        </p>
        <h2 id="how-title" className="section-title" data-reveal>
          Small enough to run on a phone. Careful enough to say "I don't know".
        </h2>

        <ol className="pipe" aria-label="Pipeline">
          {PIPE.map(([a, b], i) => (
            <li key={a} data-reveal={String(i)}>
              <b>{a}</b>
              <span>{b}</span>
            </li>
          ))}
        </ol>

        <dl className="numbers">
          <div className="num" data-reveal>
            <dt>96%+</dt>
            <dd>accuracy of the leaf classifier on our held-out test set (11 classes)</dd>
          </div>
          {ev?.mode === 'live' && (
            <>
              <div className="num" data-reveal>
                <dt>{pct(ev.hitAt4)}</dt>
                <dd>of answerable questions found the right passage in the top 4</dd>
              </div>
              <div className="num" data-reveal>
                <dt>{pct(ev.refusalAccuracy)}</dt>
                <dd>of the {ev.unanswerable} questions our sources can't answer were declined</dd>
              </div>
              <div className="num" data-reveal>
                <dt>{ev.faithfulness !== undefined ? pct(ev.faithfulness) : ev.wrongRefusals}</dt>
                <dd>{ev.faithfulness !== undefined ? 'of cited sentences judged supported by their source' : "answerable questions it refused when it shouldn't have"}</dd>
              </div>
            </>
          )}
          {ev?.mode === 'offline' && ev.tuning && (
            <>
              <div className="num" data-reveal>
                <dt>
                  {pct(ev.tuning.hitAt4)} <span className="arrow">→</span> {pct(ev.hitAt4)}
                </dt>
                <dd>keyword search: questions we tuned it on, then {ev.questions - ev.unanswerable} new ones worded differently</dd>
              </div>
              <div className="num" data-reveal>
                <dt>{pct(ev.refusalAccuracy)}</dt>
                <dd>of {ev.unanswerable} unanswerable held-out questions declined</dd>
              </div>
            </>
          )}
          {!ev && (
            <div className="num" data-reveal>
              <dt>—</dt>
              <dd>Answer evaluation hasn't been run on this deployment yet.</dd>
            </div>
          )}
        </dl>
        {ev?.mode === 'offline' && ev.tuning && (
          <p className="lede narrow" data-reveal>
            That drop is the most useful number on this page. The fallback keyword search looked perfect on the questions
            we wrote while building it, and fell apart the moment the wording changed: "side effects" works, "is it
            dangerous" doesn't. Same passages, different words. That's why the live version searches by meaning with
            embeddings, and why we only report numbers from questions we never tuned on.
          </p>
        )}
        {ev && (
          <p className="tiny mono" data-reveal>
            {ev.mode === 'offline'
              ? `Offline BM25 fallback · held-out set of ${ev.questions} questions · ${ev.date} · run scripts/eval.py against the live API to replace these.`
              : `Live pipeline${ev.model ? ` (${ev.model})` : ''} · held-out set of ${ev.questions} questions · ${ev.date}`}
          </p>
        )}

        <ul className="stack" aria-label="Tools used">
          {STACK.map((s) => (
            <li key={s} data-reveal>
              {s}
            </li>
          ))}
        </ul>
      </div>
    </section>
  )
}
