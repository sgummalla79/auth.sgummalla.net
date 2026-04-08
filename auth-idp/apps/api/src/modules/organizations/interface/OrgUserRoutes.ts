import { randomUUID } from 'crypto'
import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify'
import { z } from 'zod'
import { isErr } from '../../../shared/result/Result.js'
import { isAppError } from '../../../shared/errors/AppError.js'
import type { ISessionStore } from '../../users/application/ports/ISessionStore.js'
import type { IUserRepository } from '../../users/application/ports/IUserRepository.js'
import type { IOrganizationUserRepository } from '../application/ports/IOrganizationUserRepository.js'
import type { IHashService } from '../../users/application/ports/IHashService.js'
import { makeRequireOrgAdmin } from './OrgAdminMiddleware.js'


interface Deps {
  userRepository: IUserRepository
  orgUserRepository: IOrganizationUserRepository
  sessionStore: ISessionStore
  hashService: IHashService
}

export async function registerOrgUserRoutes(
  app: FastifyInstance,
  deps: Deps,
): Promise<void> {
  const { userRepository, orgUserRepository, sessionStore, hashService } = deps
  const requireOrgAdmin = makeRequireOrgAdmin(sessionStore, orgUserRepository)

  // ── GET /orgs/:orgId/users ─────────────────────────────────────────────────
  app.get(
    '/orgs/:orgId/users',
    { preHandler: requireOrgAdmin },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { orgId } = request.params as { orgId: string }
      const result = await userRepository.listByOrg(orgId)
      if (isErr(result)) return reply.status(500).send({ code: result.error.code, message: result.error.message })
      return reply.send({ users: result.value.map(u => ({
        id:            u.id,
        email:         u.email,
        emailVerified: u.emailVerified,
        status:        u.status,
        createdAt:     u.createdAt,
      }))})
    },
  )

  // ── POST /orgs/:orgId/users ────────────────────────────────────────────────
  app.post(
    '/orgs/:orgId/users',
    { preHandler: requireOrgAdmin },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { orgId } = request.params as { orgId: string }

      const bodySchema = z.object({
        email:    z.string().email(),
        password: z.string().min(8),
        firstName: z.string().optional(),
        lastName:  z.string().optional(),
      })

      const parsed = bodySchema.safeParse(request.body)
      if (!parsed.success) {
        return reply.status(422).send({ code: 'VALIDATION_ERROR', errors: parsed.error.flatten().fieldErrors })
      }

      const { email, password, firstName, lastName } = parsed.data

      const hashResult = await hashService.hash(password)
      if (isErr(hashResult)) return reply.status(500).send({ code: 'INTERNAL_ERROR', message: 'Failed to hash password' })

      const saveResult = await userRepository.save({
        organizationId: orgId,
        email,
        passwordHash: hashResult.value,
      })
      if (isErr(saveResult)) {
        const e = saveResult.error
        return reply.status(isAppError(e) ? e.statusCode : 500).send({ code: e.code, message: e.message })
      }

      const user = saveResult.value

      await userRepository.saveProfile({
        userId:      user.id,
        givenName:   firstName,
        familyName:  lastName,
        displayName: firstName ? `${firstName} ${lastName ?? ''}`.trim() : undefined,
      })

      return reply.status(201).send({
        id:    user.id,
        email: user.email,
      })
    },
  )

  // ── GET /orgs/:orgId/users/:userId ─────────────────────────────────────────
  app.get(
    '/orgs/:orgId/users/:userId',
    { preHandler: requireOrgAdmin },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { orgId, userId } = request.params as { orgId: string; userId: string }

      const userResult = await userRepository.findById(userId)
      if (isErr(userResult)) {
        return reply.status(userResult.error.statusCode ?? 404).send({ code: userResult.error.code, message: userResult.error.message })
      }

      const user = userResult.value
      if (user.organizationId !== orgId) {
        return reply.status(404).send({ code: 'NOT_FOUND', message: 'User not found in this organization' })
      }

      const profileResult = await userRepository.findProfile(userId)
      const rolesResult   = await orgUserRepository.getUserRoles(userId, orgId)

      return reply.send({
        id:                  user.id,
        email:               user.email,
        emailVerified:       user.emailVerified,
        status:              user.status,
        failedLoginAttempts: user.failedLoginAttempts,
        lockedUntil:         user.lockedUntil,
        createdAt:           user.createdAt,
        profile: !isErr(profileResult) ? {
          firstName:   profileResult.value.givenName,
          lastName:    profileResult.value.familyName,
          displayName: profileResult.value.displayName,
          pictureUrl:  profileResult.value.pictureUrl,
          locale:      profileResult.value.locale,
        } : null,
        roles: !isErr(rolesResult) ? rolesResult.value.map(r => ({
          id:   r.id,
          name: r.name,
        })) : [],
      })
    },
  )

  // ── DELETE /orgs/:orgId/users/:userId ──────────────────────────────────────
  app.delete(
    '/orgs/:orgId/users/:userId',
    { preHandler: requireOrgAdmin },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { orgId, userId } = request.params as { orgId: string; userId: string }
      const result = await userRepository.deleteFromOrg(userId, orgId)
      if (isErr(result)) return reply.status(500).send({ code: result.error.code, message: result.error.message })
      return reply.status(204).send()
    },
  )

  // ── GET /orgs/:orgId/roles ─────────────────────────────────────────────────
  app.get(
    '/orgs/:orgId/roles',
    { preHandler: requireOrgAdmin },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { orgId } = request.params as { orgId: string }
      const result = await orgUserRepository.listRoles(orgId)
      if (isErr(result)) return reply.status(500).send({ code: result.error.code, message: result.error.message })
      return reply.send({ roles: result.value.map(r => ({
        id:          r.id,
        name:        r.name,
        description: r.description,
        isSystem:    r.isSystem,
        createdAt:   r.createdAt,
      }))})
    },
  )

  // ── POST /orgs/:orgId/roles ────────────────────────────────────────────────
  app.post(
    '/orgs/:orgId/roles',
    { preHandler: requireOrgAdmin },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { orgId } = request.params as { orgId: string }

      const bodySchema = z.object({
        name:        z.string().min(1).max(50),
        description: z.string().optional(),
      })

      const parsed = bodySchema.safeParse(request.body)
      if (!parsed.success) {
        return reply.status(422).send({ code: 'VALIDATION_ERROR', errors: parsed.error.flatten().fieldErrors })
      }

      const result = await orgUserRepository.createRole({
        id:             randomUUID(),
        organizationId: orgId,
        name:           parsed.data.name,
        description:    parsed.data.description,
        isSystem:       false,
      })
      if (isErr(result)) return reply.status(500).send({ code: result.error.code, message: result.error.message })
      return reply.status(201).send(result.value)
    },
  )

  // ── DELETE /orgs/:orgId/roles/:roleId ──────────────────────────────────────
  app.delete(
    '/orgs/:orgId/roles/:roleId',
    { preHandler: requireOrgAdmin },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { orgId, roleId } = request.params as { orgId: string; roleId: string }

      const roleResult = await orgUserRepository.findRoleById(roleId)
      if (isErr(roleResult)) return reply.status(404).send({ code: 'NOT_FOUND', message: 'Role not found' })

      if (!roleResult.value.canBeDeleted()) {
        return reply.status(409).send({ code: 'CONFLICT', message: 'System roles cannot be deleted' })
      }

      const result = await orgUserRepository.deleteRole(roleId, orgId)
      if (isErr(result)) return reply.status(500).send({ code: result.error.code, message: result.error.message })
      return reply.status(204).send()
    },
  )

  // ── POST /orgs/:orgId/users/:userId/roles ──────────────────────────────────
  app.post(
    '/orgs/:orgId/users/:userId/roles',
    { preHandler: requireOrgAdmin },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { userId } = request.params as { orgId: string; userId: string }

      const bodySchema = z.object({ roleId: z.string().uuid() })
      const parsed = bodySchema.safeParse(request.body)
      if (!parsed.success) {
        return reply.status(422).send({ code: 'VALIDATION_ERROR', errors: parsed.error.flatten().fieldErrors })
      }

      const assignedBy = request.userId ?? userId

      const result = await orgUserRepository.assignRole({
        id:         randomUUID(),
        userId,
        roleId:     parsed.data.roleId,
        assignedBy,
      })
      if (isErr(result)) return reply.status(500).send({ code: result.error.code, message: result.error.message })
      return reply.status(201).send({ message: 'Role assigned' })
    },
  )

  // ── DELETE /orgs/:orgId/users/:userId/roles/:roleId ────────────────────────
  app.delete(
    '/orgs/:orgId/users/:userId/roles/:roleId',
    { preHandler: requireOrgAdmin },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { userId, roleId } = request.params as { orgId: string; userId: string; roleId: string }

      const result = await orgUserRepository.revokeRole(userId, roleId)
      if (isErr(result)) return reply.status(500).send({ code: result.error.code, message: result.error.message })
      return reply.status(204).send()
    },
  )
}