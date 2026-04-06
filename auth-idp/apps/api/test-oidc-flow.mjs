#!/usr/bin/env node

/**
 * test-oidc-flow.mjs
 *
 * Full OIDC authorization code flow test.
 * Handles cookies, redirects, PKCE, consent, token exchange and userinfo.
 *
 * Usage:
 *   node test-oidc-flow.mjs \
 *     --admin-key YOUR_ADMIN_KEY \
 *     --email alice@example.com \
 *     --password Password1
 *
 * Options:
 *   --base-url   http://localhost:3000  (default)
 *   --client-id  client_xxx            (skip registration, reuse existing)
 */

import { createHash, randomBytes } from 'crypto'
import { request as httpRequest } from 'http'
import { URL } from 'url'

// ─── Args ─────────────────────────────────────────────────────────────────────

const args = process.argv.slice(2)
const flag = (f) => { const i = args.indexOf(f); return i !== -1 ? args[i + 1] : null }

const BASE_URL         = flag('--base-url')   ?? 'http://localhost:3000'
const ADMIN_KEY        = flag('--admin-key')
const EMAIL            = flag('--email')      ?? 'alice@example.com'
const PASSWORD         = flag('--password')   ?? 'Password1'
const EXISTING_CLIENT  = flag('--client-id')
const REDIRECT_URI     = 'http://localhost:9999/callback'

if (!ADMIN_KEY) {
  console.error('\nUsage: node test-oidc-flow.mjs --admin-key KEY [--email E] [--password P]\n')
  process.exit(1)
}

// ─── PKCE ─────────────────────────────────────────────────────────────────────

const VERIFIER  = randomBytes(32).toString('base64url')
const CHALLENGE = createHash('sha256').update(VERIFIER).digest('base64url')

// ─── Cookie store ─────────────────────────────────────────────────────────────
// Stores cookies exactly as received, sends them back on every request.

const cookies = new Map()

function storeCookies(rawHeaders) {
  if (!rawHeaders) return
  const lines = Array.isArray(rawHeaders) ? rawHeaders : [rawHeaders]
  for (const line of lines) {
    const parts = line.split(';')
    const first = parts[0]?.trim()
    if (!first) continue
    const eq = first.indexOf('=')
    if (eq === -1) continue
    const name  = first.slice(0, eq).trim()
    const value = first.slice(eq + 1).trim()
    cookies.set(name, value)
  }
}

function cookieHeader() {
  return [...cookies.entries()].map(([k, v]) => `${k}=${v}`).join('; ')
}

// ─── Raw HTTP client ──────────────────────────────────────────────────────────
// Uses Node's built-in http module so we have full control over cookies
// and can suppress automatic redirect following when needed.

function rawRequest({ method, url, headers = {}, body = null, followRedirects = false }) {
  return new Promise((resolve, reject) => {
    const parsed   = new URL(url)
    const reqHeaders = {
      Host: parsed.host,
      Cookie: cookieHeader(),
      ...headers,
    }

    if (body && typeof body === 'string') {
      reqHeaders['Content-Length'] = Buffer.byteLength(body)
    }

    const req = httpRequest({
      method,
      hostname: parsed.hostname,
      port: parsed.port || 80,
      path: parsed.pathname + parsed.search,
      headers: reqHeaders,
    }, (res) => {
      // Store all set-cookie headers immediately
      const setCookies = res.headers['set-cookie'] ?? []
      storeCookies(setCookies)

      const location = res.headers['location']

      // Follow redirects if requested and response is a redirect
      if (followRedirects && location && res.statusCode >= 300 && res.statusCode < 400) {
        const nextUrl = location.startsWith('http')
          ? location
          : `${BASE_URL}${location}`

        // Don't follow if it's the callback (external)
        if (nextUrl.includes('localhost:9999')) {
          resolve({ statusCode: res.statusCode, headers: res.headers, body: '', location: nextUrl })
          return
        }

        rawRequest({ method: 'GET', url: nextUrl, followRedirects: true })
          .then(resolve)
          .catch(reject)
        return
      }

      let data = ''
      res.on('data', (chunk) => { data += chunk })
      res.on('end', () => {
        resolve({
          statusCode: res.statusCode,
          headers: res.headers,
          body: data,
          location,
        })
      })
    })

    req.on('error', reject)
    if (body) req.write(body)
    req.end()
  })
}

