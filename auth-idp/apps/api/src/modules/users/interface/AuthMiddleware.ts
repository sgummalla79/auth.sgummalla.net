import type { FastifyRequest, FastifyReply } from 'fastify'
import { UnauthorizedError } from '../../../shared/errors/AppError.js'
import type { ISessionStore } from '../application/ports/ISessionStore.js'

declare module 'fastify' {
  interface FastifyRequest { userId: string; userEmail: string }
}

export function requireAuth(sessionStore: ISessionStore) {
  return async (request: FastifyRequest, reply: FastifyReply): Promise<void> => {
    const token = request.headers['authorization']?.replace('Bearer ', '').trim()
    if (!token) {
      const error = new UnauthorizedError('Missing authorization token')
      return reply.status(401).send({ ...error.toJSON(), traceId: request.id })
    }
    const sessionResult = await sessionStore.get(token)
    if (sessionResult.isErr()) {
      const error = new UnauthorizedError('Invalid or expired session token')
      return reply.status(401).send({ ...error.toJSON(), traceId: request.id })
    }
    request.userId = sessionResult.value.userId
    request.userEmail = sessionResult.value.email
  }
}