import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify'
import type { Cradle } from '../../../shared/container/index.js'

// Reuse the session auth helper from M04 — resolves userId from Bearer token
async function requireSession(
  request: FastifyRequest,
  reply: FastifyReply,
): Promise<string | null> {
  const { sessionStore } = request.container.cradle as Cradle
  const auth = request.headers.authorization
  if (!auth?.startsWith('Bearer ')) {
    reply.status(401).send({ code: 'UNAUTHORIZED', message: 'Missing session token' })
    return null
  }
  const token = auth.slice(7)
  const result = await sessionStore.get(token)
  if (result.isErr()) {
    reply.status(401).send({ code: 'UNAUTHORIZED', message: 'Invalid or expired session' })
    return null
  }
  return result.value.userId
}

export async function registerMfaRoutes(app: FastifyInstance): Promise<void> {

  // GET /auth/mfa/status
  app.get('/auth/mfa/status', async (request: FastifyRequest, reply: FastifyReply) => {
    const userId = await requireSession(request, reply)
    if (!userId) return

    const { getMfaStatusUseCase } = request.container.cradle as Cradle
    const result = await getMfaStatusUseCase.execute(userId)
    if (result.isErr()) throw result.error

    const status = result.value
    return reply.send({
      enabled: status.enabled,
      pending: status.pending,
      hasBackupCodes: status.hasBackupCodes,
      fullyEnrolled: status.isFullyEnrolled(),
    })
  })

  // POST /auth/mfa/totp/setup
  app.post('/auth/mfa/totp/setup', async (request: FastifyRequest, reply: FastifyReply) => {
    const userId = await requireSession(request, reply)
    if (!userId) return

    const { setupTotpUseCase } = request.container.cradle as Cradle
    const result = await setupTotpUseCase.execute(userId)
    if (result.isErr()) throw result.error

    return reply.status(200).send(result.value)
  })

  // POST /auth/mfa/totp/verify
  app.post('/auth/mfa/totp/verify', async (request: FastifyRequest, reply: FastifyReply) => {
    const userId = await requireSession(request, reply)
    if (!userId) return

    const body = request.body as { code?: string }
    if (!body.code) {
      return reply.status(422).send({ code: 'VALIDATION_ERROR', message: 'code is required' })
    }

    const { verifyTotpSetupUseCase } = request.container.cradle as Cradle
    const result = await verifyTotpSetupUseCase.execute(userId, body.code)
    if (result.isErr()) throw result.error

    return reply.status(200).send({
      message: 'MFA activated successfully',
      backupCodes: result.value.backupCodes,
    })
  })

  // POST /auth/mfa/totp/validate
  app.post('/auth/mfa/totp/validate', async (request: FastifyRequest, reply: FastifyReply) => {
    const userId = await requireSession(request, reply)
    if (!userId) return

    const body = request.body as { code?: string }
    if (!body.code) {
      return reply.status(422).send({ code: 'VALIDATION_ERROR', message: 'code is required' })
    }

    const { validateTotpUseCase } = request.container.cradle as Cradle
    const result = await validateTotpUseCase.execute(userId, body.code)
    if (result.isErr()) throw result.error

    return reply.status(200).send({ message: 'TOTP validated successfully' })
  })

  // POST /auth/mfa/backup-codes/generate
  app.post('/auth/mfa/backup-codes/generate', async (request: FastifyRequest, reply: FastifyReply) => {
    const userId = await requireSession(request, reply)
    if (!userId) return

    const { generateBackupCodesUseCase } = request.container.cradle as Cradle
    const result = await generateBackupCodesUseCase.execute(userId)
    if (result.isErr()) throw result.error

    return reply.status(200).send({
      backupCodes: result.value,
      message: 'Store these codes safely. They will not be shown again.',
    })
  })

  // POST /auth/mfa/backup-codes/use
  app.post('/auth/mfa/backup-codes/use', async (request: FastifyRequest, reply: FastifyReply) => {
    const userId = await requireSession(request, reply)
    if (!userId) return

    const body = request.body as { code?: string }
    if (!body.code) {
      return reply.status(422).send({ code: 'VALIDATION_ERROR', message: 'code is required' })
    }

    const { useBackupCodeUseCase } = request.container.cradle as Cradle
    const result = await useBackupCodeUseCase.execute(userId, body.code)
    if (result.isErr()) throw result.error

    return reply.status(200).send({ message: 'Backup code accepted' })
  })
}