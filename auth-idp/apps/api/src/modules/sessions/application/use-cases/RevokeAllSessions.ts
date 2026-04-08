import { ok, err, isErr } from '../../../../shared/result/Result.js'
import type { Result } from '../../../../shared/result/Result.js'
import type { AppError } from '../../../../shared/errors/AppError.js'
import type { Logger } from '../../../../shared/logger/logger.js'
import type { ISsoSessionRepository } from '../ports/ISsoSessionRepository.js'
import type { ISloFanoutService } from '../ports/ISloFanoutService.js'

interface Deps {
  ssoSessionRepository: ISsoSessionRepository
  sloFanoutService: ISloFanoutService
  logger: Logger
}

export class RevokeAllSessionsUseCase {
  constructor(private readonly deps: Deps) {}

  async execute(userId: string): Promise<Result<void, AppError>> {
    const { ssoSessionRepository, sloFanoutService, logger } = this.deps

    // Collect all active sessions for fanout before revoking
    const sessionsResult = await ssoSessionRepository.findActiveByUserId(userId)
    if (isErr(sessionsResult)) return err(sessionsResult.error)
    const sessions = sessionsResult.value

    // Revoke all in DB
    const revokeResult = await ssoSessionRepository.revokeAllForUser(userId)
    if (isErr(revokeResult)) return err(revokeResult.error)

    // Fan out SLO to all participating apps across all sessions
    const allApps = sessions.flatMap(s => s.participatingApps)
    const uniqueApps = allApps.filter(
      (app, idx, arr) => arr.findIndex(a => a.appId === app.appId) === idx,
    )

    if (uniqueApps.length > 0) {
      const results = await sloFanoutService.fanout(userId, uniqueApps)
      const failures = results.filter(r => !r.success)
      if (failures.length > 0) {
        logger.warn({ userId, failures }, 'Some SLO fanout requests failed during global logout')
      }
    }

    logger.info({ userId, sessionCount: sessions.length }, 'All SSO sessions revoked')
    return ok(undefined)
  }
}