async function doGet(path, headers = {}, followRedirects = false) {
  const url = path.startsWith('http') ? path : `${BASE_URL}${path}`
  return rawRequest({ method: 'GET', url, headers, followRedirects })
}

async function doPost(path, body, contentType = 'application/json', headers = {}) {
  const url = path.startsWith('http') ? path : `${BASE_URL}${path}`
  const bodyStr = typeof body === 'string' ? body : JSON.stringify(body)
  return rawRequest({
    method: 'POST',
    url,
    headers: { 'Content-Type': contentType, ...headers },
    body: bodyStr,
  })
}

function parseJson(text) {
  try { return JSON.parse(text) } catch { return null }
}

// ─── Logger ───────────────────────────────────────────────────────────────────

const ok  = (m) => console.log(`  ✅ ${m}`)
const bad = (m) => console.log(`  ❌ ${m}`)
const inf = (m) => console.log(`  ℹ  ${m}`)
const sep = ()  => console.log('\n' + '─'.repeat(60))

// ─── Step 1 — Health check ────────────────────────────────────────────────────

async function step1_health() {
  sep()
  console.log('STEP 1 — Health check')

  const res  = await doGet('/health')
  const body = parseJson(res.body)

  if (body?.status === 'ok') {
    ok(`Services: ${JSON.stringify(body.services)}`)
  } else {
    bad(`Health check failed: ${res.body}`)
    process.exit(1)
  }
}

// ─── Step 2 — Get or register OIDC client ────────────────────────────────────

async function step2_client() {
  sep()
  console.log('STEP 2 — OIDC client')

  if (EXISTING_CLIENT) {
    inf(`Using existing client: ${EXISTING_CLIENT}`)
    return EXISTING_CLIENT
  }

  const name = `OIDC Test ${Date.now()}`
  const res  = await doPost(
    '/api/v1/admin/applications',
    { protocol: 'oidc', name, oidc: { redirectUris: [REDIRECT_URI], scopes: ['openid', 'email', 'profile'] } },
    'application/json',
    { Authorization: `Bearer ${ADMIN_KEY}` },
  )

  const body = parseJson(res.body)
  if (!body?.oidc?.clientId) {
    bad(`Registration failed (${res.statusCode}): ${res.body}`)
    process.exit(1)
  }

  ok(`App: ${body.name}`)
  ok(`Client ID: ${body.oidc.clientId}`)
  inf(`Client secret: oidc_${body.oidc.clientId}`)
  return body.oidc.clientId
}

// ─── Step 3 — Start auth flow ─────────────────────────────────────────────────

async function step3_startAuth(clientId) {
  sep()
  console.log('STEP 3 — Start authorization flow')

  const params = new URLSearchParams({
    client_id: clientId,
    response_type: 'code',
    redirect_uri: REDIRECT_URI,
    scope: 'openid email profile',
    state: 'test123',
    code_challenge: CHALLENGE,
    code_challenge_method: 'S256',
  })

  // Do NOT follow redirects — we need to capture the interaction UID
  const res = await doGet(`/oidc/auth?${params}`)

  inf(`Status: ${res.statusCode}`)
  inf(`Location: ${res.location}`)

  if (!res.location) {
    bad(`No redirect from /oidc/auth`)
    bad(`Body: ${res.body.slice(0, 300)}`)
    process.exit(1)
  }

  // Could redirect straight to callback if session already exists
  if (res.location.includes('localhost:9999')) {
    ok('Session already exists — skipping interaction')
    return { skipInteraction: true, callbackUrl: res.location }
  }

  const uid = res.location.split('/interaction/')[1]?.split('?')[0]
  if (!uid) {
    bad(`Cannot extract UID from: ${res.location}`)
    process.exit(1)
  }

  ok(`Interaction UID: ${uid}`)
  ok(`Cookies stored: ${[...cookies.keys()].join(', ')}`)
  return { uid, skipInteraction: false }
}

// ─── Step 4 — Get interaction details ────────────────────────────────────────

