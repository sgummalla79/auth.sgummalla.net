import { SignJWT, importPKCS8 } from 'jose'
import { randomBytes } from 'crypto'
import { ok, err } from '../../../shared/result/Result.js'
import type { Result } from '../../../shared/result/Result.js'
import { InternalError } from '../../../shared/errors/AppError.js'
import type { IAccessTokenIssuer, IssueTokenInput } from '../application/ports/IAccessTokenIssuer.js'
import { AccessToken } from '../domain/AccessToken.js'
import type { Logger } from '../../../shared/logger/logger.js'

interface Deps { logger: Logger }

export class JoseAccessTokenIssuer implements IAccessTokenIssuer {
  private readonly logger: Logger

  constructor({ logger }: Deps) {
    this.logger = logger.child({ service: 'JoseAccessTokenIssuer' })
  }

  async issue(input: IssueTokenInput): Promise<Result<AccessToken, InternalError>> {
    try {
      const now = new Date()
      const expiresAt = new Date(now.getTime() + input.tokenLifetime * 1000)

      const privateKey = await importPKCS8(input.signingKeyPem, input.algorithm)

      const token = await new SignJWT({
        ...input.customClaims,
        client_id: input.clientId,
      })
        .setProtectedHeader({ alg: input.algorithm, kid: input.signingKeyId })
        .setIssuedAt()
        .setExpirationTime(expiresAt)
        .setJti(randomBytes(16).toString('hex'))
        .setSubject(input.clientId)
        .setAudience(input.audience)
        .sign(privateKey)

      this.logger.debug({ clientId: input.clientId, kid: input.signingKeyId }, 'Access token issued')

      return ok(new AccessToken(token, input.clientId, input.audience, expiresAt, now))
    } catch (e) {
      return err(new InternalError('Failed to issue access token', e))
    }
  }
}