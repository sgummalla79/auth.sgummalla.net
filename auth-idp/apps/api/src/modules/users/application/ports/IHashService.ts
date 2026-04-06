import type { Result } from '../../../../shared/result/Result.js'
import type { InternalError } from '../../../../shared/errors/AppError.js'

export interface IHashService {
  hash(plaintext: string): Promise<Result<string, InternalError>>
  verify(hash: string, plaintext: string): Promise<Result<boolean, InternalError>>
}