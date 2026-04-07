import speakeasy from 'speakeasy'
import { ok, err } from '../../../shared/result/Result.js'
import type { Result } from '../../../shared/result/Result.js'
import { InternalError } from '../../../shared/errors/AppError.js'
import type { ITotpService } from '../application/ports/ITotpService.js'
import { TotpSecret } from '../domain/TotpSecret.js'

export class OtplibTotpService implements ITotpService {
  generateSecret(email: string, issuer: string): Result<TotpSecret, InternalError> {
    try {
      const issuerLabel = issuer.replace(/^https?:\/\//, '').replace(/\/$/, '')
      const secretObj = speakeasy.generateSecret({
        length: 20,
        name: email,
        issuer: issuerLabel,
      })
      return ok(new TotpSecret(secretObj.base32, secretObj.otpauth_url!))
    } catch (e) {
      return err(new InternalError('Failed to generate TOTP secret', e))
    }
  }

  async verify(code: string, secret: string): Promise<boolean> {
    try {
      return speakeasy.totp.verify({
        secret,
        encoding: 'base32',
        token: code,
        window: 1,
      })
    } catch {
      return false
    }
  }
}