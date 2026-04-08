import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify'
import type { Cradle } from '../../../shared/container/index.js'
import type { AuditEventType } from '../domain/AuditEvent.js'
import { isErr } from '../../../shared/result/Result.js'

export async function registerAuditRoutes(app: FastifyInstance): Promise<void> {

  // All audit routes are admin-only
  async function requireAdmin(request: FastifyRequest, reply: FastifyReply): Promise<boolean> {
    const { config } = request.container.cradle as Cradle
    const key = request.headers.authorization?.replace('Bearer ', '')
    if (key !== config.ADMIN_API_KEY) {
      reply.status(401).send({ code: 'UNAUTHORIZED', message: 'Invalid admin key' })
      return false
    }
    return true
  }

  // GET /api/v1/admin/audit
  app.get(
    '/api/v1/admin/audit',
    async (request: FastifyRequest, reply: FastifyReply) => {
      if (!await requireAdmin(request, reply)) return

      const { queryAuditEventsUseCase } = request.container.cradle as Cradle
      const q = request.query as Record<string, string>

      const result = await queryAuditEventsUseCase.execute({
        userId: q.userId,
        appId: q.appId,
        type: q.type as AuditEventType | undefined,
        outcome: q.outcome as 'success' | 'failure' | undefined,
        from: q.from ? new Date(q.from) : undefined,
        to: q.to ? new Date(q.to) : undefined,
        limit: q.limit ? parseInt(q.limit, 10) : 50,
        offset: q.offset ? parseInt(q.offset, 10) : 0,
      })

      if (isErr(result)) throw result.error

      return reply.send({
        events: result.value.map(e => ({
          id: e.id,
          type: e.type,
          outcome: e.outcome,
          userId: e.userId,
          appId: e.appId,
          traceId: e.traceId,
          ipAddress: e.ipAddress,
          metadata: e.metadata,
          occurredAt: e.occurredAt,
        })),
        count: result.value.length,
      })
    },
  )

  // GET /api/v1/admin/audit/:eventId
  app.get<{ Params: { eventId: string } }>(
    '/api/v1/admin/audit/:eventId',
    async (request: FastifyRequest<{ Params: { eventId: string } }>, reply: FastifyReply) => {
      if (!await requireAdmin(request, reply)) return

      const { getAuditEventUseCase } = request.container.cradle as Cradle
      const result = await getAuditEventUseCase.execute(request.params.eventId)
      if (isErr(result)) throw result.error

      const e = result.value
      return reply.send({
        id: e.id,
        type: e.type,
        outcome: e.outcome,
        userId: e.userId,
        appId: e.appId,
        traceId: e.traceId,
        ipAddress: e.ipAddress,
        userAgent: e.userAgent,
        metadata: e.metadata,
        occurredAt: e.occurredAt,
      })
    },
  )
}