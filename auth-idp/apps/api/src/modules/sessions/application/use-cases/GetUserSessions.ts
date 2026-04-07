import type { Result } from '../../../../shared/result/Result.js'
import type { AppError } from '../../../../shared/errors/AppError.js'
import type { Logger } from '../../../../shared/logger/logger.js'
import type { ISsoSessionRepository } from '../ports/ISsoSessionRepository.js'
import type { SsoSession } from '../../domain/SsoSession.js'

interface Deps {
  ssoSessionRepository: ISsoSessionRepository
  logger: Logger
}

export class GetUserSessionsUseCase {
  constructor(private readonly deps: Deps) {}

  async execute(userId: string): Promise<Result<SsoSession[], AppError>> {
    const { ssoSessionRepository } = this.deps
    return ssoSessionRepository.findActiveByUserId(userId)
  }
}