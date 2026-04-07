import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify'
import { eq, ilike, and, desc } from 'drizzle-orm'
import type { DrizzleClient } from '../../../infrastructure/database/postgres.client.js'
import { users, userProfiles, userMfa } from '../infrastructure/users.schema.js'
import type { Env } from '../../../shared/config/env.js'

interface Deps {
  db: DrizzleClient
  config: Env
}

export async function registerAdminUserRoutes(app: FastifyInstance, { db, config }: Deps): Promise<void> {

  app.addHook('onRequest', async (request, reply) => {
    const adminKey = request.headers.authorization?.replace('Bearer ', '')
    if (adminKey !== config.ADMIN_API_KEY) {
      return reply.status(401).send({ code: 'UNAUTHORIZED', message: 'Invalid admin key' })
    }
  })

  // GET /api/v1/admin/users
  app.get(
    '/api/v1/admin/users',
    async (request: FastifyRequest, reply: FastifyReply) => {
      const query = request.query as {
        email?: string
        status?: string
        limit?: string
        offset?: string
      }

      const limit = Math.min(parseInt(query.limit || '20', 10), 100)
      const offset = parseInt(query.offset || '0', 10)

      const conditions = []
      if (query.email) conditions.push(ilike(users.email, `%${query.email}%`))
      if (query.status) {
        conditions.push(eq(users.status, query.status as 'active' | 'inactive' | 'suspended' | 'pending_verification'))
      }

      const where = conditions.length > 0 ? and(...conditions) : undefined

      const rows = await db
        .select({
          id: users.id,
          email: users.email,
          emailVerified: users.emailVerified,
          status: users.status,
          mfaEnabled: users.mfaEnabled,
          lastLoginAt: users.lastLoginAt,
          createdAt: users.createdAt,
        })
        .from(users)
        .where(where)
        .orderBy(desc(users.createdAt))
        .limit(limit)
        .offset(offset)

      return reply.status(200).send({ users: rows, limit, offset })
    },
  )

  // GET /api/v1/admin/users/:id
  app.get<{ Params: { id: string } }>(
    '/api/v1/admin/users/:id',
    async (request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
      const userId = request.params.id

      const user = await db.query.users.findFirst({
        where: eq(users.id, userId),
      })

      if (!user) {
        return reply.status(404).send({ code: 'NOT_FOUND', message: 'User not found' })
      }

      const profile = await db.query.userProfiles.findFirst({
        where: eq(userProfiles.userId, userId),
      })

      const mfaFactors = await db
        .select({
          id: userMfa.id,
          type: userMfa.type,
          verified: userMfa.verified,
          name: userMfa.name,
          createdAt: userMfa.createdAt,
          lastUsedAt: userMfa.lastUsedAt,
        })
        .from(userMfa)
        .where(eq(userMfa.userId, userId))

      return reply.status(200).send({
        id: user.id,
        email: user.email,
        emailVerified: user.emailVerified,
        status: user.status,
        mfaEnabled: user.mfaEnabled,
        failedLoginAttempts: user.failedLoginAttempts,
        lockedUntil: user.lockedUntil,
        lastLoginAt: user.lastLoginAt,
        createdAt: user.createdAt,
        profile: profile
          ? {
              givenName: profile.givenName,
              familyName: profile.familyName,
              displayName: profile.displayName,
              pictureUrl: profile.pictureUrl,
              locale: profile.locale,
              zoneinfo: profile.zoneinfo,
            }
          : null,
        mfaFactors,
      })
    },
  )
}