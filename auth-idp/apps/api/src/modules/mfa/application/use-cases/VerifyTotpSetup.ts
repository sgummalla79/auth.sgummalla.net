import { ok, err, isErr, isOk } from '../../../../shared/result/Result.js'
import type { Result } from '../../../../shared/result/Result.js'
import type { AppError } from '../../../../shared/errors/AppError.js'
import { ValidationError, UnauthorizedError } from '../../../../shared/errors/AppError.js'
import type { Logger } from '../../../../shared/logger/logger.js'
import type { IMfaRepository } from '../ports/IMfaRepository.js'
import type { ITotpService } from '../ports/ITotpService.js'
import type { IBackupCodeService } from '../ports/IBackupCodeService.js'
import type { IKeyEncryptionService } from '../../../keys/application/ports/IKeyEncryptionService.js'

export interface VerifyTotpSetupResult {
  backupCodes: string[]   // plaintext — shown once, never retrievable again
}

interface Deps {
  mfaRepository: IMfaRepository
  totpService: ITotpService
  backupCodeService: IBackupCodeService
  keyEncryptionService: IKeyEncryptionService
  logger: Logger
}

export class VerifyTotpSetupUseCase {
  constructor(private readonly deps: Deps) {}

  async execute(userId: string, code: string): Promise<Result<VerifyTotpSetupResult, AppError>> {
    const { mfaRepository, totpService, backupCodeService, keyEncryptionService, logger } = this.deps

    // 1. Load pending TOTP data
    const mfaResult = await mfaRepository.getMfaData(userId)
    if (isErr(mfaResult)) return err(mfaResult.error)
    const mfaData = mfaResult.value

    if (!mfaData.totpPending || !mfaData.totpSecret) {
      return err(new ValidationError('No pending TOTP setup found. Call /mfa/totp/setup first.'))
    }

    // 2. Decrypt the stored secret
    const [ciphertext, iv] = mfaData.totpSecret.split('|')
    console.log('stored secret raw:', mfaData.totpSecret)
    console.log('split result:', [ciphertext, iv])
    if (!ciphertext || !iv) {
      return err(new ValidationError('Stored TOTP secret is malformed'))
    }

    const decryptResult = await keyEncryptionService.decrypt(ciphertext, iv)
    if (isErr(decryptResult)) return err(decryptResult.error)
    const secret = decryptResult.value

    // 3. Verify the code
    const valid = totpService.verify(code, secret)
    if (!valid) {
      return err(new UnauthorizedError('Invalid TOTP code'))
    }

    // 4. Generate backup codes
    const plaintextCodes = backupCodeService.generate(10)
    const hashedCodes = await Promise.all(
      plaintextCodes.map(c => backupCodeService.hash(c)),
    )

    const failedHash = hashedCodes.find(r => isErr(r))
    if (failedHash && isErr(failedHash)) return err(failedHash.error)

    const hashes = hashedCodes.map(r => (isOk(r) ? r.value : ''))

    // 5. Activate MFA
    const activateResult = await mfaRepository.activateMfa(userId, hashes)
    if (isErr(activateResult)) return err(activateResult.error)

    logger.info({ userId }, 'MFA activated via TOTP verification')

    return ok({ backupCodes: plaintextCodes })
  }
}