import { useEffect, useMemo, useRef, useState } from 'react'
import { PLANTS, plantById, type Plant } from '../../shared/plants'
import { displayName, type AskResult } from '../../shared/rag'
import { Answer, Icon, PlantSelect } from '../components/ui'
import { ask, health, type Health } from '../lib/ask'
import { classify, modelAvailable, SAMPLE, THRESHOLD, type Prediction } from '../lib/classifier'

const BASE = import.meta.env.BASE_URL

interface Turn {
  q: string
  a?: AskResult
  error?: string
}

interface BatchRow {
  name: string
  url: string
  pred?: Prediction
  expected?: string
  error?: string
}

const SUGGESTIONS = [
  'What is it used for?',
  'Is it safe for children?',
  'What makes it toxic?',
  'How do I tell it apart from similar plants?',
  'Which part of the plant is used?',
  'Can I use it during pregnancy?',
  'How much should I take?',
]

function loadImage(src: string) {
  return new Promise<HTMLImageElement>((res, rej) => {
    const img = new Image()
    img.onload = () => res(img)
    img.onerror = () => rej(new Error('Could not read that image.'))
    img.src = src
  })
}

// "aug_Sida_Rhombifolia_21.jpg" -> "Sida_Rhombifolia", so batches can be scored.
function labelFromName(name: string): string | undefined {
  const n = name.toLowerCase().replace(/[\s-]+/g, '_')
  return PLANTS.find((p) => n.includes(p.id.toLowerCase()))?.id
}

