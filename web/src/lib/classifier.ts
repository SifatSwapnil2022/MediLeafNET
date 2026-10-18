// Runs the MediLeafNET ViT in the browser with onnxruntime-web.
// The model file is produced by scripts/export_onnx.py from best_vit_model.pth.

import type { InferenceSession, Tensor } from 'onnxruntime-web/wasm'

const BASE = import.meta.env.BASE_URL
export const MODEL_URL = `${BASE}model/medileaf_vit_int8.onnx`
export const LABELS_URL = `${BASE}model/labels.json`
export const THRESHOLD = 0.7 // same as min_confidence_for_generation in the thesis config
const SIZE = 224
const MEAN = [0.485, 0.456, 0.406]
const STD = [0.229, 0.224, 0.225]

export interface Prediction {
  label: string
  confidence: number
  top: { label: string; p: number }[]
  attention: Float32Array | null // 14x14, normalised to [0, 1]
  source: 'model' | 'recorded'
  ms: number
}

let session: Promise<{ s: InferenceSession; labels: string[]; ort: typeof import('onnxruntime-web/wasm') }> | null = null

export async function modelAvailable(): Promise<boolean> {
  try {
    const r = await fetch(MODEL_URL, { method: 'HEAD' })
    const type = r.headers.get('content-type') ?? ''
    return r.ok && !type.includes('text/html')
  } catch {
    return false
  }
}

function load() {
  session ??= (async () => {
    const ort = await import('onnxruntime-web/wasm')
    ort.env.wasm.numThreads = 1 // threads need cross-origin isolation; one is fast enough for a 6-layer ViT
    const [s, labels] = await Promise.all([
      ort.InferenceSession.create(MODEL_URL, { executionProviders: ['wasm'] }),
      fetch(LABELS_URL).then((r) => r.json() as Promise<string[]>),
    ])
    return { s, labels, ort }
  })()
  session.catch(() => (session = null))
  return session
}

// Matches torchvision: Resize((224,224)) -> ToTensor -> Normalize(ImageNet).
export function preprocess(img: CanvasImageSource): Float32Array {
  const c = document.createElement('canvas')
  c.width = c.height = SIZE
  const ctx = c.getContext('2d', { willReadFrequently: true })!
  ctx.imageSmoothingQuality = 'high'
  ctx.drawImage(img, 0, 0, SIZE, SIZE)
  const { data } = ctx.getImageData(0, 0, SIZE, SIZE)
  const out = new Float32Array(3 * SIZE * SIZE)
  const plane = SIZE * SIZE
  for (let i = 0; i < plane; i++) {
    for (let ch = 0; ch < 3; ch++) {
      out[ch * plane + i] = (data[i * 4 + ch] / 255 - MEAN[ch]) / STD[ch]
    }
  }
  return out
}

function softmax(x: Float32Array | number[]) {
  const m = Math.max(...x)
  const e = Array.from(x, (v) => Math.exp(v - m))
  const s = e.reduce((a, b) => a + b, 0)
  return e.map((v) => v / s)
}

// CLS-token attention of the last layer, averaged over heads.
function clsAttention(t: Tensor): Float32Array {
  const [, heads, n] = t.dims as number[]
  const d = t.data as Float32Array
  const grid = new Float32Array(n - 1)
  for (let h = 0; h < heads; h++) {
    const row = h * n * n // row 0 of this head = the CLS query
    for (let j = 1; j < n; j++) grid[j - 1] += d[row + j] / heads
  }
  let lo = Infinity
  let hi = -Infinity
  grid.forEach((v) => ((lo = Math.min(lo, v)), (hi = Math.max(hi, v))))
  return grid.map((v) => (v - lo) / (hi - lo || 1))
}

export async function classify(img: CanvasImageSource): Promise<Prediction> {
  const { s, labels, ort } = await load()
  const t0 = performance.now()
  const input = new ort.Tensor('float32', preprocess(img), [1, 3, SIZE, SIZE])
  const out = await s.run({ [s.inputNames[0]]: input })
  const probs = softmax(out.logits.data as Float32Array)
  const top = probs
    .map((p, i) => ({ label: labels[i], p }))
    .sort((a, b) => b.p - a.p)
    .slice(0, 5)
  return {
    label: top[0].label,
    confidence: top[0].p,
    top,
    attention: out.attention ? clsAttention(out.attention) : null,
    source: 'model',
    ms: Math.round(performance.now() - t0),
  }
}

// The one photo whose result we know without the model: the Gradio app logged
// Sida_Rhombifolia at 0.914 for this exact image (.gradio/flagged/dataset1.csv).
export const SAMPLE = {
  src: `${BASE}samples/sida_rhombifolia.jpg`,
  prediction: {
    label: 'Sida_Rhombifolia',
    confidence: 0.914,
    top: [{ label: 'Sida_Rhombifolia', p: 0.914 }],
    attention: null,
    source: 'recorded',
    ms: 0,
  } satisfies Prediction,
}
