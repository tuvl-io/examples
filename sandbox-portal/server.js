// tuvl sandbox portal — lead-captured landing + gallery + on-demand ephemeral
// sandboxes. One node process does three jobs:
//   1. serves the portal SPA + JSON API on PORTAL_HOST (e.g. try.tuvl.online)
//   2. reverse-proxies <id>.tuvl.online → the sandbox container sb-<id>:8000
//      (HTTP + websockets, for the Tuvl Insight editor)
//   3. reaps sandboxes past their TTL (drops the container + its database)
import express from 'express'
import http from 'node:http'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import httpProxy from 'http-proxy'
import { EXAMPLES, EXAMPLE_BY_ID } from './lib/examples.js'
import { createSession, getSession, recordLaunch } from './lib/store.js'
import {
  createDb,
  dropDb,
  runSandbox,
  killSandbox,
  reapOrphans,
  waitReady,
  upstreamHost,
} from './lib/docker.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

const PORT = Number(process.env.PORT || 3000)
const PORTAL_HOST = process.env.PORTAL_HOST || 'try.tuvl.online'
const BASE_DOMAIN = process.env.BASE_DOMAIN || 'tuvl.online'
const SANDBOX_SCHEME = process.env.SANDBOX_SCHEME || 'https'
const TTL_MS = Number(process.env.TTL_MINUTES || 20) * 60 * 1000
const MAX_PER_SESSION = Number(process.env.MAX_PER_SESSION || 2)
// Fixed slot pool: sandboxes are handed out on subdomains s1..sN, each covered by
// a pre-issued TLS cert (Option B — HTTP-01 pool, no wildcard cert needed). Pool
// size IS the concurrency cap.
const SLOT_COUNT = Number(process.env.SLOT_COUNT || 20)
const SLOTS = Array.from({ length: SLOT_COUNT }, (_, i) => `s${i + 1}`)
const MAX_CONCURRENT = SLOT_COUNT

// id -> { id, exampleId, dbName, sid, name, email, createdAt, expiresAt, status }
const sandboxes = new Map()

// ── helpers ──────────────────────────────────────────────────────────────────
// Allocate the first free slot subdomain (or null when the pool is full).
const allocSlot = () => SLOTS.find((s) => !sandboxes.has(s)) || null
const sandboxUrl = (id) => `${SANDBOX_SCHEME}://${id}.${BASE_DOMAIN}`

function sandboxIdFromHost(host) {
  if (!host || host === PORTAL_HOST) return null
  if (host.endsWith('.' + BASE_DOMAIN)) {
    const id = host.slice(0, host.length - BASE_DOMAIN.length - 1)
    if (id && !id.includes('.') && id !== 'try') return id
  }
  return null
}

function parseCookies(req) {
  const out = {}
  for (const p of (req.headers.cookie || '').split(';')) {
    const i = p.indexOf('=')
    if (i > 0) out[p.slice(0, i).trim()] = decodeURIComponent(p.slice(i + 1).trim())
  }
  return out
}

function publicView(sb) {
  return {
    id: sb.id,
    exampleId: sb.exampleId,
    title: EXAMPLE_BY_ID[sb.exampleId]?.title,
    url: sandboxUrl(sb.id),
    status: sb.status,
    createdAt: sb.createdAt,
    expiresAt: sb.expiresAt,
  }
}

async function teardown(id, reason = 'expired') {
  const sb = sandboxes.get(id)
  if (!sb) return
  sandboxes.delete(id)
  await killSandbox(id)
  await dropDb(sb.dbName)
  recordLaunch({ event: 'teardown', id, exampleId: sb.exampleId, email: sb.email, reason })
}

// ── portal app (only reached when Host === PORTAL_HOST) ───────────────────────
const app = express()
app.use(express.json())
app.use((req, _res, next) => {
  req.session = getSession(parseCookies(req).sbsess)
  next()
})

app.get('/api/examples', (_req, res) => res.json({ examples: EXAMPLES }))

app.get('/api/capacity', (_req, res) => {
  const used = sandboxes.size
  res.json({ used, total: SLOT_COUNT, available: Math.max(0, SLOT_COUNT - used) })
})

app.get('/api/me', (req, res) => {
  if (!req.session) return res.status(401).json({ error: 'not_signed_in' })
  const { name, email } = req.session
  res.json({ name, email })
})

app.post('/api/signup', (req, res) => {
  const name = String(req.body?.name || '').trim()
  const email = String(req.body?.email || '').trim()
  if (!name || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return res.status(400).json({ error: 'name and a valid email are required' })
  }
  const s = createSession({ name, email })
  res.setHeader(
    'Set-Cookie',
    `sbsess=${s.sid}; HttpOnly; Path=/; Max-Age=86400; SameSite=Lax`,
  )
  res.json({ name, email })
})

app.get('/api/mine', (req, res) => {
  if (!req.session) return res.status(401).json({ error: 'not_signed_in' })
  const mine = [...sandboxes.values()]
    .filter((sb) => sb.sid === req.session.sid)
    .map(publicView)
  res.json({ sandboxes: mine })
})

