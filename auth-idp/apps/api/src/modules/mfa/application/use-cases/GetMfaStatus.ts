import { ok, err, isErr } from '../../../../shared/result/Result.js'
import type { Result } from '../../../../shared/result/Result.js'
import type { AppError } from '../../../../shared/errors/AppError.js'
import type { Logger } from '../../../../shared/logger/logger.js'
import type { IMfaRepository } from '../ports/IMfaRepository.js'
import { MfaStatus } from '../../domain/MfaStatus.js'

interface Deps {
  mfaRepository: IMfaRepository
  logger: Logger
}

export class GetMfaStatusUseCase {
  constructor(private readonly deps: Deps) {}

  async execute(userId: string): Promise<Result<MfaStatus, AppError>> {
    const { mfaRepository } = this.deps

    const mfaResult = await mfaRepository.getMfaData(userId)
    if (isErr(mfaResult)) return err(mfaResult.error)
    const data = mfaResult.value

    return ok(new MfaStatus(
      userId,
      data.mfaEnabled,
      data.totpPending,
      data.backupCodes.length > 0,
    ))
  }
}