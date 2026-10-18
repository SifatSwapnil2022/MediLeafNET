import react from '@vitejs/plugin-react'
import type { IncomingMessage, ServerResponse } from 'node:http'
import { resolve } from 'node:path'
import { defineConfig, loadEnv, type Plugin } from 'vite'

// /playground -> /playground.html, as Vercel's cleanUrls does in production.
function cleanUrls(req: IncomingMessage, _res: ServerResponse, next: () => void) {
  if (req.url === '/playground' || req.url?.startsWith('/playground?')) req.url = req.url.replace('/playground', '/playground.html')
  next()
}

// Runs the files in /api during `npm run dev`, the same way Vercel does in
// production, so answers work locally with the keys in .env.local.
function devApi(): Plugin {
  return {
    name: 'medileafnet-dev-api',
    configurePreviewServer(server) {
      server.middlewares.use(cleanUrls)
    },
    configureServer(server) {
      Object.assign(process.env, loadEnv('development', process.cwd(), ''))
      server.middlewares.use(cleanUrls)
      server.middlewares.use(async (req: IncomingMessage, res: ServerResponse, next) => {
        const path = req.url?.split('?')[0] ?? ''
        if (!path.startsWith('/api/')) return next()
        const name = path.slice(5).replace(/[^a-z0-9-]/gi, '')
        let mod: { default?: (req: unknown, res: unknown) => unknown }
        try {
          mod = await server.ssrLoadModule(`/api/${name}.ts`)
        } catch {
          return next()
        }
        if (!mod.default) return next()
        let raw = ''
        for await (const chunk of req) raw += chunk
        const vreq = Object.assign(req, { body: raw ? JSON.parse(raw) : undefined, query: {} })
        const vres = Object.assign(res, {
          status(code: number) {
            res.statusCode = code
            return vres
          },
          json(data: unknown) {
            res.setHeader('content-type', 'application/json')
            res.end(JSON.stringify(data))
            return vres
          },
        })
        try {
          await mod.default(vreq, vres)
        } catch (e) {
          server.config.logger.error(String(e))
          if (!res.headersSent) vres.status(500).json({ error: 'dev api crashed, see terminal' })
        }
      })
    },
  }
}

export default defineConfig({
  plugins: [react(), devApi()],
  build: {
    rolldownOptions: {
      input: {
        main: resolve(__dirname, 'index.html'),
        playground: resolve(__dirname, 'playground.html'),
      },
    },
  },
})
