import { ok, err, isErr } from '../../../../shared/result/Result.js'
import type { Result } from '../../../../shared/result/Result.js'
import type { AppError } from '../../../../shared/errors/AppError.js'
import { ValidationError, UnauthorizedError } from '../../../../shared/errors/AppError.js'
import type { Logger } from '../../../../shared/logger/logger.js'
import type { IMfaRepository } from '../ports/IMfaRepository.js'
import type { ITotpService } from '../ports/ITotpService.js'
import type { IKeyEncryptionService } from '../../../keys/application/ports/IKeyEncryptionService.js'

interface Deps {
  mfaRepository: IMfaRepository
  totpService: ITotpService
  keyEncryptionService: IKeyEncryptionService
  logger: Logger
}

export class ValidateTotpUseCase {
  constructor(private readonly deps: Deps) {}

  async execute(userId: string, code: string): Promise<Result<void, AppError>> {
    const { mfaRepository, totpService, keyEncryptionService, logger } = this.deps

    const mfaResult = await mfaRepository.getMfaData(userId)
    if (isErr(mfaResult)) return err(mfaResult.error)
    const mfaData = mfaResult.value

    if (!mfaData.mfaEnabled || !mfaData.totpSecret) {
      return err(new ValidationError('MFA is not enabled for this account'))
    }

    const [ciphertext, iv] = mfaData.totpSecret.split('|')
    if (!ciphertext || !iv) {
      return err(new ValidationError('Stored TOTP secret is malformed'))
    }

    const decryptResult = await keyEncryptionService.decrypt(ciphertext, iv)
    if (isErr(decryptResult)) return err(decryptResult.error)

    console.log('validating code:', code, 'against secret length:', decryptResult.value.length)
    const valid = await totpService.verify(code, decryptResult.value)
    console.log('valid result:', valid)
    if (!valid) {
      return err(new UnauthorizedError('Invalid TOTP code'))
    }

    logger.info({ userId }, 'TOTP validated successfully')
    return ok(undefined)
  }
}