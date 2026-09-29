import { fileURLToPath } from 'url'
import { dirname, resolve } from 'path'
import dotenv from 'dotenv'

const __dirname = dirname(fileURLToPath(import.meta.url))
dotenv.config({ path: resolve(__dirname, '../.env') })

import express from 'express'
import handler from './analyze.js'
import emailHandler from './email.js'
import messagesHandler from './messages.js'
import inboundHandler from './inbound-email.js'
import aiChatHandler from './ai-chat.js'
import { getAuthUrl, handleCallback, isAuthenticated, uploadToDrive } from './_google-drive.js'
import { createHmac } from 'crypto'

const app = express()
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*')
  res.header('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS')
  res.header('Access-Control-Allow-Headers', 'Content-Type')
  if (req.method === 'OPTIONS') return res.sendStatus(200)
  next()
})
app.use(express.json({ limit: '25mb' }))

app.post('/api/analyze',       (req, res) => handler(req, res))
app.post('/api/email',         (req, res) => emailHandler(req, res))
app.post('/api/send-email',    (req, res) => emailHandler(req, res))  // backward compat alias
app.get('/api/messages',       (req, res) => messagesHandler(req, res))
app.post('/api/messages',      (req, res) => messagesHandler(req, res))
app.delete('/api/messages',    (req, res) => messagesHandler(req, res))
app.post('/api/inbound-email', (req, res) => inboundHandler(req, res))
app.post('/api/ai-chat',       (req, res) => aiChatHandler(req, res))

// ── Auth ─────────────────────────────────────────────────────────────────
app.post('/api/auth/login', (req, res) => {
  const { email, password } = req.body || {}
  const adminEmail    = process.env.ADMIN_EMAIL
  const adminPassword = process.env.ADMIN_PASSWORD
  // This is the LOCAL dev server, so a dev fallback is acceptable — but still
  // prefer a real SESSION_SECRET, and never allow the known default in prod.
  const isProd = process.env.VERCEL_ENV === 'production' || process.env.NODE_ENV === 'production'
  const secret = process.env.SESSION_SECRET || (isProd ? null : 'dev-secret-change-me')
  if (!secret) return res.status(500).json({ error: 'Auth not configured' })
  if (!adminEmail || !adminPassword) return res.status(500).json({ error: 'Auth not configured' })
  if (email?.toLowerCase() === adminEmail.toLowerCase() && password === adminPassword) {
    const payload = JSON.stringify({ email, exp: Date.now() + 30 * 24 * 60 * 60 * 1000 })
    const sig     = createHmac('sha256', secret).update(payload).digest('hex')
    return res.json({ token: Buffer.from(payload).toString('base64') + '.' + sig })
  }
  return res.status(401).json({ error: 'Invalid email or password' })
})

// ── Google Drive OAuth ────────────────────────────────────────────────────
app.get('/api/google-auth/status', async (req, res) => {
  res.json({ authenticated: await isAuthenticated() })
})

app.get('/api/google-auth/start', (req, res) => {
  const origin = req.query.origin || 'http://localhost:5173'
  res.json({ url: getAuthUrl(origin) })
})

app.get('/api/google-auth/callback', async (req, res) => {
  const { code, state } = req.query
  if (!code) return res.status(400).send('Missing code')
  try {
    const origin = await handleCallback(code, state)
    res.redirect(`${origin}/contract?google=connected`)
  } catch (err) {
    res.redirect(`http://localhost:5173/contract?google=error&msg=${encodeURIComponent(err.message)}`)
  }
})

// ── Google Drive upload ───────────────────────────────────────────────────
app.post('/api/drive/upload', async (req, res) => {
  const { pdfBase64, fileName } = req.body
  if (!pdfBase64 || !fileName) return res.status(400).json({ error: 'Missing pdfBase64 or fileName' })
  try {
    const result = await uploadToDrive({ pdfBase64, fileName })
    res.json(result)
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

// ── Signing links ─────────────────────────────────────────────────────────
import signTokenHandler from './sign/[token].js'
app.post('/api/sign/create',  (req, res) => { req.query.token = 'create';        signTokenHandler(req, res) })
app.get('/api/sign/:token',   (req, res) => { req.query.token = req.params.token; signTokenHandler(req, res) })
app.post('/api/sign/:token',  (req, res) => { req.query.token = req.params.token; signTokenHandler(req, res) })

const PORT = process.env.API_PORT || 3001
app.listen(PORT, () => {
  const hasGmail = !!(process.env.GMAIL_USER && process.env.GMAIL_APP_PASSWORD)
  const hasClient = !!process.env.GOOGLE_CLIENT_ID
  console.log(`API server running on http://localhost:${PORT}`)
  console.log(`GMAIL_USER/APP_PASSWORD: ${hasGmail ? 'loaded ✓' : 'MISSING ✗ (add to .env to send emails)'}`)
  console.log(`GOOGLE_CLIENT_ID:        ${hasClient ? 'loaded ✓' : 'MISSING ✗'}`)
})
