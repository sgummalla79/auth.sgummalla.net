import { err, isErr, isOk } from '../../../../shared/result/Result.js'
import type { Result } from '../../../../shared/result/Result.js'
import type { AppError } from '../../../../shared/errors/AppError.js'
import { ValidationError } from '../../../../shared/errors/AppError.js'
import type { Logger } from '../../../../shared/logger/logger.js'
import type { IApplicationRepository } from '../../../applications/application/ports/IApplicationRepository.js'
import type { ISigningKeyRepository } from '../../../keys/application/ports/ISigningKeyRepository.js'
import type { IKeyEncryptionService } from '../../../keys/application/ports/IKeyEncryptionService.js'
import type { IUserRepository } from '../../../users/application/ports/IUserRepository.js'
import type { ISamlIdpService, SsoResponse } from '../ports/ISamlIdpService.js'
import type { ISamlCertificateService } from '../ports/ISamlCertificateService.js'
import { SamlAssertion } from '../../domain/SamlAssertion.js'
import type { Env } from '../../../../shared/config/env.js'

export interface HandleSsoRequestCmd {
  appId: string
  samlRequest: string
  relayState?: string
  userId: string      // resolved from session before calling this use case
}

interface Deps {
  applicationRepository: IApplicationRepository
  signingKeyRepository: ISigningKeyRepository
  keyEncryptionService: IKeyEncryptionService
  userRepository: IUserRepository
  samlIdpService: ISamlIdpService
  samlCertificateService: ISamlCertificateService
  config: Env
  logger: Logger
}

export class HandleSsoRequestUseCase {
  constructor(private readonly deps: Deps) {}

  async execute(cmd: HandleSsoRequestCmd): Promise<Result<SsoResponse, AppError>> {
    const { applicationRepository, signingKeyRepository, keyEncryptionService,
            userRepository, samlIdpService, samlCertificateService, config, logger } = this.deps

    // 1. Load app + SAML config
    const appResult = await applicationRepository.findWithConfig(cmd.appId)
    if (isErr(appResult)) return err(appResult.error)
    const { application, samlConfig } = appResult.value

    if (!samlConfig) {
      return err(new ValidationError('Application does not have a SAML configuration'))
    }
    if (!application.isActive()) {
      return err(new ValidationError('Application is inactive'))
    }

    // 2. Load user + profile
    const [userResult, profileResult] = await Promise.all([
      userRepository.findById(cmd.userId),
      userRepository.findProfile(cmd.userId),
    ])
    if (isErr(userResult)) return err(userResult.error)
    if (isErr(profileResult)) return err(profileResult.error)

    const user = userResult.value
    const profile = profileResult.value

    if (!user.canLogin()) {
      return err(new ValidationError('User account is not active'))
    }

    // 3. Build assertion from user + attributeMappings
    const assertion = SamlAssertion.fromUser(
      user,
      profile,
      samlConfig.attributeMappings,
      samlConfig.nameIdFormat,
    )

    // 4. Active signing key → decrypt → cert
    const keyResult = await signingKeyRepository.findActiveSigningKey()
    if (isErr(keyResult)) return err(keyResult.error)
    const signingKey = keyResult.value

    const decryptResult = await keyEncryptionService.decrypt(
      signingKey.encryptedPrivateKey,
      signingKey.encryptionIv,
    )
    if (isErr(decryptResult)) return err(decryptResult.error)

    const certResult = await samlCertificateService.generateOrGetCert(
      signingKey.kid,
      decryptResult.value,
      signingKey.publicKeyPem,
    )
    if (isErr(certResult)) return err(certResult.error)

    logger.info({ appId: cmd.appId, userId: cmd.userId, kid: signingKey.kid }, 'Creating SAML SSO response')

    // 5. Build signed response
    return samlIdpService.createSsoResponse(
      samlConfig,
      config.IDP_BASE_URL,
      cmd.appId,
      cmd.samlRequest,
      cmd.relayState,
      assertion,
      {
        privateKeyPem: decryptResult.value,
        certPem: certResult.value,
        kid: signingKey.kid,
      },
    )
  }
}