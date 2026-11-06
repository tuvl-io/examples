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
import crypto from 'node:crypto'
import { createSession, getSession, recordLaunch, recordVisit, touchPresence, flushPresence } from './lib/store.js'
import { buildDashboard, peopleCsv } from './lib/stats.js'
import { ADMIN_EMAIL, adminConfigured, isAdmin, issueAdminCookie, loginRedirect, finishLogin } from './lib/admin.js'
import {
  createDb,
  dropDb,
  runSandbox,
  killSandbox,
  reapOrphans,
  dropAllSandboxDbs,
  waitReady,
  upstreamHost,
  uiUpstreamHost,
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
    url: sandboxUrl(sb.id) + (EXAMPLE_BY_ID[sb.exampleId]?.ui ? '/ui/' : ''),
    insightUrl: EXAMPLE_BY_ID[sb.exampleId]?.ui ? sandboxUrl(sb.id) + '/insight/' : undefined,
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
  recordLaunch({
    event: 'teardown', id, runId: sb.runId, exampleId: sb.exampleId, email: sb.email, reason,
    wallSec: Math.round((Date.now() - Date.parse(sb.createdAt)) / 1000),
    activeSec: sb.activeBuckets * 30, requests: sb.requests, opened: !!sb.firstHit,
    openedAfterSec: sb.firstHit ? Math.round((sb.firstHit - Date.parse(sb.createdAt)) / 1000) : null,
  })
}

// Count a sandbox request as activity: one 30-second window per window that saw traffic.
function noteActivity(sb) {
  const now = Date.now()
  sb.requests += 1
  sb.firstHit ||= now
  const bucket = Math.floor(now / 30000)
  if (bucket !== sb.lastBucket) {
    sb.lastBucket = bucket
    sb.activeBuckets += 1
  }
}

// ── small per-IP limiter for the unauthenticated tracking endpoints ───────────
const hits = new Map()
const clientIp = (req) => String(req.headers['x-forwarded-for'] || req.socket.remoteAddress || '').split(',')[0].trim()
function limited(req, res, perMinute) {
  const k = `${req.path}|${clientIp(req)}`
  const now = Date.now()
  const h = (hits.get(k) || []).filter((t) => now - t < 60000)
  h.push(now)
  hits.set(k, h)
  if (h.length > perMinute) { res.status(429).json({ error: 'slow_down' }); return true }
  return false
}
setInterval(() => { const cut = Date.now() - 60000; for (const [k, v] of hits) if (!v.some((t) => t > cut)) hits.delete(k) }, 60000)

const clip = (v, n) => String(v ?? '').slice(0, n)

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
  if (limited(req, res, 10)) return
  const name = clip(req.body?.name, 100).trim()
  const email = clip(req.body?.email, 254).trim()
  if (!name || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return res.status(400).json({ error: 'name and a valid email are required' })
  }
  const s = createSession({ name, email, vid: parseCookies(req).sbv })
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
    runId: crypto.randomBytes(8).toString('hex'),
    requests: 0,
    activeBuckets: 0,
    lastBucket: 0,
    firstHit: 0,
  }
  sandboxes.set(id, sb)
  recordLaunch({ event: 'launch', id, runId: sb.runId, exampleId: ex.id, name: sb.name, email: sb.email })

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

// anonymous visit + time-on-page, tied to a random visitor id (no personal data)
const ensureVid = (req, res) => {
  let vid = parseCookies(req).sbv
  if (!/^[\w-]{10,40}$/.test(vid || '')) {
    vid = crypto.randomBytes(12).toString('base64url')
    res.append('Set-Cookie', `sbv=${vid}; HttpOnly; Path=/; Max-Age=31536000; SameSite=Lax${SANDBOX_SCHEME === 'https' ? '; Secure' : ''}`)
  }
  return vid
}
app.post('/api/hit', (req, res) => {
  if (limited(req, res, 20)) return
  const vid = ensureVid(req, res)
  const b = req.body || {}
  recordVisit({ vid, ref: clip(b.ref, 200), utm_source: clip(b.utm_source, 60), utm_medium: clip(b.utm_medium, 60), utm_campaign: clip(b.utm_campaign, 60) })
  res.json({ ok: true })
})
app.post('/api/ping', (req, res) => {
  if (limited(req, res, 8)) return
  const vid = ensureVid(req, res)
  const sec = Math.min(35, Math.max(0, Number(req.body?.s) || 0))
  if (sec) touchPresence(vid, sec)
  res.json({ ok: true })
})

