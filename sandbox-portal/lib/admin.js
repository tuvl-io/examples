// Admin sign-in with Google (OpenID Connect, authorization-code flow). Only ADMIN_EMAIL gets in.
import crypto from 'node:crypto'

const CLIENT_ID = process.env.GOOGLE_CLIENT_ID || ''
const CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET || ''
export const ADMIN_EMAIL = (process.env.ADMIN_EMAIL || 'sooraj@tuvl.io').trim().toLowerCase()
const SECRET = process.env.ADMIN_SESSION_SECRET || crypto.randomBytes(32).toString('hex')
const SESSION_MS = 8 * 3600 * 1000

export const adminConfigured = () => !!(CLIENT_ID && CLIENT_SECRET)

const b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64url')
const mac = (s) => crypto.createHmac('sha256', SECRET).update(s).digest('base64url')

export function sign(payload) {
  const body = b64(payload)
  return `${body}.${mac(body)}`
}
export function verify(token) {
  if (!token || !token.includes('.')) return null
  const [body, sig] = token.split('.')
  const want = mac(body)
  if (sig.length !== want.length || !crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(want))) return null
  try {
    const p = JSON.parse(Buffer.from(body, 'base64url').toString())
    return p.exp > Date.now() ? p : null
  } catch { return null }
}

export const issueAdminCookie = () => sign({ email: ADMIN_EMAIL, exp: Date.now() + SESSION_MS })
export const isAdmin = (token) => verify(token)?.email === ADMIN_EMAIL

export function loginRedirect(origin) {
  const state = crypto.randomBytes(16).toString('base64url')
  const nonce = crypto.randomBytes(16).toString('base64url')
  const url = new URL('https://accounts.google.com/o/oauth2/v2/auth')
  url.search = new URLSearchParams({
    client_id: CLIENT_ID, redirect_uri: `${origin}/admin/callback`, response_type: 'code',
    scope: 'openid email', state, nonce, prompt: 'select_account', login_hint: ADMIN_EMAIL,
  }).toString()
  return { url: url.toString(), cookie: sign({ state, nonce, exp: Date.now() + 10 * 60 * 1000 }), state }
}

// Returns the verified email, or throws.
export async function finishLogin({ origin, code, state, stateCookie }) {
  const st = verify(stateCookie)
  if (!st || st.state !== state) throw new Error('bad_state')
  const r = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ code, client_id: CLIENT_ID, client_secret: CLIENT_SECRET, redirect_uri: `${origin}/admin/callback`, grant_type: 'authorization_code' }),
  })
  const tok = await r.json()
  if (!r.ok || !tok.id_token) throw new Error('token_exchange_failed')
  // the token came straight from Google over TLS, so its claims are checked rather than its signature
  const c = JSON.parse(Buffer.from(tok.id_token.split('.')[1], 'base64url').toString())
  if (!['https://accounts.google.com', 'accounts.google.com'].includes(c.iss)) throw new Error('bad_issuer')
  if (c.aud !== CLIENT_ID) throw new Error('bad_audience')
  if (c.exp * 1000 < Date.now()) throw new Error('expired')
  if (c.nonce !== st.nonce) throw new Error('bad_nonce')
  if (c.email_verified !== true) throw new Error('email_not_verified')
  return String(c.email).toLowerCase()
}
