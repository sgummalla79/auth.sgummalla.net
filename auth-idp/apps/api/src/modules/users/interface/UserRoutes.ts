import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify'
import { isAppError } from '../../../shared/errors/AppError.js'
import type { RegisterUserUseCase } from '../application/use-cases/RegisterUser.js'
import type { LoginUserUseCase } from '../application/use-cases/LoginUser.js'
import type { GetUserProfileUseCase, UpdateUserProfileUseCase } from '../application/use-cases/UserProfile.js'
import type { ISessionStore } from '../application/ports/ISessionStore.js'
import { requireAuth } from './AuthMiddleware.js'

interface Deps {
  registerUserUseCase: RegisterUserUseCase
  loginUserUseCase: LoginUserUseCase
  getUserProfileUseCase: GetUserProfileUseCase
  updateUserProfileUseCase: UpdateUserProfileUseCase
  sessionStore: ISessionStore
}

function sendError(reply: FastifyReply, e: unknown, traceId: string) {
  return reply.status(isAppError(e) ? e.statusCode : 500).send({
    ...(isAppError(e) ? e.toJSON() : { code: 'INTERNAL_ERROR', message: 'Unknown error' }),
    traceId,
  })
}

export async function registerUserRoutes(app: FastifyInstance, deps: Deps): Promise<void> {
  const { registerUserUseCase, loginUserUseCase, getUserProfileUseCase, updateUserProfileUseCase, sessionStore } = deps

  app.post('/auth/register',
    { config: { rateLimit: { max: 10, timeWindow: '1 minute' } } },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const result = await registerUserUseCase.execute(request.body)
      if (result.isErr()) return sendError(reply, result.error, request.id)
      const { user } = result.value
      return reply.status(201).send({
        id: user.id, email: user.email, status: user.status, createdAt: user.createdAt,
        message: 'Account created. Please verify your email.',
      })
    },
  )

  app.post('/auth/login',
    { config: { rateLimit: { max: 20, timeWindow: '1 minute' } } },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const result = await loginUserUseCase.execute(request.body)
      if (result.isErr()) return sendError(reply, result.error, request.id)
      return reply.status(200).send(result.value)
    },
  )

  app.post('/auth/logout',
    { preHandler: requireAuth(sessionStore) },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const token = request.headers['authorization']?.replace('Bearer ', '').trim()
      if (token) await sessionStore.delete(token)
      return reply.status(200).send({ message: 'Logged out successfully' })
    },
  )

  app.get('/auth/me',
    { preHandler: requireAuth(sessionStore) },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const result = await getUserProfileUseCase.execute(request.userId)
      if (result.isErr()) return sendError(reply, result.error, request.id)
      const { user, profile } = result.value
      return reply.status(200).send({
        id: user.id, email: user.email, emailVerified: user.emailVerified,
        status: user.status, givenName: profile.givenName, familyName: profile.familyName,
        displayName: profile.displayName, pictureUrl: profile.pictureUrl,
        locale: profile.locale, zoneinfo: profile.zoneinfo,
        lastLoginAt: user.lastLoginAt, createdAt: user.createdAt,
      })
    },
  )

  app.patch('/auth/me',
    { preHandler: requireAuth(sessionStore) },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const result = await updateUserProfileUseCase.execute(request.userId, request.body)
      if (result.isErr()) return sendError(reply, result.error, request.id)
      return reply.status(200).send(result.value)
    },
  )
}