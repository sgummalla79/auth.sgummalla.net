import { ok, err, isErr} from '../../../../shared/result/Result.js'
import type { Result } from '../../../../shared/result/Result.js'
import type { AppError } from '../../../../shared/errors/AppError.js'
import type { Logger } from '../../../../shared/logger/logger.js'
import type { ISsoSessionRepository } from '../ports/ISsoSessionRepository.js'
import type { SsoSession } from '../../domain/SsoSession.js'

export interface CreateSsoSessionCmd {
  userId: string
  idpSessionToken: string
  expiresInSeconds?: number
}

interface Deps {
  ssoSessionRepository: ISsoSessionRepository
  logger: Logger
}

export class CreateSsoSessionUseCase {
  constructor(private readonly deps: Deps) {}

  async execute(cmd: CreateSsoSessionCmd): Promise<Result<SsoSession, AppError>> {
    const { ssoSessionRepository, logger } = this.deps

    const result = await ssoSessionRepository.create({
      userId: cmd.userId,
      idpSessionToken: cmd.idpSessionToken,
      expiresInSeconds: cmd.expiresInSeconds ?? 86400, // 24 hours default
    })

    if (isErr(result)) return err(result.error)

    logger.info({ userId: cmd.userId, sessionId: result.value.id }, 'SSO session created')
    return ok(result.value)
  }
}