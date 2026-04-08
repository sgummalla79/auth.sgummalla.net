import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify'
import { isAppError, UnauthorizedError } from '../../../shared/errors/AppError.js'
import type { GetJwksUseCase } from '../application/use-cases/GetJwks.js'
import type { GenerateSigningKeyUseCase } from '../application/use-cases/GenerateSigningKey.js'
import type { RotateSigningKeyUseCase } from '../application/use-cases/RotateSigningKey.js'
import { GenerateKeySchema, RotateKeySchema } from './KeyDTOs.js'
import type { Env } from '../../../shared/config/env.js'
import { isErr } from '../../../shared/result/Result.js'

interface Deps {
  getJwksUseCase: GetJwksUseCase
  generateSigningKeyUseCase: GenerateSigningKeyUseCase
  rotateSigningKeyUseCase: RotateSigningKeyUseCase
  config: Env
}

function makeAdminAuthHook(adminApiKey: string) {
  return async (request: FastifyRequest, reply: FastifyReply): Promise<void> => {
    const token = request.headers['authorization']?.replace('Bearer ', '').trim()
    
    // Temporary debug — remove after confirming
    console.log('Expected:', adminApiKey)
    console.log('Received:', token)
    console.log('Match:', token === adminApiKey)

    if (!token || token !== adminApiKey) {
      const error = new UnauthorizedError('Invalid or missing admin API key')
      return reply.status(401).send({ ...error.toJSON(), traceId: request.id })
    }
  }
}

export async function registerKeyRoutes(
  app: FastifyInstance,
  { getJwksUseCase, generateSigningKeyUseCase, rotateSigningKeyUseCase, config }: Deps,
): Promise<void> {

  // Public JWKS endpoint
  app.get('/.well-known/jwks.json',
    { config: { rateLimit: { max: 300, timeWindow: '1 minute' } } },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const result = await getJwksUseCase.execute()
      if (isErr(result)) {
        return reply.status(500).send({ code: 'INTERNAL_ERROR', message: 'Failed to retrieve keys' })
      }
      return reply
        .header('Cache-Control', 'public, max-age=3600')
        .send(result.value)
    },
  )

  // Admin routes
  await app.register(async (adminApp) => {
    adminApp.addHook('onRequest', makeAdminAuthHook(config.ADMIN_API_KEY))

    adminApp.post('/api/v1/admin/keys/generate',
      { schema: { body: GenerateKeySchema } },
      async (request: FastifyRequest, reply: FastifyReply) => {
        const body = request.body as { algorithm?: string; expiresInDays?: number }
        const result = await generateSigningKeyUseCase.execute({
          algorithm: body.algorithm as 'RS256' | undefined,
          expiresInDays: body.expiresInDays,
        })
        if (isErr(result)) {
          const e = result.error
          return reply.status(isAppError(e) ? e.statusCode : 500).send({
            ...(isAppError(e) ? e.toJSON() : { code: 'INTERNAL_ERROR', message: 'Unknown error' }),
            traceId: request.id,
          })
        }
        return reply.status(201).send({
          kid: result.value.kid,
          algorithm: result.value.algorithm,
          status: result.value.status,
          expiresAt: result.value.expiresAt,
          createdAt: result.value.createdAt,
        })
      },
    )

    adminApp.post('/api/v1/admin/keys/rotate',
      { schema: { body: RotateKeySchema } },
      async (request: FastifyRequest, reply: FastifyReply) => {
        const body = request.body as { algorithm?: string; expiresInDays?: number }
        const result = await rotateSigningKeyUseCase.execute({
          algorithm: body.algorithm as 'RS256' | undefined,
          expiresInDays: body.expiresInDays,
        })
        if (isErr(result)) {
          const e = result.error
          return reply.status(isAppError(e) ? e.statusCode : 500).send({
            ...(isAppError(e) ? e.toJSON() : { code: 'INTERNAL_ERROR', message: 'Unknown error' }),
            traceId: request.id,
          })
        }
        return reply.status(201).send({
          kid: result.value.kid,
          algorithm: result.value.algorithm,
          status: result.value.status,
          expiresAt: result.value.expiresAt,
          createdAt: result.value.createdAt,
          message: 'Key rotated. Previous key is now retired.',
        })
      },
    )
  })
}