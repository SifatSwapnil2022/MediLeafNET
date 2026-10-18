import type { VercelRequest, VercelResponse } from '@vercel/node'
import { ALL_CHUNKS, SHEET_CHUNKS } from '../shared/corpus.js'
import { config } from '../server/pipeline.js'

// Tells the playground what this deployment has switched on. No secrets.
export default function handler(_req: VercelRequest, res: VercelResponse) {
  const c = config()
  res.setHeader('Cache-Control', 'no-store')
  return res.status(200).json({
    answers: c.llm ? 'live' : 'offline',
    vectorSearch: c.vector,
    model: c.llm ? c.model : null,
    rewriteModel: c.llm ? c.fastModel : null,
    passages: { plantSheets: SHEET_CHUNKS.length, total: ALL_CHUNKS.length },
  })
}
