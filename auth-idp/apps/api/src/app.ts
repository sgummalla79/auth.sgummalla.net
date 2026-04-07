import { registerKeyModule, registerKeyRoutes } from './modules/keys/index.js'
import Fastify, { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify'
import fastifyCookie from '@fastify/cookie'
import fastifyCors from '@fastify/cors'
import fastifyHelmet from '@fastify/helmet'
import fastifyRateLimit from '@fastify/rate-limit'
import { getConfig } from './shared/config/env.js'
import { createLogger } from './shared/logger/logger.js'
import { buildContainer, createRequestScope, AppContainer } from './shared/container/index.js'
import { isAppError } from './shared/errors/AppError.js'
import { checkPostgresHealth } from './infrastructure/database/postgres.client.js'
import { checkRedisHealth } from './infrastructure/cache/redis.client.js'
import { checkMongoHealth } from './infrastructure/mongo/mongo.client.js'
import { registerUserModule, registerUserRoutes } from './modules/users/index.js'
import { registerApplicationModule, registerApplicationRoutes } from './modules/applications/index.js'
import { registerOidcModule } from './modules/oidc/index.js'
import { registerSamlModule } from './modules/saml/index.js'
import { registerJwtAuthModule } from './modules/jwt/index.js'
import fastifyFormBody from '@fastify/formbody'
import { registerMfaModule } from './modules/mfa/index.js'
import { registerSessionModule } from './modules/sessions/index.js'

const logger = createLogger('app')

declare module 'fastify' {
  interface FastifyInstance { container: AppContainer }
  interface FastifyRequest { container: AppContainer }
}

export async function buildApp(): Promise<FastifyInstance> {
  const config = getConfig()

  const app = Fastify({
    logger: false,
    trustProxy: true,
    requestIdHeader: 'x-request-id',
    genReqId: () => crypto.randomUUID(),
  })

  await app.register(fastifyHelmet)
  await app.register(fastifyCors, {
    origin: config.NODE_ENV === 'production' ? [config.IDP_BASE_URL] : true,
    credentials: true,
  })
  await app.register(fastifyCookie, { secret: config.COOKIE_SECRET })
  await app.register(fastifyRateLimit, {
    max: 100,
    timeWindow: '1 minute',
    errorResponseBuilder: (_req, context) => ({
      code: 'RATE_LIMITED',
      message: `Too many requests. Try again in ${context.after}.`,
    }),
  })

  const container = buildContainer()
  registerKeyModule(container)
  registerUserModule(container)
  registerApplicationModule(container)
  await registerOidcModule(app, container) 
  await registerSamlModule(app)
  await registerJwtAuthModule(app)
  await registerMfaModule(app)
  await registerSessionModule(app)
  app.decorate('container', container)

  app.addHook('onRequest', async (request: FastifyRequest) => {
    request.container = createRequestScope(container, { traceId: request.id })
    logger.info({ traceId: request.id, method: request.method, url: request.url }, 'Request')
  })

  app.addHook('onResponse', async (request: FastifyRequest, reply: FastifyReply) => {
    await request.container.dispose()
    logger.info({ traceId: request.id, status: reply.statusCode, ms: reply.elapsedTime }, 'Response')
  })

  app.setErrorHandler((error: Error, request: FastifyRequest, reply: FastifyReply) => {
    if (isAppError(error)) {
      return reply.status(error.statusCode).send({ ...error.toJSON(), traceId: request.id })
    }
    logger.error({ traceId: request.id, err: error }, 'Unhandled error')
    return reply.status(500).send({ code: 'INTERNAL_ERROR', message: 'An unexpected error occurred.', traceId: request.id })
  })

  app.setNotFoundHandler((request: FastifyRequest, reply: FastifyReply) => {
    return reply.status(404).send({ code: 'NOT_FOUND', message: `Route ${request.method} ${request.url} not found.` })
  })

  await app.register(fastifyFormBody)

  await registerKeyRoutes(app, {
    getJwksUseCase: container.cradle.getJwksUseCase,
    generateSigningKeyUseCase: container.cradle.generateSigningKeyUseCase,
    rotateSigningKeyUseCase: container.cradle.rotateSigningKeyUseCase,
    config: container.cradle.config,
  })

  await registerUserRoutes(app, {
    registerUserUseCase: container.cradle.registerUserUseCase,
    loginUserUseCase: container.cradle.loginUserUseCase,
    getUserProfileUseCase: container.cradle.getUserProfileUseCase,
    updateUserProfileUseCase: container.cradle.updateUserProfileUseCase,
    sessionStore: container.cradle.sessionStore,
  })

  await registerApplicationRoutes(app, {
    registerApplicationUseCase: container.cradle.registerApplicationUseCase,
    getApplicationUseCase: container.cradle.getApplicationUseCase,
    listApplicationsUseCase: container.cradle.listApplicationsUseCase,
    updateApplicationUseCase: container.cradle.updateApplicationUseCase,
    config: container.cradle.config,
  })

  app.get('/health', async (_request: FastifyRequest, reply: FastifyReply) => {
    const [postgres, redis, mongodb] = await Promise.all([
      checkPostgresHealth(),
      checkRedisHealth(),
      checkMongoHealth(),
    ])
    const allHealthy = postgres && redis && mongodb
    return reply.status(allHealthy ? 200 : 503).send({
      status: allHealthy ? 'ok' : 'degraded',
      timestamp: new Date().toISOString(),
      services: { postgres: postgres ? 'ok' : 'error', redis: redis ? 'ok' : 'error', mongodb: mongodb ? 'ok' : 'error' },
    })
  })

  app.get('/ready', async (_request: FastifyRequest, reply: FastifyReply) => {
    return reply.status(200).send({ status: 'ready' })
  })

  return app
}