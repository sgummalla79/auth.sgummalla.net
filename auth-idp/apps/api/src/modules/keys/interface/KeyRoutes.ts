import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify'
import { isAppError, UnauthorizedError } from '../../../shared/errors/AppError.js'
import type { GetJwksUseCase } from '../application/use-cases/GetJwks.js'
import type { GenerateSigningKeyUseCase } from '../application/use-cases/GenerateSigningKey.js'
import type { RotateSigningKeyUseCase } from '../application/use-cases/RotateSigningKey.js'
import type { ISigningKeyRepository } from '../application/ports/ISigningKeyRepository.js'
import { GenerateKeySchema, RotateKeySchema } from './KeyDTOs.js'
import type { Env } from '../../../shared/config/env.js'
import { isErr } from '../../../shared/result/Result.js'
import type { AwilixContainer } from 'awilix'
import type { Cradle } from '../../../shared/container/index.js'

interface Deps {
  getJwksUseCase: GetJwksUseCase
  generateSigningKeyUseCase: GenerateSigningKeyUseCase
  rotateSigningKeyUseCase: RotateSigningKeyUseCase
  config: Env
  container: AwilixContainer<Cradle>
}

function makeAdminAuthHook(adminApiKey: string) {
  return async (request: FastifyRequest, reply: FastifyReply): Promise<void> => {
    const token = request.headers['authorization']?.replace('Bearer ', '').trim()
      ?? request.headers['x-admin-key'] as string | undefined
    if (!token || token !== adminApiKey) {
      const error = new UnauthorizedError('Invalid or missing admin API key')
      return reply.status(401).send({ ...error.toJSON(), traceId: request.id })
    }
  }
}

export async function registerKeyRoutes(
  app: FastifyInstance,
  { getJwksUseCase, generateSigningKeyUseCase, rotateSigningKeyUseCase, config, container }: Deps,
): Promise<void> {

  const requireSuperAdmin = makeAdminAuthHook(config.ADMIN_API_KEY)

  // ── Public JWKS endpoint (global — pre-M18 legacy) ────────────────────────
  app.get('/.well-known/jwks.json',
    { config: { rateLimit: { max: 300, timeWindow: '1 minute' } } },
    async (_request: FastifyRequest, reply: FastifyReply) => {
      // Legacy global JWKS — returns empty after M15 since keys are now per-org
      return reply
        .header('Cache-Control', 'public, max-age=3600')
        .send({ keys: [] })
    },
  )

  // ── Admin routes (legacy generate/rotate — pre-M15) ───────────────────────
  await app.register(async (adminApp) => {
    adminApp.addHook('onRequest', makeAdminAuthHook(config.ADMIN_API_KEY))

    adminApp.post('/api/v1/admin/keys/generate',
      { schema: { body: GenerateKeySchema } },
      async (request: FastifyRequest, reply: FastifyReply) => {
        const body = request.body as { organizationId?: string; algorithm?: string; expiresInDays?: number }
        const result = await generateSigningKeyUseCase.execute({
          organizationId: body.organizationId ?? '',
          algorithm:      (body.algorithm ?? 'RS256') as 'RS256' | 'RS384' | 'RS512' | 'ES256' | 'ES384' | 'ES512',
          expiresInDays:  body.expiresInDays ?? 365,
        })
        if (isErr(result)) {
          const e = result.error
          return reply.status(isAppError(e) ? e.statusCode : 500).send({
            ...(isAppError(e) ? e.toJSON() : { code: 'INTERNAL_ERROR', message: 'Unknown error' }),
            traceId: request.id,
          })
        }
        return reply.status(201).send({
          kid:       result.value.kid,
          algorithm: result.value.algorithm,
          status:    result.value.status,
          expiresAt: result.value.expiresAt,
          createdAt: result.value.createdAt,
        })
      },
    )

    adminApp.post('/api/v1/admin/keys/rotate',
      { schema: { body: RotateKeySchema } },
      async (request: FastifyRequest, reply: FastifyReply) => {
        const body = request.body as { organizationId?: string; algorithm?: string; expiresInDays?: number }
        const result = await rotateSigningKeyUseCase.execute({
          organizationId: body.organizationId ?? '',
          algorithm:      (body.algorithm ?? 'RS256') as 'RS256' | 'RS384' | 'RS512' | 'ES256' | 'ES384' | 'ES512',
          expiresInDays:  body.expiresInDays ?? 365,
        })
        if (isErr(result)) {
          const e = result.error
          return reply.status(isAppError(e) ? e.statusCode : 500).send({
            ...(isAppError(e) ? e.toJSON() : { code: 'INTERNAL_ERROR', message: 'Unknown error' }),
            traceId: request.id,
          })
        }
        return reply.status(201).send({
          kid:       result.value.kid,
          algorithm: result.value.algorithm,
          status:    result.value.status,
          expiresAt: result.value.expiresAt,
          createdAt: result.value.createdAt,
          message:   'Key rotated. Previous key is now retired.',
        })
      },
    )
  })

  // ── GET /orgs/:orgId/keys ─────────────────────────────────────────────────
  app.get('/orgs/:orgId/keys',
    { preHandler: requireSuperAdmin },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { orgId } = request.params as { orgId: string }
      const scope = container.createScope()
      const repo = scope.resolve<ISigningKeyRepository>('signingKeyRepository')
      const result = await repo.listKeys(orgId)
      if (isErr(result)) {
        const e = result.error
        return reply.status(500).send({ code: e.code, message: e.message })
      }
      return reply.send({
        keys: result.value.map((k) => ({
          kid:       k.kid,
          algorithm: k.algorithm,
          status:    k.status,
          expiresAt: k.expiresAt,
          createdAt: k.createdAt,
        }))
      })
    },
  )

  // ── GET /orgs/:orgId/keys/jwks ────────────────────────────────────────────
  app.get('/orgs/:orgId/keys/jwks',
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { orgId } = request.params as { orgId: string }
      const result = await getJwksUseCase.execute(orgId)
      if (isErr(result)) {
        const e = result.error
        return reply.status(500).send({ code: e.code, message: e.message })
      }
      return reply
        .header('Cache-Control', 'public, max-age=300')
        .send(result.value)
    },
  )

  // ── POST /orgs/:orgId/keys/rotate ─────────────────────────────────────────
  app.post('/orgs/:orgId/keys/rotate',
    { preHandler: requireSuperAdmin },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { orgId } = request.params as { orgId: string }
      const body = request.body as { algorithm?: string; expiresInDays?: number } | undefined
      const result = await rotateSigningKeyUseCase.execute({
        organizationId: orgId,
        algorithm:      ((body?.algorithm) ?? 'RS256') as 'RS256' | 'RS384' | 'RS512' | 'ES256' | 'ES384' | 'ES512',
        expiresInDays:  body?.expiresInDays ?? 365,
      })
      if (isErr(result)) {
        const e = result.error
        return reply.status(isAppError(e) ? e.statusCode : 500).send({ code: e.code, message: e.message })
      }
      return reply.send(result.value)
    },
  )
}