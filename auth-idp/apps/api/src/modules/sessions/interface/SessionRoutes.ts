import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify'
import type { Cradle } from '../../../shared/container/index.js'

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

export async function registerSessionRoutes(app: FastifyInstance): Promise<void> {

  // GET /auth/sessions — list current user's active SSO sessions
  app.get('/auth/sessions', async (request: FastifyRequest, reply: FastifyReply) => {
    const userId = await requireSession(request, reply)
    if (!userId) return

    const { getUserSessionsUseCase } = request.container.cradle as Cradle
    const result = await getUserSessionsUseCase.execute(userId)
    if (result.isErr()) throw result.error

    return reply.send({
      sessions: result.value.map(s => ({
        id: s.id,
        createdAt: s.createdAt,
        expiresAt: s.expiresAt,
        participatingApps: s.participatingApps.map(a => ({
          appId: a.appId,
          protocol: a.protocol,
        })),
        active: s.isActive(),
      })),
    })
  })

  // DELETE /auth/sessions/:id — revoke a specific session
  app.delete<{ Params: { id: string } }>(
    '/auth/sessions/:id',
    async (request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
      const userId = await requireSession(request, reply)
      if (!userId) return

      const { revokeSessionUseCase } = request.container.cradle as Cradle
      const result = await revokeSessionUseCase.execute({
        sessionId: request.params.id,
        requestingUserId: userId,
      })
      if (result.isErr()) throw result.error

      return reply.status(200).send({ message: 'Session revoked' })
    },
  )

  // DELETE /auth/sessions — revoke all sessions (global logout)
  app.delete('/auth/sessions', async (request: FastifyRequest, reply: FastifyReply) => {
    const userId = await requireSession(request, reply)
    if (!userId) return

    const { revokeAllSessionsUseCase } = request.container.cradle as Cradle
    const result = await revokeAllSessionsUseCase.execute(userId)
    if (result.isErr()) throw result.error

    return reply.status(200).send({ message: 'All sessions revoked' })
  })

  // POST /api/v1/admin/sessions/revoke/:userId — admin force-logout
  app.post<{ Params: { userId: string } }>(
    '/api/v1/admin/sessions/revoke/:userId',
    async (request: FastifyRequest<{ Params: { userId: string } }>, reply: FastifyReply) => {
      const adminKey = request.headers.authorization?.replace('Bearer ', '')
      const { config } = request.container.cradle as Cradle
      if (adminKey !== config.ADMIN_API_KEY) {
        return reply.status(401).send({ code: 'UNAUTHORIZED', message: 'Invalid admin key' })
      }

      const { revokeAllSessionsUseCase } = request.container.cradle as Cradle
      const result = await revokeAllSessionsUseCase.execute(request.params.userId)
      if (result.isErr()) throw result.error

      return reply.status(200).send({ message: `All sessions revoked for user ${request.params.userId}` })
    },
  )
}