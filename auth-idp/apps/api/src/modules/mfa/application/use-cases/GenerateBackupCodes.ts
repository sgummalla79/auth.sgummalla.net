import { ok, err } from '../../../../shared/result/Result.js'
import type { Result } from '../../../../shared/result/Result.js'
import type { AppError } from '../../../../shared/errors/AppError.js'
import { ValidationError } from '../../../../shared/errors/AppError.js'
import type { Logger } from '../../../../shared/logger/logger.js'
import type { IMfaRepository } from '../ports/IMfaRepository.js'
import type { IBackupCodeService } from '../ports/IBackupCodeService.js'

interface Deps {
  mfaRepository: IMfaRepository
  backupCodeService: IBackupCodeService
  logger: Logger
}

export class GenerateBackupCodesUseCase {
  constructor(private readonly deps: Deps) {}

  async execute(userId: string): Promise<Result<string[], AppError>> {
    const { mfaRepository, backupCodeService, logger } = this.deps

    const mfaResult = await mfaRepository.getMfaData(userId)
    if (mfaResult.isErr()) return err(mfaResult.error)

    if (!mfaResult.value.mfaEnabled) {
      return err(new ValidationError('MFA must be enabled before generating backup codes'))
    }

    const plaintextCodes = backupCodeService.generate(10)
    const hashedResults = await Promise.all(plaintextCodes.map(c => backupCodeService.hash(c)))

    const failed = hashedResults.find(r => r.isErr())
    if (failed?.isErr()) return err(failed.error)

    const hashes = hashedResults.map(r => (r.isOk() ? r.value : ''))

    const saveResult = await mfaRepository.saveBackupCodes(userId, hashes)
    if (saveResult.isErr()) return err(saveResult.error)

    logger.info({ userId }, 'Backup codes regenerated')
    return ok(plaintextCodes)
  }
}