// ── admin dashboard: Google sign-in, ADMIN_EMAIL only ────────────────────────
const origin = `${SANDBOX_SCHEME}://${PORTAL_HOST}`
const cookieFlags = `HttpOnly; Path=/admin; SameSite=Lax${SANDBOX_SCHEME === 'https' ? '; Secure' : ''}`
const adminOnly = (req, res, next) => {
  res.setHeader('Cache-Control', 'no-store')
  if (isAdmin(parseCookies(req).sbadmin)) return next()
  if (req.path.startsWith('/admin/api/') || req.path === '/admin/export.csv') return res.status(401).json({ error: 'admin_only' })
  res.redirect('/admin/login')
}
const adminPage = (title, body) => `<!doctype html><meta charset=utf-8><title>${title}</title><style>body{font:16px/1.6 system-ui;max-width:32rem;margin:14vh auto;padding:0 1.5rem;color:#0f172a}a{color:#0d9488}</style>${body}`
app.get('/admin/login', (_req, res) => {
  if (!adminConfigured()) return res.status(503).send(adminPage('Admin', '<h1>Admin sign-in is not configured</h1><p>Set GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET on the server.</p>'))
  const l = loginRedirect(origin)
  res.append('Set-Cookie', `sbstate=${l.cookie}; Max-Age=600; ${cookieFlags}`)
  res.redirect(l.url)
})
app.get('/admin/callback', async (req, res) => {
  try {
    const email = await finishLogin({ origin, code: String(req.query.code || ''), state: String(req.query.state || ''), stateCookie: parseCookies(req).sbstate })
    if (email !== ADMIN_EMAIL) throw new Error('not_admin')
    res.append('Set-Cookie', `sbadmin=${issueAdminCookie()}; Max-Age=28800; ${cookieFlags}`)
    res.append('Set-Cookie', `sbstate=; Max-Age=0; ${cookieFlags}`)
    res.redirect('/admin')
  } catch (err) {
    console.warn('admin login refused:', err.message)
    res.status(403).send(adminPage('Not allowed', '<h1>Not allowed</h1><p>This dashboard is for the tuvl admin only.</p><p><a href="/">Back to tuvl try</a></p>'))
  }
})
app.get('/admin/logout', (_req, res) => {
  res.append('Set-Cookie', `sbadmin=; Max-Age=0; ${cookieFlags}`)
  res.redirect('/')
})
const dashboard = () => buildDashboard({ live: [...sandboxes.values()], examples: EXAMPLES })
app.get('/admin', adminOnly, (_req, res) => res.sendFile(path.join(__dirname, 'admin.html')))
app.get('/admin/api/data', adminOnly, (_req, res) => res.json(dashboard()))
app.get('/admin/export.csv', adminOnly, (_req, res) => {
  res.setHeader('Content-Type', 'text/csv; charset=utf-8')
  res.setHeader('Content-Disposition', 'attachment; filename="tuvl-try-people.csv"')
  res.send(peopleCsv(dashboard()))
})

app.get('/healthz', (_req, res) => res.json({ ok: true, active: sandboxes.size }))
app.use(express.static(path.join(__dirname, 'public')))
app.get('*', (_req, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')))

// ── expired-link page (stale sandbox host) ────────────────────────────────────
const expiredPage = () => `<!doctype html><meta charset=utf-8><title>Sandbox expired</title>
<style>body{font:16px/1.6 system-ui;max-width:34rem;margin:12vh auto;padding:0 1.5rem;color:#0f172a}a{color:#0d9488}</style>
<h1>This sandbox has ended ⏳</h1><p>tuvl sandboxes are temporary and get cleaned up automatically.
Head back and spin up a fresh one.</p><p><a href="${SANDBOX_SCHEME}://${PORTAL_HOST}/">← Back to tuvl try</a></p>`

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
    if (sb) {
      noteActivity(sb)
      if (EXAMPLE_BY_ID[sb.exampleId]?.ui && (req.url === '/ui' || req.url.startsWith('/ui/') || req.url.startsWith('/ui?'))) {
        if (req.url === '/ui') {
          res.writeHead(302, { Location: '/ui/' })
          return res.end()
        }
        req.url = req.url.slice(3) || '/'
        return proxy.web(req, res, { target: `http://${uiUpstreamHost(id)}` })
      }
      return proxy.web(req, res, { target: `http://${upstreamHost(id)}` })
    }
    res.writeHead(410, { 'content-type': 'text/html' })
    return res.end(expiredPage())
  }
  app(req, res)
})

server.on('upgrade', (req, socket, head) => {
  const host = (req.headers.host || '').split(':')[0]
  const id = sandboxIdFromHost(host)
  if (id && sandboxes.has(id)) {
    noteActivity(sandboxes.get(id))
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

setInterval(flushPresence, 60_000)
for (const sig of ['SIGTERM', 'SIGINT']) process.on(sig, () => { flushPresence(); setTimeout(() => process.exit(0), 200) })

reapOrphans()
  .then((n) => n && console.log(`reaped ${n} orphan sandbox container(s)`))
  .then(() => dropAllSandboxDbs((name) => [...sandboxes.values()].some((sb) => sb.dbName === name)))
  .then((n) => n && console.log(`dropped ${n} orphan sandbox database(s)`))
  .catch(() => {})

server.listen(PORT, () => {
  console.log(`portal on :${PORT} (portal host ${PORTAL_HOST}, sandboxes *.${BASE_DOMAIN}, TTL ${TTL_MS / 60000}m, max ${MAX_CONCURRENT})`)
})