app.get('/api/sandbox/:id', (req, res) => {
  const sb = sandboxes.get(req.params.id)
  if (!sb) return res.status(404).json({ error: 'not_found' })
  res.json(publicView(sb))
})

app.post('/api/launch', async (req, res) => {
  if (!req.session) return res.status(401).json({ error: 'not_signed_in' })
  const ex = EXAMPLE_BY_ID[String(req.body?.exampleId || '')]
  if (!ex) return res.status(400).json({ error: 'unknown_example' })

  const mine = [...sandboxes.values()].filter((sb) => sb.sid === req.session.sid)
  if (mine.length >= MAX_PER_SESSION) {
    return res.status(429).json({ error: 'per_user_limit', message: `You can run ${MAX_PER_SESSION} sandboxes at a time. Stop one first.` })
  }
  const id = allocSlot()
  if (!id) {
    return res.status(503).json({ error: 'at_capacity', message: 'All sandbox slots are busy right now — try again in a few minutes.' })
  }
  const dbName = `sb_${id}`
  const now = Date.now()
  const sb = {
    id,
    exampleId: ex.id,
    dbName,
    sid: req.session.sid,
    name: req.session.name,
    email: req.session.email,
    createdAt: new Date(now).toISOString(),
    expiresAt: new Date(now + TTL_MS).toISOString(),
    status: 'starting',
  }
  sandboxes.set(id, sb)
  recordLaunch({ event: 'launch', id, exampleId: ex.id, name: sb.name, email: sb.email })

  try {
    await createDb(dbName)
    await runSandbox({ id, image: `tuvl-example-${ex.id}:latest`, dbName })
  } catch (err) {
    await teardown(id, 'launch_failed')
    return res.status(500).json({ error: 'launch_failed', message: String(err?.message || err) })
  }
  // become ready in the background; the client polls /api/sandbox/:id
  waitReady(id).then((ok) => {
    const cur = sandboxes.get(id)
    if (cur) cur.status = ok ? 'ready' : 'error'
  })
  res.json(publicView(sb))
})

app.post('/api/stop', async (req, res) => {
  if (!req.session) return res.status(401).json({ error: 'not_signed_in' })
  const sb = sandboxes.get(String(req.body?.id || ''))
  if (!sb || sb.sid !== req.session.sid) return res.status(404).json({ error: 'not_found' })
  await teardown(sb.id, 'stopped')
  res.json({ ok: true })
})

app.get('/healthz', (_req, res) => res.json({ ok: true, active: sandboxes.size }))
app.use(express.static(path.join(__dirname, 'public')))
app.get('*', (_req, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')))

// ── expired-link page (stale sandbox host) ────────────────────────────────────
const expiredPage = () => `<!doctype html><meta charset=utf-8><title>Sandbox expired</title>
<style>body{font:16px/1.6 system-ui;max-width:34rem;margin:12vh auto;padding:0 1.5rem;color:#0f172a}a{color:#0d9488}</style>
<h1>This sandbox has ended ⏳</h1><p>tuvl sandboxes are temporary and get cleaned up automatically.
Head back and spin up a fresh one.</p><p><a href="${SANDBOX_SCHEME}://${PORTAL_HOST}/">← Back to the tuvl examples</a></p>`

// ── unified server: sandbox proxy OR portal ───────────────────────────────────
const proxy = httpProxy.createProxyServer({ xfwd: true })
proxy.on('error', (_err, _req, res) => {
  if (res && res.writeHead && !res.headersSent) {
    res.writeHead(502, { 'content-type': 'text/html' })
    res.end('<h1>Sandbox is still starting…</h1><p>Give it a few seconds and refresh.</p>')
  }
})

const server = http.createServer((req, res) => {
  const host = (req.headers.host || '').split(':')[0]
  const id = sandboxIdFromHost(host)
  if (id) {
    const sb = sandboxes.get(id)
    if (sb) return proxy.web(req, res, { target: `http://${upstreamHost(id)}` })
    res.writeHead(410, { 'content-type': 'text/html' })
    return res.end(expiredPage())
  }
  app(req, res)
})

server.on('upgrade', (req, socket, head) => {
  const host = (req.headers.host || '').split(':')[0]
  const id = sandboxIdFromHost(host)
  if (id && sandboxes.has(id)) {
    proxy.ws(req, socket, head, { target: `http://${upstreamHost(id)}` })
  } else {
    socket.destroy()
  }
})

// ── reaper ────────────────────────────────────────────────────────────────────
setInterval(() => {
  const now = Date.now()
  for (const sb of sandboxes.values()) {
    if (Date.parse(sb.expiresAt) <= now) teardown(sb.id, 'expired')
  }
}, 30_000)

reapOrphans()
  .then((n) => n && console.log(`reaped ${n} orphan sandbox container(s)`))
  .catch(() => {})

server.listen(PORT, () => {
  console.log(`portal on :${PORT} (portal host ${PORTAL_HOST}, sandboxes *.${BASE_DOMAIN}, TTL ${TTL_MS / 60000}m, max ${MAX_CONCURRENT})`)
})
