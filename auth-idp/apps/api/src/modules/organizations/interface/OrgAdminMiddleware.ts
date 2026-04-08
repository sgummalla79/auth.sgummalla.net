import type { FastifyRequest, FastifyReply } from 'fastify'
import { isErr } from '../../../shared/result/Result.js'
import { UnauthorizedError, ForbiddenError } from '../../../shared/errors/AppError.js'
import type { ISessionStore } from '../../users/application/ports/ISessionStore.js'
import type { IOrganizationUserRepository } from '../application/ports/IOrganizationUserRepository.js'

export function makeRequireOrgAdmin(
  sessionStore: ISessionStore,
  orgUserRepository: IOrganizationUserRepository,
) {
  return async (request: FastifyRequest, reply: FastifyReply): Promise<void> => {
    // 1. Extract session token
    const token = request.headers['authorization']?.replace('Bearer ', '').trim()
    if (!token) {
      const e = new UnauthorizedError('Missing authorization token')
      return reply.status(401).send(e.toJSON())
    }

    // 2. Validate session
    const sessionResult = await sessionStore.get(token)
    if (isErr(sessionResult)) {
      const e = new UnauthorizedError('Invalid or expired session token')
      return reply.status(401).send(e.toJSON())
    }

    const { userId } = sessionResult.value
    const { orgId } = request.params as { orgId?: string }

    if (!orgId) {
      const e = new UnauthorizedError('Missing orgId in route')
      return reply.status(401).send(e.toJSON())
    }

    // 3. Check org_admin role
    const hasRoleResult = await orgUserRepository.hasRole(userId, orgId, 'org_admin')
    if (isErr(hasRoleResult) || !hasRoleResult.value) {
      const e = new ForbiddenError('You do not have org_admin access to this organization')
      return reply.status(403).send(e.toJSON())
    }

    // 4. Attach to request for downstream handlers
    request.userId = userId
    request.organizationId = orgId
  }
}