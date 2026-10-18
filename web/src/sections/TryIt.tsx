import { useEffect, useRef, useState } from 'react'
import { plantById, type Plant } from '../../shared/plants'
import { displayName, type AskResult } from '../../shared/rag'
import { Answer, Icon, PlantSelect } from '../components/ui'
import { ask, health } from '../lib/ask'
import { classify, modelAvailable, SAMPLE, THRESHOLD, type Prediction } from '../lib/classifier'
import { useReveal } from '../lib/useReveal'

type Status = 'idle' | 'loading' | 'done' | 'error'
interface Turn {
  q: string
  a?: AskResult
  error?: string
}

const QUESTIONS: Record<Plant['risk'], string[]> = {
  danger: ['What are the side effects?', 'What active compounds does it have?', 'What was it traditionally used for?'],
  caution: ['What is it used for?', 'What are the side effects?', 'Is there clinical evidence?'],
  low: ['What is it used for?', 'What are the side effects?', 'What active compounds does it have?'],
}

const RISK_LABEL: Record<Plant['risk'], string> = { danger: 'Poisonous', caution: 'Use with care', low: 'Mostly safe' }

function loadImage(src: string) {
  return new Promise<HTMLImageElement>((res, rej) => {
    const img = new Image()
    img.onload = () => res(img)
    img.onerror = () => rej(new Error('Could not read that image.'))
    img.src = src
  })
}

const short = displayName

function AttentionOverlay({ attention }: { attention: Float32Array }) {
  const ref = useRef<HTMLCanvasElement>(null)
  useEffect(() => {
    const ctx = ref.current!.getContext('2d')!
    const img = ctx.createImageData(14, 14)
    attention.forEach((v, i) => {
      img.data[i * 4] = 240
      img.data[i * 4 + 1] = Math.round(150 + 60 * v)
      img.data[i * 4 + 2] = 20
      img.data[i * 4 + 3] = Math.round(Math.pow(v, 1.4) * 190)
    })
    ctx.putImageData(img, 0, 0)
  }, [attention])
  return <canvas ref={ref} width={14} height={14} className="attn" aria-hidden="true" />
}

