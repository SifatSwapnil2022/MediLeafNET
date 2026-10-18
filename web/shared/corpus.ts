import { PLANTS, CSV_URL, type Plant } from './plants.js'
import { WIKI_CHUNKS } from './wiki-chunks.js'

// A chunk is the unit we retrieve and cite. The same shape is upserted to
// Upstash by scripts/ingest.py (which also adds Wikipedia passages), so the
// offline fallback and the live API cite sources the same way.
export interface Chunk {
  id: string
  species: string
  title: string
  url: string
  text: string
}

function sheet(p: Plant): Chunk[] {
  const title = `MediLeafNET plant sheet: ${p.sci}`
  const base = { species: p.id, title, url: CSV_URL }
  return [
    {
      ...base,
      id: `${p.id}::overview`,
      text: `${p.sci} (local name: ${p.local}) is found in ${p.region}. Traditional medicinal uses: ${p.uses}`,
    },
    {
      ...base,
      id: `${p.id}::compounds`,
      text: `Active compounds reported in ${p.sci}: ${p.compounds}`,
    },
    {
      ...base,
      id: `${p.id}::evidence`,
      text: `Clinical evidence for ${p.sci}: ${p.evidence}`,
    },
    {
      ...base,
      id: `${p.id}::safety`,
      text: `Side effects and safety of ${p.sci}: ${p.sideEffects}`,
    },
  ]
}

export const SHEET_CHUNKS: Chunk[] = PLANTS.flatMap(sheet)

// Everything the assistant may cite: thesis plant sheets plus Wikipedia passages.
export const ALL_CHUNKS: Chunk[] = [...SHEET_CHUNKS, ...WIKI_CHUNKS]
