import { ok, err, isErr} from '../../../../shared/result/Result.js'
import type { Result } from '../../../../shared/result/Result.js'
import type { AppError } from '../../../../shared/errors/AppError.js'
import { ValidationError, UnauthorizedError } from '../../../../shared/errors/AppError.js'
import type { Logger } from '../../../../shared/logger/logger.js'
import type { IMfaRepository } from '../ports/IMfaRepository.js'
import type { IBackupCodeService } from '../ports/IBackupCodeService.js'

interface Deps {
  mfaRepository: IMfaRepository
  backupCodeService: IBackupCodeService
  logger: Logger
}

export class UseBackupCodeUseCase {
  constructor(private readonly deps: Deps) {}

  async execute(userId: string, code: string): Promise<Result<void, AppError>> {
    const { mfaRepository, backupCodeService, logger } = this.deps

    const mfaResult = await mfaRepository.getMfaData(userId)
    if (isErr(mfaResult)) return err(mfaResult.error)
    const mfaData = mfaResult.value

    if (!mfaData.mfaEnabled) {
      return err(new ValidationError('MFA is not enabled for this account'))
    }

    if (mfaData.backupCodes.length === 0) {
      return err(new ValidationError('No backup codes remaining. Contact support.'))
    }

    // Find which hash matches the submitted code
    let matchedIndex = -1
    for (let i = 0; i < mfaData.backupCodes.length; i++) {
      const matches = await backupCodeService.verify(code, mfaData.backupCodes[i]!)
      if (matches) {
        matchedIndex = i
        break
      }
    }

    if (matchedIndex === -1) {
      return err(new UnauthorizedError('Invalid backup code'))
    }

    // Remove the used code — single use
    const remaining = mfaData.backupCodes.filter((_, i) => i !== matchedIndex)
    const consumeResult = await mfaRepository.consumeBackupCode(userId, remaining)
    if (isErr(consumeResult)) return err(consumeResult.error)

    logger.info({ userId, codesRemaining: remaining.length }, 'Backup code consumed')
    return ok(undefined)
  }
}