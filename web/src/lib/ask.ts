import { ALL_CHUNKS } from '../../shared/corpus.js'
import type { Plant } from '../../shared/plants.js'
import { bm25, contentQuery, isDosageQuestion, refusalText, type AskResult, type Citation, type Turn } from '../../shared/rag.js'

const API = `${import.meta.env?.BASE_URL ?? "/"}api`

export interface Health {
  answers: 'live' | 'offline'
  vectorSearch: boolean
  model: string | null
  rewriteModel: string | null
  passages: { plantSheets: number; total: number }
}

export async function health(): Promise<Health | null> {
  try {
    const r = await fetch(`${API}/health`)
    if (!r.ok || !r.headers.get('content-type')?.includes('json')) return null
    return (await r.json()) as Health
  } catch {
    return null
  }
}

// Ask the live API. If this deployment has no LLM key, or the API can't be
// reached, fall back to offline keyword search over the bundled passages.
export async function ask(plant: Plant, question: string, history: Turn[] = []): Promise<AskResult> {
  let r: Response
  try {
    r = await fetch(`${API}/ask`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ plant: plant.id, question, history }),
    })
  } catch {
    return askOffline(plant, question)
  }
  // Static hosts answer /api/* with the HTML page, so check it's really JSON.
  const isJson = r.headers.get('content-type')?.includes('application/json')
  if (!isJson) return askOffline(plant, question)
  const data = await r.json().catch(() => ({}))
  if (r.ok || (r.status === 429 && data.reason)) return data as AskResult
  if (r.status === 503) return askOffline(plant, question)
  throw new Error(data.error ?? 'Something went wrong. Please try again.')
}

export function askOffline(plant: Plant, question: string): AskResult {
  if (isDosageQuestion(question))
    return { answer: refusalText(plant, 'dosage'), citations: [], refused: true, reason: 'dosage', mode: 'offline' }

  const cq = contentQuery(plant, question)
  const pool = ALL_CHUNKS.filter((c) => c.species === plant.id)
  const ranked = cq ? bm25(cq, pool).filter((r) => r.score > 0.4) : []
  if (ranked.length === 0)
    return { answer: refusalText(plant, 'no_sources'), citations: [], refused: true, reason: 'no_sources', mode: 'offline' }

  const citations: Citation[] = ranked.slice(0, 2).map((r, i) => ({
    n: i + 1,
    id: r.chunk.id,
    title: r.chunk.title,
    url: r.chunk.url,
    text: r.chunk.text,
  }))
  // No language model offline: the answer is the matching passages, cited.
  const answer = citations
    .flatMap((c) => c.text.split(/(?<=\.)\s+(?=[A-Z])/).map((sent) => `${sent} [${c.n}]`))
    .join(' ')
  return { answer, citations, refused: false, coverage: 'sources', mode: 'offline' }
}
