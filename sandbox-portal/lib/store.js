// Tracking + in-memory session/sandbox state. Signups and launches are appended
// to JSONL files under DATA_DIR so you get a durable audit trail without a DB.
import fs from 'node:fs'
import path from 'node:path'
import crypto from 'node:crypto'

const DATA_DIR = process.env.DATA_DIR || './data'
fs.mkdirSync(DATA_DIR, { recursive: true })
const SIGNUPS = path.join(DATA_DIR, 'signups.jsonl')
const LAUNCHES = path.join(DATA_DIR, 'launches.jsonl')

function append(file, obj) {
  fs.appendFile(file, JSON.stringify(obj) + '\n', () => {})
}

// ── sessions (name + email lead capture) ─────────────────────────────────────
const sessions = new Map() // sid -> { name, email, createdAt }

export function createSession({ name, email }) {
  const sid = crypto.randomBytes(18).toString('base64url')
  const rec = { sid, name, email, createdAt: new Date().toISOString() }
  sessions.set(sid, rec)
  append(SIGNUPS, rec)
  return rec
}
export function getSession(sid) {
  return sid ? sessions.get(sid) : undefined
}

// ── launch tracking ──────────────────────────────────────────────────────────
export function recordLaunch(rec) {
  append(LAUNCHES, { ...rec, at: new Date().toISOString() })
}
