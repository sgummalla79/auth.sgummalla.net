import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import type { Cradle } from '../../../shared/container/index.js'
import type { AwilixContainer } from 'awilix'

export async function registerOrganizationRoutes(
  app: FastifyInstance,
  container: AwilixContainer<Cradle>,
): Promise<void> {
  const requireSuperAdmin = async (request: any, reply: any) => {
    const key = request.headers['x-admin-key'] ?? request.headers['authorization']?.replace('Bearer ', '')
    if (key !== process.env['ADMIN_API_KEY']) {
      return reply.status(401).send({ code: 'UNAUTHORIZED', message: 'Invalid admin key' })
    }
  }

  // ── POST /admin/orgs ───────────────────────────────────────────────────────
  app.post('/admin/orgs', { preHandler: requireSuperAdmin }, async (request, reply) => {
    const bodySchema = z.object({
      name: z.string().min(2).max(100),
      slug: z.string().min(2).max(63).regex(/^[a-z0-9-]+$/).optional(),
      logoUrl: z.string().url().optional(),
      creatingUserId: z.string().uuid(),
    })

    const parsed = bodySchema.safeParse(request.body)
    if (!parsed.success) {
      return reply.status(422).send({
        code: 'VALIDATION_ERROR',
        errors: parsed.error.flatten().fieldErrors,
      })
    }

    const scope = container.createScope()
    const useCase = scope.resolve<any>('createOrganizationUseCase')
    const result = await useCase.execute(parsed.data)

    if (result.isErr()) {
      const e = result.error
      return reply.status(e.statusCode ?? 500).send({ code: e.code, message: e.message })
    }

    return reply.status(201).send(result.value)
  })

  // ── GET /admin/orgs ────────────────────────────────────────────────────────
  app.get('/admin/orgs', { preHandler: requireSuperAdmin }, async (_request, reply) => {
    const scope = container.createScope()
    const useCase = scope.resolve<any>('listOrganizationsUseCase')
    const result = await useCase.execute()

    if (result.isErr()) {
      const e = result.error
      return reply.status(e.statusCode ?? 500).send({ code: e.code, message: e.message })
    }

    return reply.send({ organizations: result.value })
  })

  // ── GET /admin/orgs/:orgId ─────────────────────────────────────────────────
  app.get('/admin/orgs/:orgId', { preHandler: requireSuperAdmin }, async (request, reply) => {
    const { orgId } = request.params as { orgId: string }
    const scope = container.createScope()
    const useCase = scope.resolve<any>('getOrganizationUseCase')
    const result = await useCase.execute(orgId)

    if (result.isErr()) {
      const e = result.error
      return reply.status(e.statusCode ?? 500).send({ code: e.code, message: e.message })
    }

    return reply.send(result.value)
  })

  // ── PATCH /admin/orgs/:orgId ───────────────────────────────────────────────
  app.patch('/admin/orgs/:orgId', { preHandler: requireSuperAdmin }, async (request, reply) => {
    const { orgId } = request.params as { orgId: string }

    const bodySchema = z.object({
      status: z.enum(['active', 'suspended']).optional(),
      name: z.string().min(2).max(100).optional(),
      logoUrl: z.string().url().optional(),
    })

    const parsed = bodySchema.safeParse(request.body)
    if (!parsed.success) {
      return reply.status(422).send({
        code: 'VALIDATION_ERROR',
        errors: parsed.error.flatten().fieldErrors,
      })
    }

    const scope = container.createScope()
    const useCase = scope.resolve<any>('updateOrganizationUseCase')
    const result = await useCase.execute(orgId, parsed.data)

    if (result.isErr()) {
      const e = result.error
      return reply.status(e.statusCode ?? 500).send({ code: e.code, message: e.message })
    }

    return reply.send(result.value)
  })
}