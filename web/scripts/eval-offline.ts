// Scores the offline fallback (BM25 over the plant sheets).
//   npx tsx scripts/eval-offline.ts
// data/eval_set.jsonl was used while tuning the retriever, so its numbers are
// optimistic. data/eval_holdout.jsonl was written separately and is never
// tuned against; that is the number the site shows.
// Writes public/eval/results.json. The live pipeline is scored by scripts/eval.py.

import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { plantById } from '../shared/plants.js'
import { askOffline } from '../src/lib/ask.js'

interface Q {
  id: string
  plant: string
  question: string
  answerable: boolean
  expect: string[]
}

const load = (f: string): Q[] =>
  readFileSync(new URL(`../data/${f}`, import.meta.url), 'utf8')
    .trim()
    .split('\n')
    .map((l) => JSON.parse(l))

function score(set: Q[]) {
  let hits = 0
  let wrongRefusals = 0
  let rightRefusals = 0
  let cited = 0
  let sentences = 0
  const failures: { id: string; question: string; kind: string }[] = []

  for (const q of set) {
  const plant = plantById(q.plant)!
  const a = askOffline(plant, q.question)
  const ids = a.citations.map((c) => c.id)
  if (q.answerable) {
    if (a.refused) {
      wrongRefusals++
      failures.push({ id: q.id, question: q.question, kind: 'refused an answerable question' })
    } else if (q.expect.some((e) => ids.slice(0, 4).includes(e))) hits++
    else failures.push({ id: q.id, question: q.question, kind: 'wrong passage retrieved' })
  } else if (a.refused) rightRefusals++
  else failures.push({ id: q.id, question: q.question, kind: 'answered, should have refused' })

  if (!a.refused) {
    const s = a.answer.split(/(?<=\.)\s+(?=[A-Z])/)
    sentences += s.length
    cited += s.filter((x) => /\[\d+\]/.test(x)).length
  }
}

  const answerable = set.filter((q) => q.answerable).length
  const unanswerable = set.length - answerable
  return {
    questions: set.length,
    unanswerable,
    hitAt4: hits / answerable,
    refusalAccuracy: rightRefusals / unanswerable,
    wrongRefusals,
    citationCoverage: sentences ? cited / sentences : 1,
    failures,
  }
}

const holdout = score(load('eval_holdout.jsonl'))
const tuning = score(load('eval_set.jsonl'))
const results = { mode: 'offline', set: 'holdout', date: new Date().toISOString().slice(0, 10), ...holdout, tuning }
mkdirSync(new URL('../public/eval/', import.meta.url), { recursive: true })
writeFileSync(new URL('../public/eval/results.json', import.meta.url), JSON.stringify(results, null, 2) + '\n')
for (const [name, r] of [['holdout', holdout], ['tuning', tuning]] as const) {
  console.log(`${name}: hit@4 ${(r.hitAt4 * 100).toFixed(1)}%  refusals ${(r.refusalAccuracy * 100).toFixed(1)}%  wrong refusals ${r.wrongRefusals}  citation coverage ${(r.citationCoverage * 100).toFixed(1)}%`)
  for (const f of r.failures) console.log(`   ${f.id}  ${f.kind}: ${f.question}`)
}
