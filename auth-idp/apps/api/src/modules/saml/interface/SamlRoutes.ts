import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify'
import type { Cradle } from '../../../shared/container/index.js'

// ─── HTML helpers ─────────────────────────────────────────────────────────────

/**
 * Builds an auto-submitting HTML POST form.
 * Used for both SSO (posting to ACS) and SLO (posting to SP's SLO return URL).
 */
function buildAutoPostForm(endpoint: string, samlResponse: string, relayState?: string): string {
  const relayField = relayState
    ? `<input type="hidden" name="RelayState" value="${escapeHtml(relayState)}" />`
    : ''
  return `<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8"><title>Redirecting…</title></head>
<body>
  <noscript><p>JavaScript is required to complete authentication. Please enable it.</p></noscript>
  <form method="POST" action="${escapeHtml(endpoint)}" id="samlForm">
    <input type="hidden" name="SAMLResponse" value="${escapeHtml(samlResponse)}" />
    ${relayField}
  </form>
  <script>document.getElementById('samlForm').submit();</script>
</body>
</html>`
}

/** Builds a minimal login page that posts back to the SAML SSO endpoint. */
function buildLoginPage(appId: string, pendingNonce: string, error?: string): string {
  const errorHtml = error
    ? `<p style="color:#c00;margin-bottom:1rem;">${escapeHtml(error)}</p>`
    : ''
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>Sign In</title>
  <style>
    *{box-sizing:border-box}
    body{margin:0;font-family:system-ui,sans-serif;background:#f5f5f5;display:flex;align-items:center;justify-content:center;min-height:100vh}
    .card{background:#fff;border-radius:8px;box-shadow:0 2px 12px rgba(0,0,0,.12);padding:2rem;width:100%;max-width:400px}
    h1{margin:0 0 1.5rem;font-size:1.25rem;font-weight:600}
    label{display:block;font-size:.875rem;font-weight:500;margin-bottom:.25rem}
    input{width:100%;padding:.625rem .75rem;border:1px solid #d1d5db;border-radius:6px;font-size:.875rem;margin-bottom:1rem}
    input:focus{outline:2px solid #2563eb;border-color:transparent}
    button{width:100%;padding:.75rem;background:#2563eb;color:#fff;border:none;border-radius:6px;font-size:.875rem;font-weight:500;cursor:pointer}
    button:hover{background:#1d4ed8}
  </style>
</head>
<body>
  <div class="card">
    <h1>Sign In to Continue</h1>
    ${errorHtml}
    <form method="POST" action="/saml/${escapeHtml(appId)}/sso/login">
      <input type="hidden" name="pendingNonce" value="${escapeHtml(pendingNonce)}" />
      <label for="email">Email</label>
      <input id="email" type="email" name="email" required autocomplete="email" />
      <label for="password">Password</label>
      <input id="password" type="password" name="password" required autocomplete="current-password" />
      <button type="submit">Sign In</button>
    </form>
  </div>
</body>
</html>`
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
}

// ─── Routes ──────────────────────────────────────────────────────────────────

const SESSION_COOKIE = 'session_token'

export async function registerSamlRoutes(app: FastifyInstance): Promise<void> {

  // ── GET /saml/:appId/metadata ────────────────────────────────────────────
  app.get<{ Params: { appId: string } }>(
    '/saml/:appId/metadata',
    async (request: FastifyRequest<{ Params: { appId: string } }>, reply: FastifyReply) => {
      const { getIdpMetadataUseCase } = request.container.cradle as Cradle

      const result = await getIdpMetadataUseCase.execute(request.params.appId)
      if (result.isErr()) throw result.error

      return reply
        .header('Content-Type', 'application/xml; charset=utf-8')
        .send(result.value)
    },
  )

  // ── POST /saml/:appId/sso ────────────────────────────────────────────────
  // SP-initiated SSO entry point. Receives AuthnRequest (POST binding).
  app.post<{ Params: { appId: string } }>(
    '/saml/:appId/sso',
    async (request: FastifyRequest<{ Params: { appId: string } }>, reply: FastifyReply) => {
      const { handleSsoRequestUseCase, samlStateStore, sessionStore, logger } =
        request.container.cradle as Cradle

      const body = request.body as Record<string, string>
      const samlRequest = body.SAMLRequest
      const relayState  = body.RelayState

      if (!samlRequest) {
        return reply.status(400).send({ code: 'MISSING_SAML_REQUEST', message: 'SAMLRequest is required' })
      }

      const appId = request.params.appId

      // Check for existing IDP session
      const sessionToken = request.cookies[SESSION_COOKIE]
      if (sessionToken) {
        const sessionResult = await sessionStore.get(sessionToken)
        if (sessionResult.isOk()) {
          const { userId } = sessionResult.value

          const result = await handleSsoRequestUseCase.execute({
            appId,
            samlRequest,
            relayState,
            userId,
          })

          if (result.isErr()) throw result.error

          const { endpoint, samlResponse: samlResp, relayState: relay } = result.value
          return reply
            .header('Content-Type', 'text/html; charset=utf-8')
            .send(buildAutoPostForm(endpoint, samlResp, relay))
        }
        // Session token present but invalid/expired — fall through to login
        logger.debug({ appId }, 'Session token invalid, redirecting to SAML login')
      }

      // No valid session → store pending request, redirect to inline login page
      const storeResult = await samlStateStore.save({
        samlRequest,
        relayState,
        appId,
        createdAt: Date.now(),
      })

      if (storeResult.isErr()) throw storeResult.error

      const nonce = storeResult.value
      return reply
        .header('Content-Type', 'text/html; charset=utf-8')
        .send(buildLoginPage(appId, nonce))
    },
  )

  // ── GET /saml/:appId/sso/login ───────────────────────────────────────────
  // Direct access to the login page (e.g. from a bookmark or redirect).
  // Without a valid pending nonce this just shows an error.
  app.get<{ Params: { appId: string }; Querystring: { nonce?: string } }>(
    '/saml/:appId/sso/login',
    async (request, reply) => {
      const { nonce } = request.query
      if (!nonce) {
        return reply.status(400).send({ code: 'MISSING_NONCE', message: 'Start SSO from your application.' })
      }
      return reply
        .header('Content-Type', 'text/html; charset=utf-8')
        .send(buildLoginPage(request.params.appId, nonce))
    },
  )

  // ── POST /saml/:appId/sso/login ──────────────────────────────────────────
  // Credential submission from the inline login page.
  app.post<{ Params: { appId: string } }>(
    '/saml/:appId/sso/login',
    async (request: FastifyRequest<{ Params: { appId: string } }>, reply: FastifyReply) => {
      const body = request.body as Record<string, string>
      const { email, password, pendingNonce } = body
      const appId = request.params.appId

      if (!email || !password || !pendingNonce) {
        return reply
          .header('Content-Type', 'text/html; charset=utf-8')
          .send(buildLoginPage(appId, pendingNonce ?? '', 'Email, password, and a valid nonce are required.'))
      }

      const { samlStateStore, loginUserUseCase, handleSsoRequestUseCase } =
        request.container.cradle as Cradle

      // 1. Retrieve (and consume) the pending SAML request
      const stateResult = await samlStateStore.consume(pendingNonce)
      if (stateResult.isErr()) {
        return reply
          .header('Content-Type', 'text/html; charset=utf-8')
          .send(buildLoginPage(appId, '', 'Your login session has expired. Please return to the application and try again.'))
      }

      const { samlRequest, relayState } = stateResult.value

      // 2. Authenticate the user
      const loginResult = await loginUserUseCase.execute({ email, password })
      if (loginResult.isErr()) {
        // Restore the pending state so the user can try again
        await samlStateStore.save({ samlRequest, relayState, appId, createdAt: Date.now() })
        // Re-issue the nonce — we need a fresh one since we consumed the old one
        const restoreResult = await samlStateStore.save({ samlRequest, relayState, appId, createdAt: Date.now() })
        const freshNonce = restoreResult.isOk() ? restoreResult.value : ''

        const message = loginResult.error.code === 'UNAUTHORIZED'
          ? 'Invalid email or password.'
          : 'Too many failed attempts. Your account is temporarily locked.'

        return reply
          .header('Content-Type', 'text/html; charset=utf-8')
          .send(buildLoginPage(appId, freshNonce, message))
      }

      const { sessionToken, userId } = loginResult.value

      // Track SSO session
      const { createSsoSessionUseCase } = request.container.cradle as Cradle

      const ssoSessionResult = await createSsoSessionUseCase.execute({
        userId,
        idpSessionToken: sessionToken,
      })

      // 3. Build SAML response for the now-authenticated user
      const ssoResult = await handleSsoRequestUseCase.execute({
        appId,
        samlRequest,
        relayState,
        userId,
      })
      if (ssoResult.isErr()) throw ssoResult.error

      // Add app to SSO session
      if (ssoSessionResult.isOk()) {
        const { addParticipatingAppUseCase } = request.container.cradle as Cradle
        await addParticipatingAppUseCase.execute({
          sessionId: ssoSessionResult.value.id,
          app: { appId, protocol: 'saml' },
        })
      }

      const { endpoint, samlResponse: samlResp, relayState: relay } = ssoResult.value

      // 4. Set session cookie so future SSO flows skip the login page
      reply.setCookie(SESSION_COOKIE, sessionToken, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax',
        path: '/',
        maxAge: 24 * 60 * 60, // 1 day — matches M04 session TTL
      })

      return reply
        .header('Content-Type', 'text/html; charset=utf-8')
        .send(buildAutoPostForm(endpoint, samlResp, relay))
    },
  )

  // ── POST /saml/:appId/slo ────────────────────────────────────────────────
  // Single Logout — SP sends LogoutRequest; we respond with LogoutResponse.
  app.post<{ Params: { appId: string } }>(
    '/saml/:appId/slo',
    async (request: FastifyRequest<{ Params: { appId: string } }>, reply: FastifyReply) => {
      const { handleSloRequestUseCase } = request.container.cradle as Cradle

      const body = request.body as Record<string, string>
      const samlRequest = body.SAMLRequest
      const relayState  = body.RelayState

      if (!samlRequest) {
        return reply.status(400).send({ code: 'MISSING_SAML_REQUEST', message: 'SAMLRequest is required' })
      }

      const sessionToken = request.cookies[SESSION_COOKIE]

      const result = await handleSloRequestUseCase.execute({
        appId: request.params.appId,
        samlRequest,
        relayState,
        sessionToken,
      })
      if (result.isErr()) throw result.error

      const { endpoint, samlResponse: samlResp, relayState: relay } = result.value

      // Clear the IDP session cookie
      reply.clearCookie(SESSION_COOKIE, { path: '/' })

      return reply
        .header('Content-Type', 'text/html; charset=utf-8')
        .send(buildAutoPostForm(endpoint, samlResp, relay))
    },
  )
}