import type { Chunk } from './corpus.js'
import type { Plant } from './plants.js'

export interface Citation {
  n: number
  id: string
  title: string
  url: string
  text: string
}

export interface Turn {
  q: string
  a: string
}

export type Coverage = 'sources' | 'partial' | 'general' | 'none'

export interface AskResult {
  answer: string // sentences backed by a cited source
  general?: string // clearly labelled general knowledge, used only when the sources fall short
  citations: Citation[]
  refused: boolean
  reason?: 'no_sources' | 'dosage' | 'ungrounded' | 'off_topic' | 'rate_limited'
  coverage?: Coverage
  mode: 'live' | 'offline'
  model?: string
  ms?: number
}

export const MAX_QUESTION_CHARS = 300
export const MAX_HISTORY = 4

// Asking how much to take. No source we use gives a dose, and a language
// model must not invent one, so these are refused before anything else runs.
const DOSAGE =
  /\b(dose|doses|dosage|dosing|overdose|mg|milligrams?|ml|millilit(er|re)s?|grams?|teaspoons?|tablespoons?|per day|times a day|how much (should|can|do|to|would) (i|we|you|he|she|they|one)? ?(take|eat|drink|give|use|consume|apply))\b/i

export function isDosageQuestion(q: string): boolean {
  return DOSAGE.test(q)
}

// --- Lexical retrieval (BM25) -----------------------------------------------

const STOP = new Set(
  'a an and are as at be but by can do does for from has have how i if in into is it its of on or should so that the this to was what when where which who why will with you your about there their them they'.split(' '),
)

export function tokenize(s: string): string[] {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, ' ')
    .split(/[\s-]+/)
    .filter((t) => t.length > 1 && !STOP.has(t))
    .map(stem)
}

// Just enough stemming for "use / uses / used" and "effect / effects".
function stem(t: string): string {
  if (t.length > 4 && t.endsWith('ies')) return t.slice(0, -3) + 'y'
  if (t.length > 3 && t.endsWith('s') && !t.endsWith('ss')) t = t.slice(0, -1)
  if (t.length > 4 && t.endsWith('ed')) t = t.slice(0, -1) // used -> use
  return t
}

export function bm25(query: string, chunks: Chunk[], k1 = 1.4, b = 0.75) {
  const docs = chunks.map((c) => tokenize(c.text))
  const avg = docs.reduce((s, d) => s + d.length, 0) / Math.max(docs.length, 1)
  const df = new Map<string, number>()
  docs.forEach((d) => new Set(d).forEach((t) => df.set(t, (df.get(t) ?? 0) + 1)))
  const q = tokenize(query)
  return chunks
    .map((chunk, i) => {
      const d = docs[i]
      let score = 0
      for (const t of q) {
        const f = d.filter((x) => x === t).length
        if (!f) continue
        const idf = Math.log(1 + (docs.length - (df.get(t) ?? 0) + 0.5) / ((df.get(t) ?? 0) + 0.5))
        score += idf * ((f * (k1 + 1)) / (f + k1 * (1 - b + (b * d.length) / avg)))
      }
      return { chunk, score }
    })
    .sort((a, z) => z.score - a.score)
}

// Every passage in a species pool already names the plant, so its names carry
// no signal for ranking. Strip them before scoring.
export function contentQuery(plant: Plant, q: string): string {
  const names = new Set(tokenize(`${plant.sci} ${plant.local} ${plant.id.replace('_', ' ')}`))
  return tokenize(q)
    .filter((t) => !names.has(t))
    .join(' ')
}

// Reciprocal rank fusion: merge several ranked id lists into one.
export function rrf(lists: string[][], k = 60): [string, number][] {
  const score = new Map<string, number>()
  for (const list of lists) list.forEach((id, rank) => score.set(id, (score.get(id) ?? 0) + 1 / (k + rank + 1)))
  return [...score.entries()].sort((a, b) => b[1] - a[1])
}

// --- Prompts ----------------------------------------------------------------

const historyText = (history: Turn[]) =>
  history.length
    ? 'Earlier in this chat:\n' + history.map((t) => `User: ${t.q}\nAssistant: ${t.a}`).join('\n') + '\n\n'
    : ''

// Step 1: turn the question (and any follow-up context) into search phrasings.
export function buildRewritePrompt(plant: Plant, question: string, history: Turn[]) {
  const system = [
    'You prepare search queries for a medicinal plant knowledge base.',
    'Return JSON only: {"standalone": string, "queries": string[]}.',
    '"standalone" restates the latest question so it makes sense on its own, resolving words like "it" or "that" from the chat.',
    '"queries" holds 3 short search phrasings (4 to 10 words each) using different wording: one plain, one with technical or botanical terms, one with likely synonyms.',
  ].join('\n')
  const user = `Plant: ${plant.sci} (local name: ${plant.local})\n\n${historyText(history)}Latest question: ${question}`
  return { system, user }
}