async function step4_getInteraction(uid) {
  sep()
  console.log('STEP 4 — Get interaction details')

  const res  = await doGet(`/oidc/interaction/${uid}`)
  const body = parseJson(res.body)

  if (!body || body.code === 'INTERACTION_ERROR') {
    bad(`Interaction error (${res.statusCode}): ${res.body}`)
    bad(`Cookies: ${cookieHeader().slice(0, 200)}`)
    process.exit(1)
  }

  ok(`Prompt: ${body.prompt?.name}`)
  inf(`Reasons: ${JSON.stringify(body.prompt?.reasons)}`)
  return body
}

// ─── Step 5 — Login ───────────────────────────────────────────────────────────

async function step5_login(uid) {
  sep()
  console.log('STEP 5 — Submit login')

  const res = await doPost(
    `/oidc/interaction/${uid}/login`,
    { email: EMAIL, password: PASSWORD },
    'application/json',
  )

  inf(`Status: ${res.statusCode}`)
  inf(`Location: ${res.location}`)

  if (!res.location) {
    bad(`Login failed (${res.statusCode}): ${res.body}`)
    process.exit(1)
  }

  ok(`Login accepted → ${res.location}`)
  return res.location
}

// ─── Step 6 — Grant consent ───────────────────────────────────────────────────

async function step6_consent(uid) {
  sep()
  console.log('STEP 6 — Grant consent')

  const res = await doPost(
    `/oidc/interaction/${uid}/confirm`,
    {},
    'application/json',
  )

  inf(`Status: ${res.statusCode}`)
  inf(`Location: ${res.location}`)

  if (!res.location) {
    bad(`Consent failed (${res.statusCode}): ${res.body}`)
    process.exit(1)
  }

  ok(`Consent granted → ${res.location}`)
  return res.location
}

// ─── Follow redirects until callback ─────────────────────────────────────────

