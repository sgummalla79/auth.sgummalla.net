import type { Result } from '../../../../shared/result/Result.js'
import type { InternalError } from '../../../../shared/errors/AppError.js'
import type { TotpSecret } from '../../domain/TotpSecret.js'

export interface ITotpService {
  /** Generate a new TOTP secret and otpauth URI for the given user email. */
  generateSecret(
    email: string,
    issuer: string,
  ): Result<TotpSecret, InternalError>

  /** Verify a TOTP code against a base32 secret. */
  verify(code: string, secret: string): Promise<boolean>
}