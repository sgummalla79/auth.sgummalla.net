import { err, isErr } from '../../../../shared/result/Result.js'
import type { Result } from '../../../../shared/result/Result.js'
import type { AppError } from '../../../../shared/errors/AppError.js'
import { ValidationError } from '../../../../shared/errors/AppError.js'
import type { Logger } from '../../../../shared/logger/logger.js'
import type { IApplicationRepository } from '../../../applications/application/ports/IApplicationRepository.js'
import type { ISigningKeyRepository } from '../../../keys/application/ports/ISigningKeyRepository.js'
import type { IKeyEncryptionService } from '../../../keys/application/ports/IKeyEncryptionService.js'
import type { ISamlIdpService, SloResponse } from '../ports/ISamlIdpService.js'
import type { ISamlCertificateService } from '../ports/ISamlCertificateService.js'
import type { ISessionStore } from '../../../users/application/ports/ISessionStore.js'
import type { Env } from '../../../../shared/config/env.js'

export interface HandleSloRequestCmd {
  appId: string
  samlRequest: string
  relayState?: string
  sessionToken?: string   // if present, the session will be terminated
}

interface Deps {
  applicationRepository: IApplicationRepository
  signingKeyRepository: ISigningKeyRepository
  keyEncryptionService: IKeyEncryptionService
  samlIdpService: ISamlIdpService
  samlCertificateService: ISamlCertificateService
  sessionStore: ISessionStore
  config: Env
  logger: Logger
}

export class HandleSloRequestUseCase {
  constructor(private readonly deps: Deps) {}

  async execute(cmd: HandleSloRequestCmd): Promise<Result<SloResponse, AppError>> {
    const { applicationRepository, signingKeyRepository, keyEncryptionService,
            samlIdpService, samlCertificateService, sessionStore, config, logger } = this.deps

    // 1. Load app + SAML config
    const appResult = await applicationRepository.findWithConfig(cmd.appId)
    if (isErr(appResult)) return err(appResult.error)
    const { samlConfig } = appResult.value

    if (!samlConfig) {
      return err(new ValidationError('Application does not have a SAML configuration'))
    }

    // 2. Terminate the user's IDP session (best-effort — don't fail SLO if session is already gone)
    if (cmd.sessionToken) {
      const deleteResult = await sessionStore.delete(cmd.sessionToken)
      if (isErr(deleteResult)) {
        logger.warn({ appId: cmd.appId }, 'Failed to delete session during SLO — proceeding anyway')
      } else {
        logger.info({ appId: cmd.appId }, 'Session terminated via SAML SLO')
      }
    }

    // 3. Active signing key → decrypt → cert
    const keyResult = await signingKeyRepository.findActiveKey('')
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

    logger.info({ appId: cmd.appId, kid: signingKey.kid }, 'Creating SAML SLO response')

    // 4. Build signed LogoutResponse
    return samlIdpService.createSloResponse(
      samlConfig,
      config.IDP_BASE_URL,
      cmd.appId,
      cmd.samlRequest,
      cmd.relayState,
      {
        privateKeyPem: decryptResult.value,
        certPem: certResult.value,
        kid: signingKey.kid,
      },
    )
  }
}