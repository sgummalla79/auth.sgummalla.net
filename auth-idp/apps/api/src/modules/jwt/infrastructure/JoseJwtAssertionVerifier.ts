import { importSPKI, jwtVerify } from 'jose'
import { ok, err } from '../../../shared/result/Result.js'
import type { Result } from '../../../shared/result/Result.js'
import { UnauthorizedError, InternalError } from '../../../shared/errors/AppError.js'
import type { IJwtAssertionVerifier, VerifiedAssertion } from '../application/ports/IJwtAssertionVerifier.js'
import type { Logger } from '../../../shared/logger/logger.js'

interface Deps { logger: Logger }

export class JoseJwtAssertionVerifier implements IJwtAssertionVerifier {
  private readonly logger: Logger

  constructor({ logger }: Deps) {
    this.logger = logger.child({ service: 'JoseJwtAssertionVerifier' })
  }

  async verify(
    assertion: string,
    publicKeyPem: string,
    expectedAudience: string,
    expectedClientId: string,
  ): Promise<Result<VerifiedAssertion, UnauthorizedError | InternalError>> {
    try {
      const publicKey = await importSPKI(publicKeyPem, 'RS256', { extractable: false })

      const { payload } = await jwtVerify(assertion, publicKey, {
        audience: expectedAudience,
        issuer: expectedClientId,
        clockTolerance: 30,
      })

      if (!payload.sub) {
        return err(new UnauthorizedError('Client assertion missing sub claim'))
      }
      if (payload.sub !== payload.iss) {
        return err(new UnauthorizedError('Client assertion sub must equal iss'))
      }

      if (!payload.jti) {
        this.logger.warn({ clientId: expectedClientId }, 'Client assertion missing jti — replay detection not possible')
      }

      return ok({ clientId: expectedClientId, subject: payload.sub })
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e)
      console.error('jose verify error:', e)
      if (message.includes('expired') || message.includes('invalid') || message.includes('verification')) {
        return err(new UnauthorizedError(`Client assertion verification failed: ${message}`))
      }
      return err(new InternalError('Unexpected error during assertion verification', e))
    }
  }
}