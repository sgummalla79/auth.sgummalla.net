import { ok, err, isErr } from '../../../../shared/result/Result.js'
import type { Result } from '../../../../shared/result/Result.js'
import type { AppError } from '../../../../shared/errors/AppError.js'
import type { Logger } from '../../../../shared/logger/logger.js'
import type { ISsoSessionRepository } from '../ports/ISsoSessionRepository.js'
import type { ParticipatingApp } from '../../domain/SsoSession.js'

export interface AddParticipatingAppCmd {
  sessionId: string
  app: ParticipatingApp
}

interface Deps {
  ssoSessionRepository: ISsoSessionRepository
  logger: Logger
}

export class AddParticipatingAppUseCase {
  constructor(private readonly deps: Deps) {}

  async execute(cmd: AddParticipatingAppCmd): Promise<Result<void, AppError>> {
    const { ssoSessionRepository, logger } = this.deps

    // Load session first to check if app is already tracked
    const sessionResult = await ssoSessionRepository.findById(cmd.sessionId)
    if (isErr(sessionResult)) return err(sessionResult.error)

    const session = sessionResult.value
    if (session.hasApp(cmd.app.appId)) {
      return ok(undefined) // already tracked — idempotent
    }

    const result = await ssoSessionRepository.addParticipatingApp(cmd.sessionId, cmd.app)
    if (isErr(result)) return err(result.error)

    logger.debug({ sessionId: cmd.sessionId, appId: cmd.app.appId }, 'App added to SSO session')
    return ok(undefined)
  }
}