import type { Result } from '../../../../shared/result/Result.js'
import type { UnauthorizedError, InternalError } from '../../../../shared/errors/AppError.js'

export interface ICertThumbprintExtractor {
  extract(certPem: string): Result<string, UnauthorizedError | InternalError>
}