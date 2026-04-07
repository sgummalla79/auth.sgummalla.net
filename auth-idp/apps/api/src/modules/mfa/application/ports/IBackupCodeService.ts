import type { Result } from '../../../../shared/result/Result.js'
import type { InternalError } from '../../../../shared/errors/AppError.js'

export interface IBackupCodeService {
  /** Generate N random backup codes (plaintext — shown once). */
  generate(count: number): string[]

  /** Hash a plaintext backup code for storage. */
  hash(code: string): Promise<Result<string, InternalError>>

  /** Verify a plaintext code against a stored hash. */
  verify(code: string, hash: string): Promise<boolean>
}