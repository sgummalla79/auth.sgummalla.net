import argon2 from 'argon2'
import { randomBytes } from 'crypto'
import { ok, err } from '../../../shared/result/Result.js'
import type { Result } from '../../../shared/result/Result.js'
import { InternalError } from '../../../shared/errors/AppError.js'
import type { IBackupCodeService } from '../application/ports/IBackupCodeService.js'

/**
 * Argon2BackupCodeService — generates and hashes backup codes.
 *
 * Format: XXXX-XXXX-XXXX (three groups of 4 uppercase hex chars).
 * Easy to read and type; 48 bits of entropy — sufficient for single-use codes.
 *
 * Codes are hashed with Argon2id before storage — same as passwords.
 * Lighter parameters than login passwords since codes are single-use
 * and verified infrequently.
 */
export class Argon2BackupCodeService implements IBackupCodeService {
  private readonly hashOptions = {
    type: argon2.argon2id,
    memoryCost: 19456,
    timeCost: 2,
    parallelism: 1,
  }

  generate(count: number): string[] {
    return Array.from({ length: count }, () => {
      const bytes = randomBytes(6)
      const hex = bytes.toString('hex').toUpperCase()
      return `${hex.slice(0, 4)}-${hex.slice(4, 8)}-${hex.slice(8, 12)}`
    })
  }

  async hash(code: string): Promise<Result<string, InternalError>> {
    try {
      return ok(await argon2.hash(code, this.hashOptions))
    } catch (e) {
      return err(new InternalError('Failed to hash backup code', e))
    }
  }

  async verify(code: string, hash: string): Promise<boolean> {
    try {
      return await argon2.verify(hash, code)
    } catch {
      return false
    }
  }
}