import type { Result } from '../../../../shared/result/Result.js'
import type { UnauthorizedError, InternalError } from '../../../../shared/errors/AppError.js'

export interface VerifiedAssertion {
  clientId: string
  subject: string
}

export interface IJwtAssertionVerifier {
  verify(
    assertion: string,
    publicKeyPem: string,
    expectedAudience: string,
    expectedClientId: string,
  ): Promise<Result<VerifiedAssertion, UnauthorizedError | InternalError>>
}