export function TryIt() {
  const ref = useReveal<HTMLElement>()
  const [hasModel, setHasModel] = useState<boolean | null>(null)
  const [image, setImage] = useState<string | null>(null)
  const [status, setStatus] = useState<Status>('idle')
  const [error, setError] = useState('')
  const [pred, setPred] = useState<Prediction | null>(null)
  const [showAttn, setShowAttn] = useState(true)
  const [manual, setManual] = useState('')
  const [turns, setTurns] = useState<Turn[]>([])
  const [q, setQ] = useState('')
  const [asking, setAsking] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)
  const objectUrl = useRef<string | null>(null)
  const logRef = useRef<HTMLDivElement>(null)

  const [live, setLive] = useState<boolean | null>(null)

  useEffect(() => {
    health().then((h) => setLive(h?.answers === 'live'))
    modelAvailable().then(setHasModel)
    return () => {
      if (objectUrl.current) URL.revokeObjectURL(objectUrl.current)
    }
  }, [])

  useEffect(() => {
    logRef.current?.scrollTo({ top: logRef.current.scrollHeight, behavior: 'smooth' })
  }, [turns])

  const confident = !!pred && pred.confidence >= THRESHOLD
  const predPlant = pred ? plantById(pred.label) : undefined
  const plant: Plant | undefined = confident ? predPlant : manual ? plantById(manual) : undefined

  async function run(src: string, isSample: boolean) {
    setImage(src)
    setPred(null)
    setTurns([])
    setError('')
    setStatus('loading')
    try {
      const started = performance.now()
      let result: Prediction
      if (hasModel) {
        result = await classify(await loadImage(src))
      } else if (isSample) {
        result = SAMPLE.prediction
      } else {
        throw new Error("The model file isn't on this deployment yet, so only our Bala photo works. You can still pick a plant on the right and ask about it.")
      }
      // let the scan line finish a pass; it reads better than an instant jump
      const wait = 1100 - (performance.now() - started)
      if (wait > 0) await new Promise((r) => setTimeout(r, wait))
      setPred(result)
      setStatus('done')
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Something went wrong.')
      setStatus('error')
    }
  }

  function onFile(f: File | undefined) {
    if (!f) return
    if (!f.type.startsWith('image/')) return setError('That file is not an image.')
    if (f.size > 12 * 1024 * 1024) return setError('That photo is over 12 MB. Try a smaller one.')
    if (objectUrl.current) URL.revokeObjectURL(objectUrl.current)
    objectUrl.current = URL.createObjectURL(f)
    run(objectUrl.current, false)
  }

  async function submit(question: string) {
    const text = question.trim()
    if (!plant || !text || asking) return
    setQ('')
    setAsking(true)
    setTurns((t) => [...t, { q: text }])
    try {
      const history = turns.filter((t) => t.a && !t.a.refused).map((t) => ({ q: t.q, a: [t.a!.answer, t.a!.general].filter(Boolean).join(' ') }))
      const a = await ask(plant, text, history)
      setTurns((t) => t.map((x, i) => (i === t.length - 1 ? { ...x, a } : x)))
    } catch (e) {
      setTurns((t) => t.map((x, i) => (i === t.length - 1 ? { ...x, error: e instanceof Error ? e.message : 'Failed' } : x)))
    } finally {
      setAsking(false)
    }
  }

  const top = pred?.top[0]

  return (
    <section className="section tryit" id="try" ref={ref} aria-labelledby="try-title">
      <div className="wrap">
        <div className="section-head">
          <p className="kicker" data-reveal>
            Try it
          </p>
          <h2 id="try-title" className="section-title" data-reveal>
            Point it at a leaf. Then ask what you're holding.
          </h2>
          <p className="lede narrow" data-reveal>
            The phone on the left looks at the photo. The one on the right tells you what it found and answers questions,
            with sources. The photo never leaves your device; only the plant name and your question go to the server.
          </p>
        </div>

        <div className="phones" data-reveal>
          {/* ------------------------------------------------ phone 1: scan */}
          <figure className="phone-wrap">
            <div className="phone">
              <span className="island" aria-hidden="true" />
              <div className="screen">
                <div className="app-top">
                  <span className="app-brand">
                    <Icon name="leaf" /> MediLeafNET
                  </span>
                  <span className="app-pill">11 species</span>
                </div>
                <h3 className="app-title">Scan a leaf</h3>

                <div
                  className={`viewfinder ${status === 'loading' ? 'is-scanning' : ''}`}
                  onDragOver={(e) => e.preventDefault()}
                  onDrop={(e) => {
                    e.preventDefault()
                    onFile(e.dataTransfer.files?.[0])
                  }}
                >
                  {image ? (
                    <>
                      <img src={image} alt="The leaf you chose" />
                      {pred?.attention && showAttn && <AttentionOverlay attention={pred.attention} />}
                    </>
                  ) : (
                    <div className="vf-empty">
                      <svg viewBox="0 0 120 120" aria-hidden="true">
                        <path d="M30 96C30 54 56 28 96 24c-2 44-28 70-64 70" />
                        <path d="M30 96 74 50" />
                        <path d="M52 74 46 62M62 64 58 50M72 54l-2-10M60 76l14-2M70 66l12-2" />
                      </svg>
                      <span>Drop a photo here</span>
                    </div>
                  )}
                  <span className="vf-corner tl" />
                  <span className="vf-corner tr" />
                  <span className="vf-corner bl" />
                  <span className="vf-corner br" />
                  <span className="vf-scan" aria-hidden="true" />
                  {status === 'done' && top && (
                    <span className={`vf-tag ${confident ? '' : 'vf-tag--unsure'}`}>
                      {confident && predPlant ? `${predPlant.sci} · ${(top.p * 100).toFixed(1)}%` : 'Not sure'}
                    </span>
                  )}
                </div>

                {pred?.attention ? (
                  <label className="switch" htmlFor="attn-toggle">
                    <input id="attn-toggle" type="checkbox" checked={showAttn} onChange={(e) => setShowAttn(e.target.checked)} />
                    <span className="switch-ui" aria-hidden="true" />
                    Show where the model looked
                  </label>
                ) : (
                  <p className="app-hint">One leaf · plain background · daylight</p>
                )}

                <div className="app-actions">
                  <button type="button" className="go" onClick={() => fileRef.current?.click()}>
                    <span className="go-dot">
                      <Icon name="camera" />
                    </span>
                    Take or choose a photo
                  </button>
                  <button type="button" className="ghost" onClick={() => run(SAMPLE.src, true)}>
                    Try our Bala photo
                  </button>
                </div>
                <input id="leaf-file" ref={fileRef} type="file" accept="image/*" hidden onChange={(e) => onFile(e.target.files?.[0])} />
                {hasModel === false && <p className="app-note">This deployment has no model file yet. The Bala photo shows the result we logged for it.</p>}
                {error && status !== 'loading' && <p className="app-error">{error}</p>}
              </div>
            </div>
            <figcaption>
              <b>1</b> The ViT looks at 196 patches of your photo, in your browser.
            </figcaption>
          </figure>

          <div className="phones-link" aria-hidden="true">
            <span />
            <Icon name="arrow" />
          </div>

          {/* ------------------------------------------------ phone 2: result + ask */}
          <figure className="phone-wrap">
            <div className="phone">
              <span className="island" aria-hidden="true" />
              <div className="screen screen--result">
                <div className="app-top">
                  <span className="app-brand">
                    <Icon name="leaf" /> Result
                  </span>
                  {plant && <span className={`app-pill risk-pill risk-pill--${plant.risk}`}>{RISK_LABEL[plant.risk]}</span>}
                </div>

                <div className="result-scroll" ref={logRef} data-lenis-prevent>
                  {status === 'loading' && (
                    <div className="skeleton" aria-label="Looking at the photo">
                      <span />
                      <span />
                      <span />
                    </div>
                  )}

                  {status !== 'loading' && !pred && !manual && (
                    <div className="result-empty">
                      <div className="leaf-ring" aria-hidden="true">
                        <Icon name="leaf" />
                      </div>
                      <p>Your result shows up here.</p>
                      <small>No photo handy? Pick a plant and ask about it.</small>
                      <PlantSelect value={manual} onChange={setManual} />
                    </div>
                  )}

                  {status === 'done' && pred && top && !confident && (
                    <div className="card card--unsure">
                      <h4>I can't name this one.</h4>
                      <p>
                        The best match is {(top.p * 100).toFixed(0)}%, under the {Math.round(THRESHOLD * 100)}% I need. It might be
                        blurry, more than one leaf, or a plant outside the 11 I know.
                      </p>
                      <PlantSelect value={manual} onChange={setManual} />
                    </div>
                  )}

                  {plant && (
                    <>
                      <div className="plant-head">
                        {confident && image && <img className="plant-thumb" src={image} alt="" />}
                        <div>
                          <h4 className="plant-name">{plant.sci}</h4>
                          <p className="plant-local">{plant.local}</p>
                        </div>
                      </div>

                      <div className="tiles">
                        <div className="tile">
                          <Icon name="spark" />
                          <b>{confident && top ? `${(top.p * 100).toFixed(1)}%` : '—'}</b>
                          <span>confidence</span>
                        </div>
                        <div className={`tile tile--${plant.risk}`}>
                          <Icon name="shield" />
                          <b>{RISK_LABEL[plant.risk]}</b>
                          <span>safety</span>
                        </div>
                        <div className="tile">
                          <Icon name="chip" />
                          <b>{pred?.source === 'model' ? `${pred.ms} ms` : confident ? 'logged' : 'manual'}</b>
                          <span>{pred?.source === 'model' ? 'on device' : 'result'}</span>
                        </div>
                      </div>

                      {confident && top && (
                        <div className="meter" role="img" aria-label={`Confidence ${(top.p * 100).toFixed(1)} percent, threshold 70 percent`}>
                          <span className="meter-fill" style={{ width: `${top.p * 100}%` }} />
                          <span className="meter-mark" style={{ left: `${THRESHOLD * 100}%` }} />
                        </div>
                      )}

                      <div className={`card card--${plant.risk}`}>
                        <h4>{plant.risk === 'danger' ? 'Do not use this plant' : 'Before you use it'}</h4>
                        <p>{plant.sideEffects}</p>
                      </div>

                      <div className="chat" aria-live="polite">
                        {turns.length === 0 && (
                          <p className="chat-hint">
                            Ask anything about {short(plant)}.{' '}
                            {live === false ? 'Live answers are off on this copy, so you will see matching passages only.' : 'Cited answers first; general knowledge is labelled.'}
                          </p>
                        )}
                        {turns.map((t, i) => (
                          <div key={i} className="turn">
                            <p className="bubble-q">{t.q}</p>
                            {!t.a && !t.error && <p className="bubble-a bubble-a--wait">Reading the sources…</p>}
                            {t.error && <p className="app-error">{t.error}</p>}
                            {t.a && <Answer a={t.a} />}
                          </div>
                        ))}
                      </div>
                    </>
                  )}
                </div>

                {plant && (
                  <div className="composer">
                    <div className="chips">
                      {QUESTIONS[plant.risk].map((s) => (
                        <button key={s} type="button" className="chip" onClick={() => submit(s)} disabled={asking}>
                          {s}
                        </button>
                      ))}
                    </div>
                    <form
                      className="ask"
                      onSubmit={(e) => {
                        e.preventDefault()
                        submit(q)
                      }}
                    >
                      <label htmlFor="ask-input" className="sr-only">
                        Your question about {plant.sci}
                      </label>
                      <input id="ask-input" value={q} maxLength={300} onChange={(e) => setQ(e.target.value)} placeholder={`Ask about ${short(plant)}…`} />
                      <button type="submit" className="send" disabled={asking || !q.trim()} aria-label="Ask">
                        <Icon name="send" />
                      </button>
                    </form>
                  </div>
                )}
              </div>
            </div>
            <figcaption>
              <b>2</b> It names the plant, warns you, and answers with sources you can check.
            </figcaption>
          </figure>
        </div>

        <div className="center" data-reveal>
          <a className="btn btn--solid" href={`${import.meta.env.BASE_URL}playground`}>
            Open the full playground <Icon name="arrow" />
          </a>
        </div>

        <p className="disclaimer" data-reveal>
          A research demo, not medical advice. Several of these plants are poisonous. Don't eat or apply anything because a
          website told you what it was.
        </p>
      </div>
    </section>
  )
}