function Attention({ attention }: { attention: Float32Array }) {
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

function Status({ h, model }: { h: Health | null | undefined; model: boolean | null }) {
  const pill = (ok: boolean | null, on: string, off: string, wait: string) => (
    <span className={`status ${ok === null ? '' : ok ? 'status--on' : 'status--off'}`}>
      <i aria-hidden="true" />
      {ok === null ? wait : ok ? on : off}
    </span>
  )
  return (
    <div className="statuses" aria-label="What this deployment has switched on">
      {pill(model, 'Model loaded in browser', 'Model file missing', 'Checking model…')}
      {pill(h === undefined ? null : h?.answers === 'live', `Live answers · ${h?.model ?? ''}`, 'Answers offline (no LLM key)', 'Checking answers…')}
      {h?.answers === 'live' && pill(h.vectorSearch, 'Vector search on', 'Vector search off (BM25 only)', '')}
      {h && <span className="status">{h.passages.total} passages</span>}
    </div>
  )
}

export default function Playground() {
  const [h, setH] = useState<Health | null | undefined>(undefined)
  const [hasModel, setHasModel] = useState<boolean | null>(null)

  // single image
  const [image, setImage] = useState<string | null>(null)
  const [pred, setPred] = useState<Prediction | null>(null)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const [showAttn, setShowAttn] = useState(true)
  const fileRef = useRef<HTMLInputElement>(null)

  // batch
  const [rows, setRows] = useState<BatchRow[]>([])
  const [batchBusy, setBatchBusy] = useState(false)
  const batchRef = useRef<HTMLInputElement>(null)

  // chat
  const [plantId, setPlantId] = useState('Sida_Rhombifolia')
  const [turns, setTurns] = useState<Turn[]>([])
  const [q, setQ] = useState('')
  const [asking, setAsking] = useState(false)
  const logRef = useRef<HTMLDivElement>(null)
  const plant = plantById(plantId) as Plant | undefined

  useEffect(() => {
    health().then(setH)
    modelAvailable().then(setHasModel)
  }, [])
  useEffect(() => {
    logRef.current?.scrollTo({ top: logRef.current.scrollHeight, behavior: 'smooth' })
  }, [turns])

  async function identify(src: string, sample = false) {
    setImage(src)
    setPred(null)
    setErr('')
    setBusy(true)
    try {
      if (hasModel) setPred(await classify(await loadImage(src)))
      else if (sample) setPred(SAMPLE.prediction)
      else throw new Error("This deployment doesn't have the model file, so only the sample photo works.")
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Something went wrong.')
    } finally {
      setBusy(false)
    }
  }

  async function runBatch(files: FileList | null) {
    if (!files?.length || !hasModel) return
    const list = [...files].filter((f) => f.type.startsWith('image/')).slice(0, 60)
    const initial: BatchRow[] = list.map((f) => ({ name: f.name, url: URL.createObjectURL(f), expected: labelFromName(f.name) }))
    rows.forEach((r) => URL.revokeObjectURL(r.url))
    setRows(initial)
    setBatchBusy(true)
    for (let i = 0; i < initial.length; i++) {
      try {
        const p = await classify(await loadImage(initial[i].url))
        setRows((rs) => rs.map((r, k) => (k === i ? { ...r, pred: p } : r)))
      } catch (e) {
        setRows((rs) => rs.map((r, k) => (k === i ? { ...r, error: e instanceof Error ? e.message : 'failed' } : r)))
      }
    }
    setBatchBusy(false)
  }

  const summary = useMemo(() => {
    const done = rows.filter((r) => r.pred)
    if (!done.length) return null
    const named = done.filter((r) => r.pred!.confidence >= THRESHOLD)
    const labelled = done.filter((r) => r.expected)
    const correct = labelled.filter((r) => r.pred!.label === r.expected)
    const correctNamed = labelled.filter((r) => r.pred!.label === r.expected && r.pred!.confidence >= THRESHOLD)
    return {
      done: done.length,
      ms: Math.round(done.reduce((s, r) => s + r.pred!.ms, 0) / done.length),
      named: named.length,
      labelled: labelled.length,
      acc: labelled.length ? correct.length / labelled.length : null,
      accNamed: labelled.length ? correctNamed.length / labelled.length : null,
    }
  }, [rows])

  async function submit(text: string) {
    const question = text.trim()
    if (!plant || !question || asking) return
    setQ('')
    setAsking(true)
    setTurns((t) => [...t, { q: question }])
    try {
      const history = turns.filter((t) => t.a && !t.a.refused).map((t) => ({ q: t.q, a: [t.a!.answer, t.a!.general].filter(Boolean).join(' ') }))
      const a = await ask(plant, question, history)
      setTurns((t) => t.map((x, i) => (i === t.length - 1 ? { ...x, a } : x)))
    } catch (e) {
      setTurns((t) => t.map((x, i) => (i === t.length - 1 ? { ...x, error: e instanceof Error ? e.message : 'Failed' } : x)))
    } finally {
      setAsking(false)
    }
  }

  const predPlant = pred ? plantById(pred.label) : undefined
  const confident = !!pred && pred.confidence >= THRESHOLD

  return (
    <div className="pg">
      <header className="pg-top">
        <a className="nav-brand" href={BASE}>
          <Icon name="leaf" size={22} /> MediLeafNET
        </a>
        <span className="pg-crumb">Playground</span>
        <a className="btn pg-back" href={BASE}>
          Back to the story
        </a>
      </header>

      <main className="pg-main">
        <section className="pg-intro">
          <h1>Test everything.</h1>
          <p>
            Run the leaf classifier on your own photos, one at a time or in a batch, and question the assistant about any
            of the 11 species. Nothing here is staged: these are the same model and API the main page uses.
          </p>
          <Status h={h} model={hasModel} />
        </section>

        <div className="pg-grid">
          {/* ------------------------------------------------ identify */}
          <section className="pg-card" aria-labelledby="pg-id">
            <div className="pg-card-head">
              <h2 id="pg-id">Identify a leaf</h2>
              <span className="muted">ViT · 224×224 · 196 patches</span>
            </div>
            <div
              className={`viewfinder pg-vf ${busy ? 'is-scanning' : ''}`}
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => {
                e.preventDefault()
                const f = e.dataTransfer.files?.[0]
                if (f) identify(URL.createObjectURL(f))
              }}
            >
              {image ? (
                <>
                  <img src={image} alt="Leaf being identified" />
                  {pred?.attention && showAttn && <Attention attention={pred.attention} />}
                </>
              ) : (
                <div className="vf-empty">
                  <Icon name="leaf" size={64} />
                  <span>Drop a leaf photo here</span>
                </div>
              )}
              <span className="vf-corner tl" />
              <span className="vf-corner tr" />
              <span className="vf-corner bl" />
              <span className="vf-corner br" />
              <span className="vf-scan" aria-hidden="true" />
            </div>
            <div className="row">
              <button type="button" className="btn btn--solid" onClick={() => fileRef.current?.click()}>
                <Icon name="camera" /> Choose a photo
              </button>
              <button type="button" className="btn" onClick={() => identify(SAMPLE.src, true)}>
                Use the Bala sample
              </button>
              {pred?.attention && (
                <label className="switch" htmlFor="pg-attn">
                  <input id="pg-attn" type="checkbox" checked={showAttn} onChange={(e) => setShowAttn(e.target.checked)} />
                  <span className="switch-ui" aria-hidden="true" />
                  Attention map
                </label>
              )}
              <input
                id="pg-file"
                ref={fileRef}
                type="file"
                accept="image/*"
                hidden
                onChange={(e) => {
                  const f = e.target.files?.[0]
                  if (f) identify(URL.createObjectURL(f))
                }}
              />
            </div>
            {err && <p className="app-error">{err}</p>}

            {pred && (
              <div className="pg-result">
                <div className="pg-verdict">
                  {confident && predPlant ? (
                    <>
                      <span className="kicker">Identified</span>
                      <h3 className="plant-name">{predPlant.sci}</h3>
                      <p className="plant-local">{predPlant.local}</p>
                    </>
                  ) : (
                    <>
                      <span className="kicker">Not sure</span>
                      <h3 className="pg-unsure">No plant named</h3>
                      <p className="plant-local">Top match is under {Math.round(THRESHOLD * 100)}%, so the app stays quiet.</p>
                    </>
                  )}
                </div>
                <ol className="topk" aria-label="Top predictions">
                  {pred.top.map((t, i) => (
                    <li key={t.label} className={i === 0 ? 'win' : ''}>
                      <span className="topk-name">{plantById(t.label)?.sci ?? t.label}</span>
                      <span className="topk-track">
                        <span className="topk-fill" style={{ width: `${Math.max(1, t.p * 100)}%` }} />
                        {i === 0 && <span className="topk-mark" style={{ left: `${THRESHOLD * 100}%` }} />}
                      </span>
                      <span className="topk-p">{(t.p * 100).toFixed(1)}%</span>
                    </li>
                  ))}
                </ol>
                <p className="tiny">
                  {pred.source === 'model' ? `Ran in your browser in ${pred.ms} ms · ONNX Runtime Web (WASM, int8)` : 'Logged result for the sample photo (model file not deployed).'}
                </p>
                {confident && predPlant && (
                  <button type="button" className="btn" onClick={() => setPlantId(predPlant.id)}>
                    Ask about {displayName(predPlant)} <Icon name="arrow" />
                  </button>
                )}
              </div>
            )}
          </section>

          {/* ------------------------------------------------ ask */}
          <section className="pg-card pg-chat" aria-labelledby="pg-ask">
            <div className="pg-card-head">
              <h2 id="pg-ask">Ask about a plant</h2>
              {turns.length > 0 && (
                <button type="button" className="chip" onClick={() => setTurns([])}>
                  Clear chat
                </button>
              )}
            </div>
            <PlantSelect
              id="pg-plant"
              value={plantId}
              onChange={(v) => {
                setPlantId(v)
                setTurns([])
              }}
            />
            {plant && (
              <div className={`card card--${plant.risk} pg-risk`}>
                <h4>{plant.risk === 'danger' ? 'Poisonous' : plant.risk === 'caution' ? 'Use with care' : 'Mostly safe'}</h4>
                <p>{plant.sideEffects}</p>
              </div>
            )}
            <div className="pg-log" ref={logRef} data-lenis-prevent>
              {turns.length === 0 && (
                <p className="chat-hint">
                  Follow-up questions work: the assistant remembers the last few turns. Answers cite passages from the plant
                  sheets{h && h.passages.total > h.passages.plantSheets ? ' and Wikipedia' : ''}; anything beyond them is
                  labelled as general knowledge. Dose questions are always refused.
                </p>
              )}
              {turns.map((t, i) => (
                <div key={i} className="turn">
                  <p className="bubble-q">{t.q}</p>
                  {!t.a && !t.error && <p className="bubble-a bubble-a--wait">Reading the sources…</p>}
                  {t.error && <p className="app-error">{t.error}</p>}
                  {t.a && <Answer a={t.a} showPassages />}
                </div>
              ))}
            </div>
            <div className="chips pg-chips">
              {SUGGESTIONS.map((s) => (
                <button key={s} type="button" className="chip" disabled={asking || !plant} onClick={() => submit(s)}>
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
              <label htmlFor="pg-q" className="sr-only">
                Question
              </label>
              <input id="pg-q" value={q} maxLength={300} onChange={(e) => setQ(e.target.value)} placeholder={plant ? `Ask anything about ${displayName(plant)}…` : 'Choose a plant first'} disabled={!plant} />
              <button type="submit" className="send" disabled={asking || !q.trim() || !plant} aria-label="Ask">
                <Icon name="send" />
              </button>
            </form>
          </section>
        </div>

        {/* ------------------------------------------------ batch */}
        <section className="pg-card pg-batch" aria-labelledby="pg-batch">
          <div className="pg-card-head">
            <h2 id="pg-batch">Batch test</h2>
            <span className="muted">Up to 60 photos. Name files with the species (e.g. Datura_Metel_04.jpg) to get accuracy.</span>
          </div>
          <div className="row">
            <button type="button" className="btn btn--solid" disabled={!hasModel || batchBusy} onClick={() => batchRef.current?.click()}>
              {batchBusy ? 'Running…' : 'Choose photos'}
            </button>
            {!hasModel && hasModel !== null && <span className="muted">Needs the model file on this deployment.</span>}
            <input id="pg-batch-files" ref={batchRef} type="file" accept="image/*" multiple hidden onChange={(e) => runBatch(e.target.files)} />
          </div>

          {summary && (
            <dl className="pg-summary">
              <div>
                <dt>{summary.done}</dt>
                <dd>photos run</dd>
              </div>
              <div>
                <dt>{summary.ms} ms</dt>
                <dd>average per photo</dd>
              </div>
              <div>
                <dt>{Math.round((summary.named / summary.done) * 100)}%</dt>
                <dd>confident enough to name</dd>
              </div>
              <div>
                <dt>{summary.acc === null ? '—' : `${Math.round(summary.acc * 100)}%`}</dt>
                <dd>{summary.acc === null ? 'no labels in file names' : `top-1 accuracy on ${summary.labelled} labelled`}</dd>
              </div>
            </dl>
          )}

          {rows.length > 0 && (
            <div className="pg-table-wrap">
              <table className="pg-table">
                <thead>
                  <tr>
                    <th scope="col">Photo</th>
                    <th scope="col">File</th>
                    <th scope="col">Prediction</th>
                    <th scope="col">Confidence</th>
                    <th scope="col">Expected</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => {
                    const ok = r.pred && r.expected ? r.pred.label === r.expected : null
                    return (
                      <tr key={r.url}>
                        <td>
                          <img src={r.url} alt="" />
                        </td>
                        <td className="pg-file">{r.name}</td>
                        <td>
                          {r.error ? <span className="app-error">{r.error}</span> : r.pred ? <i>{plantById(r.pred.label)?.sci}</i> : <span className="muted">…</span>}
                        </td>
                        <td className="num-cell">
                          {r.pred && (
                            <span className={r.pred.confidence >= THRESHOLD ? '' : 'low'}>{(r.pred.confidence * 100).toFixed(1)}%</span>
                          )}
                        </td>
                        <td>
                          {r.expected ? (
                            <span className={`mark ${ok === null ? '' : ok ? 'mark--ok' : 'mark--bad'}`}>{plantById(r.expected)?.sci}</span>
                          ) : (
                            <span className="muted">—</span>
                          )}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </main>

      <footer className="pg-foot">© {new Date().getFullYear()} Md Sifatullah Sheikh. All rights reserved.</footer>
    </div>
  )
}
