// The answer pipeline behind /api/ask. Runs on Vercel and in `npm run dev`.
//
//   question ─▶ rewrite (fast LLM, uses chat history) ─▶ hybrid retrieval
//            ─▶ answer (LLM, JSON: sourced + general) ─▶ citation check ─▶ reply
//
// Only GROQ_API_KEY is required. With Upstash configured, dense vector search
// is fused with BM25; without it, BM25 over several rewritten queries is used.

import { Index } from '@upstash/vector'
import Groq from 'groq-sdk'
import { ALL_CHUNKS, type Chunk } from '../shared/corpus.js'
import type { Plant } from '../shared/plants.js'
import {
  bm25,
  buildAnswerPrompt,
  buildRewritePrompt,
  cleanGeneral,
  contentQuery,
  enforceCitations,
  isDosageQuestion,
  parseJson,
  refusalText,
  rrf,
  type AskResult,
  type Citation,
  type Turn,
} from '../shared/rag.js'

const TOP_K = 5

export function config(env: NodeJS.ProcessEnv = process.env) {
  return {
    llm: Boolean(env.GROQ_API_KEY),
    vector: Boolean(env.UPSTASH_VECTOR_REST_URL && env.UPSTASH_VECTOR_REST_TOKEN),
    model: env.GROQ_MODEL || 'openai/gpt-oss-120b',
    fastModel: env.GROQ_FAST_MODEL || 'openai/gpt-oss-20b',
    minScore: Number(env.MIN_SCORE ?? 0.72),
  }
}

type Meta = { species: string; title: string; url: string; text: string }

// Groq accepts these for gpt-oss models; the SDK types may lag behind.
const reasoning = { reasoning_effort: 'low', include_reasoning: false } as Record<string, unknown>

async function rewrite(groq: Groq, model: string, plant: Plant, question: string, history: Turn[]) {
  const { system, user } = buildRewritePrompt(plant, question, history)
  try {
    const r = await groq.chat.completions.create({
      model,
      temperature: 0,
      max_tokens: 300,
      response_format: { type: 'json_object' },
      messages: [
        { role: 'system', content: system },
        { role: 'user', content: user },
      ],
      ...reasoning,
    })
    const j = parseJson<{ standalone?: string; queries?: string[] }>(r.choices[0]?.message?.content)
    const standalone = (j?.standalone || question).slice(0, 300)
    const queries = (j?.queries ?? []).filter((q) => typeof q === 'string').slice(0, 4)
    return { standalone, queries }
  } catch (e) {
    console.warn('[ask] rewrite failed, using the raw question', e)
    return { standalone: question, queries: [] as string[] }
  }
}

async function retrieve(plant: Plant, standalone: string, queries: string[], cfg: ReturnType<typeof config>, env: NodeJS.ProcessEnv) {
  const pool = ALL_CHUNKS.filter((c) => c.species === plant.id)
  const byId = new Map<string, Chunk>(pool.map((c) => [c.id, c]))
  const lists: string[][] = []

  for (const q of [standalone, ...queries]) {
    const cq = contentQuery(plant, q)
    if (!cq) continue
    lists.push(
      bm25(cq, pool)
        .filter((r) => r.score > 0.3)
        .slice(0, 8)
        .map((r) => r.chunk.id),
    )
  }

  if (cfg.vector) {
    try {
      const index = new Index<Meta>({ url: env.UPSTASH_VECTOR_REST_URL!, token: env.UPSTASH_VECTOR_REST_TOKEN! })
      const hits = await index.query({
        data: `${plant.sci}: ${standalone}`,
        topK: 8,
        includeMetadata: true,
        filter: `species = '${plant.id}'`,
      })
      const dense = hits.filter((h) => h.score >= cfg.minScore && h.metadata)
      dense.forEach((h) => {
        const id = String(h.id)
        if (!byId.has(id)) byId.set(id, { ...h.metadata!, id, species: plant.id })
      })
      // dense results count twice: they are the better signal on paraphrases
      const ids = dense.map((h) => String(h.id))
      lists.push(ids, ids)
    } catch (e) {
      console.warn('[ask] vector search failed, continuing with BM25 only', e)
    }
  }

  return rrf(lists)
    .slice(0, TOP_K)
    .map(([id], i): Citation => {
      const c = byId.get(id)!
      return { n: i + 1, id: c.id, title: c.title, url: c.url, text: c.text }
    })
}

export async function answer(plant: Plant, question: string, history: Turn[], env: NodeJS.ProcessEnv = process.env): Promise<AskResult> {
  const t0 = Date.now()
  const cfg = config(env)
  const refuse = (reason: AskResult['reason'], citations: Citation[] = []): AskResult => ({
    answer: refusalText(plant, reason),
    citations,
    refused: true,
    reason,
    coverage: 'none',
    mode: 'live',
    model: cfg.model,
    ms: Date.now() - t0,
  })

  if (isDosageQuestion(question)) return refuse('dosage')

  const groq = new Groq({ apiKey: env.GROQ_API_KEY })
  const { standalone, queries } = await rewrite(groq, cfg.fastModel, plant, question, history)
  if (isDosageQuestion(standalone)) return refuse('dosage')

  const sources = await retrieve(plant, standalone, queries, cfg, env)

  const { system, user } = buildAnswerPrompt(plant, standalone, sources, history)
  const r = await groq.chat.completions.create({
    model: cfg.model,
    temperature: 0.2,
    max_tokens: 700,
    response_format: { type: 'json_object' },
    messages: [
      { role: 'system', content: system },
      { role: 'user', content: user },
    ],
    ...reasoning,
  })
  const raw = r.choices[0]?.message?.content ?? ''
  const j = parseJson<{ sourced?: string; general?: string; off_topic?: boolean }>(raw) ?? { sourced: raw, general: '' }

  if (j.off_topic) return refuse('off_topic')

  const checked = enforceCitations(j.sourced ?? '', sources)
  let general = cleanGeneral(j.general ?? '')
  // belt and braces: never let a dose slip through the uncited slot
  if (isDosageQuestion(general)) general = ''

  if (!checked.answer && !general) return refuse(sources.length ? 'ungrounded' : 'no_sources', sources)

  return {
    answer: checked.answer,
    general: general || undefined,
    citations: checked.used,
    refused: false,
    coverage: checked.answer ? (general ? 'partial' : 'sources') : 'general',
    mode: 'live',
    model: cfg.model,
    ms: Date.now() - t0,
  }
}
