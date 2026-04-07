import { ok, err } from '../../../../shared/result/Result.js'
import type { Result } from '../../../../shared/result/Result.js'
import type { AppError } from '../../../../shared/errors/AppError.js'
import { ValidationError, UnauthorizedError } from '../../../../shared/errors/AppError.js'
import type { Logger } from '../../../../shared/logger/logger.js'
import type { IApplicationRepository } from '../../../applications/application/ports/IApplicationRepository.js'
import type { ISigningKeyRepository } from '../../../keys/application/ports/ISigningKeyRepository.js'
import type { IKeyEncryptionService } from '../../../keys/application/ports/IKeyEncryptionService.js'
import type { IJwtAssertionVerifier } from '../ports/IJwtAssertionVerifier.js'
import type { IAccessTokenIssuer } from '../ports/IAccessTokenIssuer.js'
import type { AccessToken } from '../../domain/AccessToken.js'
import type { Env } from '../../../../shared/config/env.js'

export interface HandleJwtAssertionCmd {
  clientAssertionType: string
  clientAssertion: string
  clientId: string
}

const ASSERTION_TYPE = 'urn:ietf:params:oauth:client-assertion-type:jwt-bearer'

interface Deps {
  applicationRepository: IApplicationRepository
  signingKeyRepository: ISigningKeyRepository
  keyEncryptionService: IKeyEncryptionService
  jwtAssertionVerifier: IJwtAssertionVerifier
  accessTokenIssuer: IAccessTokenIssuer
  config: Env
  logger: Logger
}

export class HandleJwtAssertionUseCase {
  constructor(private readonly deps: Deps) {}

  async execute(cmd: HandleJwtAssertionCmd): Promise<Result<AccessToken, AppError>> {
    const { applicationRepository, signingKeyRepository, keyEncryptionService,
            jwtAssertionVerifier, accessTokenIssuer, config, logger } = this.deps

    if (cmd.clientAssertionType !== ASSERTION_TYPE) {
      return err(new ValidationError(`Invalid client_assertion_type. Expected: ${ASSERTION_TYPE}`))
    }

    const appResult = await applicationRepository.findWithConfig(cmd.clientId)
    if (appResult.isErr()) return err(appResult.error)
    const { application, jwtConfig } = appResult.value

    if (!jwtConfig) {
      return err(new UnauthorizedError('Application does not have a JWT configuration'))
    }
    if (!application.isActive()) {
      return err(new UnauthorizedError('Application is inactive'))
    }
    if (!jwtConfig.publicKey) {
      return err(new UnauthorizedError('Application has no registered public key for assertion verification'))
    }

    const verifyResult = await jwtAssertionVerifier.verify(
      cmd.clientAssertion,
      jwtConfig.publicKey,
      config.IDP_BASE_URL,
      cmd.clientId,
    )
    if (verifyResult.isErr()) return err(verifyResult.error)

    const keyResult = await signingKeyRepository.findActiveSigningKey()
    if (keyResult.isErr()) return err(keyResult.error)
    const signingKey = keyResult.value

    const decryptResult = await keyEncryptionService.decrypt(
      signingKey.encryptedPrivateKey,
      signingKey.encryptionIv,
    )
    if (decryptResult.isErr()) return err(decryptResult.error)

    logger.info({ clientId: cmd.clientId, kid: signingKey.kid }, 'Issuing JWT access token via client assertion')

    return accessTokenIssuer.issue({
      clientId: cmd.clientId,
      audience: jwtConfig.audience,
      tokenLifetime: jwtConfig.tokenLifetime,
      customClaims: jwtConfig.customClaims,
      signingKeyPem: decryptResult.value,
      signingKeyId: signingKey.kid,
      algorithm: signingKey.algorithm,
    })
  }
}