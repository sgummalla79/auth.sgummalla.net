import { ok, err } from '../../../../shared/result/Result.js'
import type { Result } from '../../../../shared/result/Result.js'
import type { AppError } from '../../../../shared/errors/AppError.js'
import { UnauthorizedError } from '../../../../shared/errors/AppError.js'
import type { Logger } from '../../../../shared/logger/logger.js'
import type { ISsoSessionRepository } from '../ports/ISsoSessionRepository.js'
import type { ISloFanoutService } from '../ports/ISloFanoutService.js'

export interface RevokeSessionCmd {
  sessionId: string
  requestingUserId: string  // must own the session
}

interface Deps {
  ssoSessionRepository: ISsoSessionRepository
  sloFanoutService: ISloFanoutService
  logger: Logger
}

export class RevokeSessionUseCase {
  constructor(private readonly deps: Deps) {}

  async execute(cmd: RevokeSessionCmd): Promise<Result<void, AppError>> {
    const { ssoSessionRepository, sloFanoutService, logger } = this.deps

    const sessionResult = await ssoSessionRepository.findById(cmd.sessionId)
    if (sessionResult.isErr()) return err(sessionResult.error)
    const session = sessionResult.value

    // Verify ownership
    if (session.userId !== cmd.requestingUserId) {
      return err(new UnauthorizedError('You do not own this session'))
    }

    // Revoke in DB
    const revokeResult = await ssoSessionRepository.revoke(cmd.sessionId)
    if (revokeResult.isErr()) return err(revokeResult.error)

    // Fan out SLO to participating apps (best-effort)
    if (session.participatingApps.length > 0) {
      const results = await sloFanoutService.fanout(session.userId, session.participatingApps)
      const failures = results.filter(r => !r.success)
      if (failures.length > 0) {
        logger.warn({ sessionId: cmd.sessionId, failures }, 'Some SLO fanout requests failed')
      }
    }

    logger.info({ sessionId: cmd.sessionId, userId: cmd.requestingUserId }, 'SSO session revoked')
    return ok(undefined)
  }
}