async function followToCallback(location) {
  let current = location
  let hops    = 0

  while (hops++ < 15) {
    inf(`Following: ${current}`)

    // Reached callback
    if (current.includes('localhost:9999') || current.startsWith(REDIRECT_URI)) {
      return { type: 'callback', url: current }
    }

    // New interaction needed
    if (current.includes('/oidc/interaction/')) {
      const uid = current.split('/interaction/')[1]?.split('?')[0]
      return { type: 'interaction', uid }
    }

    // Follow the oidc/auth resume redirect
    const path = current.startsWith('http') ? current : `${BASE_URL}${current}`
    const res  = await doGet(path)

    if (!res.location) {
      // Could be a redirect to callback embedded in body
      if (res.body.includes(REDIRECT_URI)) {
        const match = res.body.match(/http:\/\/localhost:9999[^\s"'<]+/)
        if (match) return { type: 'callback', url: match[0] }
      }
      bad(`No location at hop ${hops} (${res.statusCode}): ${res.body.slice(0, 200)}`)
      process.exit(1)
    }

    current = res.location.startsWith('http')
      ? res.location
      : `${BASE_URL}${res.location}`
  }

  bad('Too many redirects')
  process.exit(1)
}

// ─── Step 7 — Token exchange ──────────────────────────────────────────────────

async function step7_token(code, clientId) {
  sep()
  console.log('STEP 7 — Exchange code for tokens')

  const body = new URLSearchParams({
    grant_type: 'authorization_code',
    code,
    redirect_uri: REDIRECT_URI,
    code_verifier: VERIFIER,
  }).toString()

  const credentials = Buffer.from(`${clientId}:oidc_${clientId}`).toString('base64')

  const res  = await doPost(
    '/oidc/token',
    body,
    'application/x-www-form-urlencoded',
    { Authorization: `Basic ${credentials}` },
  )

  const json = parseJson(res.body)

  if (json?.error) {
    bad(`Token error: ${json.error} — ${json.error_description}`)
    process.exit(1)
  }

  ok(`Access token : ${json.access_token?.slice(0, 40)}...`)
  ok(`ID token     : ${json.id_token?.slice(0, 40)}...`)
  ok(`Token type   : ${json.token_type}`)
  ok(`Expires in   : ${json.expires_in}s`)
  ok(`Scope        : ${json.scope}`)
  return json
}

// ─── Step 8 — UserInfo ────────────────────────────────────────────────────────

async function step8_userinfo(accessToken) {
  sep()
  console.log('STEP 8 — UserInfo')

  const res  = await doGet('/oidc/userinfo', { Authorization: `Bearer ${accessToken}` })
  const json = parseJson(res.body)

  if (json?.error) {
    bad(`UserInfo error: ${json.error}`)
    process.exit(1)
  }

  ok(`sub            : ${json.sub}`)
  ok(`email          : ${json.email}`)
  ok(`email_verified : ${json.email_verified}`)
  ok(`name           : ${json.name ?? json.given_name ?? 'n/a'}`)
  return json
}

// ─── Step 9 — Introspect ──────────────────────────────────────────────────────

async function step9_introspect(accessToken, clientId) {
  sep()
  console.log('STEP 9 — Token introspection')

  const body        = new URLSearchParams({ token: accessToken }).toString()
  const credentials = Buffer.from(`${clientId}:oidc_${clientId}`).toString('base64')

  const res  = await doPost(
    '/oidc/introspect',
    body,
    'application/x-www-form-urlencoded',
    { Authorization: `Basic ${credentials}` },
  )

  const json = parseJson(res.body)

  if (!json?.active) {
    bad(`Token not active: ${JSON.stringify(json)}`)
    process.exit(1)
  }

  ok(`Active    : ${json.active}`)
  ok(`Subject   : ${json.sub}`)
  ok(`Client    : ${json.client_id}`)
  ok(`Expires   : ${new Date(json.exp * 1000).toISOString()}`)
  return json
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  console.log('\n🔐 OIDC Authorization Code Flow Test')
  console.log(`   Base URL  : ${BASE_URL}`)
  console.log(`   Email     : ${EMAIL}`)
  console.log(`   Verifier  : ${VERIFIER.slice(0, 20)}...`)
  console.log(`   Challenge : ${CHALLENGE.slice(0, 20)}...`)

  await step1_health()

  const clientId = await step2_client()

  const authResult = await step3_startAuth(clientId)

  let code

  if (authResult.skipInteraction) {
    // Session existed — extract code directly
    const url  = new URL(authResult.callbackUrl)
    code = url.searchParams.get('code')
    ok(`Code from existing session: ${code?.slice(0, 20)}...`)
  } else {
    const { uid } = authResult

    const interaction = await step4_getInteraction(uid)
    const promptName  = interaction.prompt?.name

    let resumeLocation

    if (promptName === 'login') {
      resumeLocation = await step5_login(uid)
    } else if (promptName === 'consent') {
      inf('Consent prompt — granting immediately')
      resumeLocation = await step6_consent(uid)
    } else {
      bad(`Unexpected prompt: ${promptName}`)
      process.exit(1)
    }

    // Follow redirects to callback, handling consent along the way
    let result = await followToCallback(resumeLocation)

    if (result.type === 'interaction') {
      inf(`Consent required — UID: ${result.uid}`)
      const loc = await step6_consent(result.uid)
      result    = await followToCallback(loc)
    }

    if (result.type !== 'callback') {
      bad(`Expected callback, got: ${JSON.stringify(result)}`)
      process.exit(1)
    }

    const cbUrl  = new URL(result.url.startsWith('http') ? result.url : `http://x${result.url}`)
    code = cbUrl.searchParams.get('code')

    if (!code) {
      bad(`No code in callback URL: ${result.url}`)
      process.exit(1)
    }

    ok(`Authorization code: ${code.slice(0, 20)}...`)
  }

  const tokens = await step7_token(code, clientId)
  await step8_userinfo(tokens.access_token)
  await step9_introspect(tokens.access_token, clientId)

  sep()
  console.log('\n🎉 OIDC flow completed successfully!\n')
  console.log(`   access_token : ${tokens.access_token?.slice(0, 50)}...`)
  console.log(`   id_token     : ${tokens.id_token?.slice(0, 50)}...`)
  console.log(`   expires_in   : ${tokens.expires_in}s`)
  console.log(`   scope        : ${tokens.scope}`)
  console.log()
}

main().catch((e) => {
  console.error('\nFatal error:', e.message)
  console.error(e.stack)
  process.exit(1)
})
