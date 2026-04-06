import type { FastifyInstance } from 'fastify'
import type { AppContainer } from '../../shared/container/index.js'
import { buildOidcProvider } from './config/OidcProvider.js'
import { registerOidcInteractionRoutes } from './interface/OidcInteractionRoutes.js'
import { createLogger } from '../../shared/logger/logger.js'

const logger = createLogger('oidc')

// OIDC protocol routes handled directly by oidc-provider
// Interaction routes (/oidc/interaction/*) are NOT included —
// they go through Fastify normally so our login handlers work
const OIDC_PROTOCOL_ROUTES = [
  '/oidc/auth',
  '/oidc/token',
  '/oidc/userinfo',
  '/oidc/jwks',
  '/oidc/introspect',
  '/oidc/revoke',
  '/oidc/end_session',
  '/oidc/device',
  '/oidc/backchannel',
  '/oidc/request',
  '/oidc/register',
  '/.well-known/openid-configuration',
]

function isOidcProtocolRoute(url: string): boolean {
  return OIDC_PROTOCOL_ROUTES.some((path) => url.startsWith(path))
}

export async function registerOidcModule(
  app: FastifyInstance,
  container: AppContainer,
): Promise<void> {
  const { cradle } = container

  const oidcProvider = await buildOidcProvider({
    config: cradle.config,
    redis: cradle.redis,
    userRepository: cradle.userRepository,
    applicationRepository: cradle.applicationRepository,
    signingKeyRepository: cradle.signingKeyRepository,
    keyEncryptionService: cradle.keyEncryptionService,
    logger,
  })

  // Catch internal oidc-provider errors that don't surface elsewhere
  oidcProvider.on('server_error', (ctx, err) => {
    console.error('=== OIDC SERVER ERROR ===')
    console.error('URL:', ctx?.req?.url)
    console.error('Error:', err)
    console.error('Stack:', err.stack)
    console.error('=========================')
  })

  const oidcCallback = oidcProvider.callback()

  // Intercept OIDC protocol routes in onRequest — BEFORE Fastify's body
  // parsing consumes the stream. reply.hijack() tells Fastify we've handled
  // the request so it stops all further processing.
  app.addHook('onRequest', async (request, reply) => {
    const url = request.raw.url ?? ''
    if (isOidcProtocolRoute(url)) {
      reply.hijack()
      await oidcCallback(request.raw, reply.raw)
    }
  })

  // Interaction routes go through Fastify normally — our login handlers
  // need Fastify's JSON body parsing to work
  await registerOidcInteractionRoutes(app, {
    oidcProvider,
    loginUserUseCase: cradle.loginUserUseCase,
    logger,
  })

  // Remove the old app.all('/oidc/*') and app.get('/.well-known/...') routes
  // if they exist in app.ts — the hook above replaces them

  logger.info({ issuer: cradle.config.IDP_ISSUER }, 'OIDC provider mounted')
}