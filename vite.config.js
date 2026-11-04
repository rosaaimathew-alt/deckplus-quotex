import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { readFileSync, writeFileSync, existsSync } from 'fs'
import { resolve } from 'path'
import http from 'http'

const DATA_FILE = resolve('./quotex-data.json')

function localStorePlugin() {
  return {
    name: 'quotex-local-store',
    configureServer(server) {

      // ── File-backed data store (/api/store) ───────────────────────────────
      server.middlewares.use('/api/store', (req, res) => {
        res.setHeader('Content-Type', 'application/json')
        if (req.method === 'GET') {
          res.end(existsSync(DATA_FILE) ? readFileSync(DATA_FILE, 'utf-8') : 'null')
          return
        }
        if (req.method === 'POST') {
          let body = ''
          req.on('data', chunk => { body += chunk })
          req.on('end', () => {
            try {
              const { value } = JSON.parse(body)
              writeFileSync(DATA_FILE, value, 'utf-8')
              res.end('{"ok":true}')
            } catch {
              res.statusCode = 400
              res.end('{"error":"bad request"}')
            }
          })
          return
        }
        res.statusCode = 405
        res.end('{"error":"method not allowed"}')
      })

      // ── Server-side PDF text extraction (/api/extract-pdf) ──────────────
      // Runs pdf-parse in Node so any browser can extract PDF text reliably.
      server.middlewares.use('/api/extract-pdf', (req, res) => {
        res.setHeader('Content-Type', 'application/json')
        if (req.method !== 'POST') { res.statusCode = 405; res.end('{"error":"method not allowed"}'); return }
        let body = ''
        req.on('data', chunk => { body += chunk })
        req.on('end', async () => {
          try {
            const { data } = JSON.parse(body)
            const buffer = Buffer.from(data, 'base64')
            const pdfParse = (await import('pdf-parse')).default
            const result = await pdfParse(buffer)
            res.end(JSON.stringify({ text: result.text || '' }))
          } catch (err) {
            res.statusCode = 400
            res.end(JSON.stringify({ error: err.message }))
          }
        })
      })

      // ── Ollama proxy (/api/ai → localhost:11434/v1) ───────────────────────
      // Proxied through the Vite server so road devices (Tailscale) can use
      // the AI features without Ollama needing to be installed on their end.
      server.middlewares.use('/api/ai', (req, res) => {
        const ollamaPath = '/v1' + (req.url || '/')
        const proxyReq = http.request(
          { hostname: 'localhost', port: 11434, path: ollamaPath, method: req.method, headers: { ...req.headers, host: 'localhost:11434' } },
          (proxyRes) => {
            res.writeHead(proxyRes.statusCode, proxyRes.headers)
            proxyRes.pipe(res)
          }
        )
        proxyReq.on('error', () => {
          res.statusCode = 503
          res.setHeader('Content-Type', 'application/json')
          res.end(JSON.stringify({ error: 'Ollama is not running. In Terminal: ollama serve' }))
        })
        req.pipe(proxyReq)
      })
    },
  }
}

// /qx-config.js — the Supabase URL and public (anon) key for the plain pages in
// public/ (the design editor), which Vite doesn't build. The same values are in
// the app's own bundle; nothing secret.
function qxConfigPlugin(env) {
  const source = () => `window.QX_CONFIG = ${JSON.stringify({ supabaseUrl: env.VITE_SUPABASE_URL || '', supabaseKey: env.VITE_SUPABASE_ANON_KEY || '' })};\n`
  const serve = (server) => { server.middlewares.use('/qx-config.js', (req, res) => { res.setHeader('Content-Type', 'application/javascript'); res.end(source()) }) }
  return {
    name: 'qx-config',
    configureServer: serve,
    configurePreviewServer: serve,
    generateBundle() { this.emitFile({ type: 'asset', fileName: 'qx-config.js', source: source() }) },
  }
}

export default defineConfig(({ mode }) => ({
  plugins: [react(), tailwindcss(), localStorePlugin(), qxConfigPlugin(loadEnv(mode, process.cwd(), 'VITE_'))],
  // Compile for older browsers too (Safari 13+ / Chrome 80+ — e.g. an older Mac).
  // The default target only covers the last couple of years of browsers; on
  // anything older the app's code can't even be read and the page sits on
  // index.html's "App failed to load" message.
  build: { target: ['es2019', 'safari13', 'chrome80', 'edge88', 'firefox78'] },
  server: {
    host: true,
    proxy: {
      '/api/auth':          'http://localhost:3001',
      '/api/send-email':    'http://localhost:3001',
      '/api/messages':      'http://localhost:3001',
      '/api/inbound-email': 'http://localhost:3001',
      '/api/google-auth':   'http://localhost:3001',
      '/api/drive':         'http://localhost:3001',
      '/api/sign':          'http://localhost:3001',
      '/api/analyze':       'http://localhost:3001',
      '/api/booking':       'http://localhost:3001',
    },
  },
}))
