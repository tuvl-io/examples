// Tracking + in-memory session/sandbox state. Everything that happens is appended to JSONL files
// under DATA_DIR, so there is a durable audit trail without a database; lib/stats.js reads them back.
import fs from 'node:fs'
import path from 'node:path'
import crypto from 'node:crypto'

export const DATA_DIR = process.env.DATA_DIR || './data'
fs.mkdirSync(DATA_DIR, { recursive: true })
export const FILES = {
  signups: path.join(DATA_DIR, 'signups.jsonl'),
  launches: path.join(DATA_DIR, 'launches.jsonl'),
  visits: path.join(DATA_DIR, 'visits.jsonl'),
  presence: path.join(DATA_DIR, 'presence.jsonl'),
}

function append(file, obj) {
  fs.appendFile(file, JSON.stringify(obj) + '\n', () => {})
}

export function readJsonl(file) {
  let text = ''
  try { text = fs.readFileSync(file, 'utf8') } catch { return [] }
  const out = []
  for (const line of text.split('\n')) {
    if (!line) continue
    try { out.push(JSON.parse(line)) } catch { /* skip a torn line */ }
  }
  return out
}

// ── sessions (name + email lead capture) ─────────────────────────────────────
const sessions = new Map() // sid -> { name, email, createdAt }

export function createSession({ name, email, vid }) {
  const sid = crypto.randomBytes(18).toString('base64url')
  const rec = { sid, name, email, vid, createdAt: new Date().toISOString() }
  sessions.set(sid, rec)
  append(FILES.signups, rec)
  return rec
}
export function getSession(sid) {
  return sid ? sessions.get(sid) : undefined
}

// ── launch tracking ──────────────────────────────────────────────────────────
export function recordLaunch(rec) {
  append(FILES.launches, { ...rec, at: new Date().toISOString() })
}

// ── landing-page visits ──────────────────────────────────────────────────────
export function recordVisit(rec) {
  append(FILES.visits, { ...rec, at: new Date().toISOString() })
}

// ── time on the portal: one snapshot per visitor, rewritten while they stay ──
const presence = new Map() // vid -> { vid, firstSeen, lastSeen, activeSec, dirty }

export function touchPresence(vid, seconds) {
  const now = new Date().toISOString()
  const p = presence.get(vid) || { vid, firstSeen: now, activeSec: 0 }
  p.lastSeen = now
  p.activeSec += seconds
  p.dirty = true
  presence.set(vid, p)
}
export function flushPresence() {
  for (const p of presence.values()) {
    if (!p.dirty) continue
    p.dirty = false
    append(FILES.presence, { at: new Date().toISOString(), vid: p.vid, firstSeen: p.firstSeen, lastSeen: p.lastSeen, activeSec: p.activeSec })
  }
}
