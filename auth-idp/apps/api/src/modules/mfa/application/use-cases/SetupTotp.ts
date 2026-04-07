import { ok, err } from '../../../../shared/result/Result.js'
import type { Result } from '../../../../shared/result/Result.js'
import type { AppError } from '../../../../shared/errors/AppError.js'
import { ValidationError } from '../../../../shared/errors/AppError.js'
import type { Logger } from '../../../../shared/logger/logger.js'
import type { IUserRepository } from '../../../users/application/ports/IUserRepository.js'
import type { IMfaRepository } from '../ports/IMfaRepository.js'
import type { ITotpService } from '../ports/ITotpService.js'
import type { IKeyEncryptionService } from '../../../keys/application/ports/IKeyEncryptionService.js'
import type { Env } from '../../../../shared/config/env.js'

export interface SetupTotpResult {
  otpauthUri: string    // scan with authenticator app
  secret: string        // display to user as fallback
}

interface Deps {
  userRepository: IUserRepository
  mfaRepository: IMfaRepository
  totpService: ITotpService
  keyEncryptionService: IKeyEncryptionService
  config: Env
  logger: Logger
}

export class SetupTotpUseCase {
  constructor(private readonly deps: Deps) {}

  async execute(userId: string): Promise<Result<SetupTotpResult, AppError>> {
    const { userRepository, mfaRepository, totpService, keyEncryptionService, config, logger } = this.deps

    // 1. Load user
    const userResult = await userRepository.findById(userId)
    if (userResult.isErr()) return err(userResult.error)
    const user = userResult.value

    // 2. Check MFA not already active
    const mfaResult = await mfaRepository.getMfaData(userId)
    if (mfaResult.isErr()) return err(mfaResult.error)
    if (mfaResult.value.mfaEnabled) {
      return err(new ValidationError('MFA is already enabled. Disable it first before re-enrolling.'))
    }

    // 3. Generate secret
    const secretResult = totpService.generateSecret(user.email, config.IDP_BASE_URL)
    if (secretResult.isErr()) return err(secretResult.error)
    const totpSecret = secretResult.value

    // 4. Encrypt secret before storing
    const encryptResult = await keyEncryptionService.encrypt(totpSecret.secret)
    if (encryptResult.isErr()) return err(encryptResult.error)
    const { ciphertext, iv } = encryptResult.value

    // Store as "ciphertext:iv" — single column, easy to split on retrieval
    const encryptedSecret = `${ciphertext}|${iv}`

    // 5. Persist as pending (not yet verified)
    const saveResult = await mfaRepository.savePendingTotp(userId, encryptedSecret)
    if (saveResult.isErr()) return err(saveResult.error)

    logger.info({ userId }, 'TOTP setup initiated')

    return ok({
      otpauthUri: totpSecret.otpauthUri,
      secret: totpSecret.secret,
    })
  }
}