import { err } from '../../../../shared/result/Result.js'
import type { Result } from '../../../../shared/result/Result.js'
import type { AppError } from '../../../../shared/errors/AppError.js'
import { ValidationError } from '../../../../shared/errors/AppError.js'
import type { Logger } from '../../../../shared/logger/logger.js'
import type { IApplicationRepository } from '../../../applications/application/ports/IApplicationRepository.js'
import type { ISigningKeyRepository } from '../../../keys/application/ports/ISigningKeyRepository.js'
import type { IKeyEncryptionService } from '../../../keys/application/ports/IKeyEncryptionService.js'
import type { ISamlIdpService } from '../ports/ISamlIdpService.js'
import type { ISamlCertificateService } from '../ports/ISamlCertificateService.js'
import type { Env } from '../../../../shared/config/env.js'

interface Deps {
  applicationRepository: IApplicationRepository
  signingKeyRepository: ISigningKeyRepository
  keyEncryptionService: IKeyEncryptionService
  samlIdpService: ISamlIdpService
  samlCertificateService: ISamlCertificateService
  config: Env
  logger: Logger
}

export class GetIdpMetadataUseCase {
  constructor(private readonly deps: Deps) {}

  async execute(appId: string): Promise<Result<string, AppError>> {
    const { applicationRepository, signingKeyRepository, keyEncryptionService,
            samlIdpService, samlCertificateService, config, logger } = this.deps

    // 1. Load app + SAML config
    const appResult = await applicationRepository.findWithConfig(appId)
    if (appResult.isErr()) return err(appResult.error)
    const { application, samlConfig } = appResult.value

    if (!samlConfig) {
      return err(new ValidationError('Application does not have a SAML configuration'))
    }
    if (!application.isActive()) {
      return err(new ValidationError('Application is inactive'))
    }

    // 2. Active signing key
    const keyResult = await signingKeyRepository.findActiveSigningKey()
    if (keyResult.isErr()) return err(keyResult.error)
    const signingKey = keyResult.value

    // 3. Decrypt private key
    const decryptResult = await keyEncryptionService.decrypt(
      signingKey.encryptedPrivateKey,
      signingKey.encryptionIv,
    )
    if (decryptResult.isErr()) return err(decryptResult.error)

    // 4. Self-signed X.509 cert (cached by kid)
    const certResult = await samlCertificateService.generateOrGetCert(
      signingKey.kid,
      decryptResult.value,
      signingKey.publicKeyPem,
    )
    if (certResult.isErr()) return err(certResult.error)

    logger.info({ appId, kid: signingKey.kid }, 'Generating SAML metadata')

    // 5. Build metadata XML
    return samlIdpService.getMetadata(samlConfig, config.IDP_BASE_URL, appId, {
      privateKeyPem: decryptResult.value,
      certPem: certResult.value,
      kid: signingKey.kid,
    })
  }
}