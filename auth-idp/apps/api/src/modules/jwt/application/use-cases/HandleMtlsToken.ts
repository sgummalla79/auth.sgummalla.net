import { ok, err } from '../../../../shared/result/Result.js'
import type { Result } from '../../../../shared/result/Result.js'
import type { AppError } from '../../../../shared/errors/AppError.js'
import { UnauthorizedError } from '../../../../shared/errors/AppError.js'
import type { Logger } from '../../../../shared/logger/logger.js'
import type { IApplicationRepository } from '../../../applications/application/ports/IApplicationRepository.js'
import type { ISigningKeyRepository } from '../../../keys/application/ports/ISigningKeyRepository.js'
import type { IKeyEncryptionService } from '../../../keys/application/ports/IKeyEncryptionService.js'
import type { ICertThumbprintExtractor } from '../ports/ICertThumbprintExtractor.js'
import type { IAccessTokenIssuer } from '../ports/IAccessTokenIssuer.js'
import type { AccessToken } from '../../domain/AccessToken.js'

export interface HandleMtlsTokenCmd {
  clientCertPem: string
  certVerified: boolean
}

interface Deps {
  applicationRepository: IApplicationRepository
  signingKeyRepository: ISigningKeyRepository
  keyEncryptionService: IKeyEncryptionService
  certThumbprintExtractor: ICertThumbprintExtractor
  accessTokenIssuer: IAccessTokenIssuer
  logger: Logger
}

export class HandleMtlsTokenUseCase {
  constructor(private readonly deps: Deps) {}

  async execute(cmd: HandleMtlsTokenCmd): Promise<Result<AccessToken, AppError>> {
    const { applicationRepository, signingKeyRepository, keyEncryptionService,
            certThumbprintExtractor, accessTokenIssuer, logger } = this.deps

    if (!cmd.certVerified) {
      return err(new UnauthorizedError('Client certificate was not verified by the proxy'))
    }

    const thumbprintResult = certThumbprintExtractor.extract(cmd.clientCertPem)
    if (thumbprintResult.isErr()) return err(thumbprintResult.error)
    const thumbprint = thumbprintResult.value

    const appResult = await applicationRepository.findByThumbprint(thumbprint)
    if (appResult.isErr()) return err(appResult.error)
    const { application, jwtConfig } = appResult.value

    if (!jwtConfig) {
      return err(new UnauthorizedError('Application does not have a JWT configuration'))
    }
    if (!application.isActive()) {
      return err(new UnauthorizedError('Application is inactive'))
    }

    const keyResult = await signingKeyRepository.findActiveSigningKey()
    if (keyResult.isErr()) return err(keyResult.error)
    const signingKey = keyResult.value

    const decryptResult = await keyEncryptionService.decrypt(
      signingKey.encryptedPrivateKey,
      signingKey.encryptionIv,
    )
    if (decryptResult.isErr()) return err(decryptResult.error)

    logger.info({ clientId: application.id, thumbprint, kid: signingKey.kid }, 'Issuing JWT access token via mTLS')

    return accessTokenIssuer.issue({
      clientId: application.id,
      audience: jwtConfig.audience,
      tokenLifetime: jwtConfig.tokenLifetime,
      customClaims: jwtConfig.customClaims,
      signingKeyPem: decryptResult.value,
      signingKeyId: signingKey.kid,
      algorithm: signingKey.algorithm,
    })
  }
}