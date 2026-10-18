import type { VercelRequest, VercelResponse } from '@vercel/node'
import { plantById } from '../shared/plants.js'
import { MAX_HISTORY, MAX_QUESTION_CHARS, refusalText, type Turn } from '../shared/rag.js'
import { answer, config } from '../server/pipeline.js'

// Best-effort limit per warm instance, to protect the free Groq quota.
const WINDOW_MS = 60_000
const LIMIT = 15
const hits = new Map<string, number[]>()

function limited(ip: string) {
  const now = Date.now()
  const recent = (hits.get(ip) ?? []).filter((t) => now - t < WINDOW_MS)
  recent.push(now)
  hits.set(ip, recent)
  if (hits.size > 5000) hits.clear()
  return recent.length > LIMIT
}

function parseBody(body: unknown) {
  if (typeof body === 'string') {
    try {
      return JSON.parse(body)
    } catch {
      return null
    }
  }
  return body as Record<string, unknown> | null
}

function cleanHistory(raw: unknown): Turn[] {
  if (!Array.isArray(raw)) return []
  return raw
    .slice(-MAX_HISTORY)
    .filter((t) => t && typeof t.q === 'string' && typeof t.a === 'string')
    .map((t) => ({ q: String(t.q).slice(0, MAX_QUESTION_CHARS), a: String(t.a).slice(0, 600) }))
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' })
  if (!config().llm) return res.status(503).json({ error: 'not_configured' })

  const body = parseBody(req.body)
  const plant = plantById(String(body?.plant ?? ''))
  const question = String(body?.question ?? '').trim()
  if (!plant) return res.status(400).json({ error: 'Unknown plant.' })
  if (!question || question.length > MAX_QUESTION_CHARS)
    return res.status(400).json({ error: `Questions can be 1 to ${MAX_QUESTION_CHARS} characters.` })

  const ip = String(req.headers['x-forwarded-for'] ?? req.socket?.remoteAddress ?? 'unknown').split(',')[0].trim()
  if (limited(ip))
    return res.status(429).json({
      answer: refusalText(plant, 'rate_limited'),
      citations: [],
      refused: true,
      reason: 'rate_limited',
      mode: 'live',
    })

  try {
    const result = await answer(plant, question, cleanHistory(body?.history))
    res.setHeader('Cache-Control', 'no-store')
    return res.status(200).json(result)
  } catch (err) {
    console.error('[ask] failed', err)
    const status = (err as { status?: number })?.status
    if (status === 429) return res.status(429).json({ error: 'The language model is busy right now. Try again in a minute.' })
    return res.status(502).json({ error: 'Something went wrong while answering. Please try again.' })
  }
}