// Step 2: answer from the numbered sources, with a separate, labelled slot for
// general knowledge when the sources don't cover the question.
export function buildAnswerPrompt(plant: Plant, question: string, sources: Citation[], history: Turn[]) {
  const system = [
    'You are MediLeafNET, a careful assistant for a public research demo about medicinal plants of Bangladesh.',
    'Return JSON only: {"sourced": string, "general": string, "off_topic": boolean}.',
    '',
    '"sourced": 2 to 4 sentences that use ONLY the numbered sources. End every sentence with its citation, like [1] or [2][3]. Use "" if the sources do not help.',
    '"general": use only when "sourced" does not fully answer. 1 to 3 sentences of widely accepted, well-established knowledge about this plant. No citations here. Say plainly when evidence is weak or you are unsure. Never invent studies, percentages or numbers. Use "" when not needed.',
    '"off_topic": true only if the question has nothing to do with this plant, plants, botany, traditional medicine or safety. Then leave both strings empty.',
    '',
    'Hard rules for both fields:',
    '- Never give doses, amounts, frequencies, recipes, preparation steps or treatment plans.',
    '- Never suggest replacing or stopping prescribed medicine.',
    plant.risk === 'danger'
      ? '- This plant is poisonous. Only discuss identification, toxicity, symptoms of poisoning and safety, and tell the reader not to use it.'
      : '- Mention a relevant safety warning when there is one.',
    '- For anything about treating an illness, pregnancy, children or existing conditions, add that a doctor or pharmacist should be asked.',
    '- Write plainly, like a botanist talking to a curious friend. No headings, lists or preamble. Answer in the language the user wrote in.',
  ].join('\n')
  const ctx = sources.length ? sources.map((s) => `[${s.n}] (${s.title})\n${s.text}`).join('\n\n') : '(no matching sources)'
  const user = `Plant: ${plant.sci} (local name: ${plant.local})\n\nSources:\n${ctx}\n\n${historyText(history)}Question: ${question}`
  return { system, user }
}

export function parseJson<T>(raw: string | null | undefined): T | null {
  if (!raw) return null
  const s = raw.trim().replace(/^```(?:json)?\s*|\s*```$/g, '')
  try {
    return JSON.parse(s) as T
  } catch {
    const m = s.match(/\{[\s\S]*\}/)
    if (!m) return null
    try {
      return JSON.parse(m[0]) as T
    } catch {
      return null
    }
  }
}

// --- Grounding check -------------------------------------------------------

// Keep only sentences that cite a source we actually supplied.
export function enforceCitations(raw: string, sources: Citation[]) {
  const valid = new Set(sources.map((s) => s.n))
  const sentences = raw
    .replace(/\s+/g, ' ')
    .trim()
    .split(/(?<=[.!?](?:\s*\[\d+\])*)\s+(?=[A-Z])/)
    .filter(Boolean)
  const kept: string[] = []
  const used = new Set<number>()
  for (const s of sentences) {
    const refs = [...s.matchAll(/\[(\d+)\]/g)].map((m) => Number(m[1]))
    const good = refs.filter((r) => valid.has(r))
    if (good.length === 0) continue
    good.forEach((r) => used.add(r))
    kept.push(s.replace(/\[(\d+)\]/g, (m, d) => (valid.has(Number(d)) ? m : '')).trim())
  }
  return {
    answer: kept.join(' '),
    used: sources.filter((s) => used.has(s.n)),
    dropped: sentences.length - kept.length,
  }
}

// Strip any citation markers the model put in the general-knowledge slot.
export const cleanGeneral = (s: string) => s.replace(/\s*\[\d+\]/g, '').replace(/\s+/g, ' ').trim()

export const displayName = (p: Plant) => (p.local === 'No common local name' ? p.sci : p.local.split(' / ')[0])

export function refusalText(plant: Plant, reason: AskResult['reason']): string {
  switch (reason) {
    case 'dosage':
      return `I don't give doses for ${displayName(plant)} or any other plant. The right amount depends on the person, and getting it wrong can hurt. Please ask a doctor or pharmacist.`
    case 'ungrounded':
      return `I couldn't write an answer I could back up, so I'm not giving one.`
    case 'off_topic':
      return `I can only help with ${plant.sci}: what it is, how it's used, what's in it and how safe it is.`
    case 'rate_limited':
      return 'Too many questions in a short time. Wait a minute and try again.'
    default:
      return `My sources don't cover that for ${plant.sci}, and I'd rather say so than guess.`
  }
}
