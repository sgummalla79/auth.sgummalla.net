import type { ISloFanoutService, SloFanoutResult } from '../application/ports/ISloFanoutService.js'
import type { ParticipatingApp } from '../domain/SsoSession.js'
import type { IApplicationRepository } from '../../applications/application/ports/IApplicationRepository.js'
import type { ISigningKeyRepository } from '../../keys/application/ports/ISigningKeyRepository.js'
import type { IKeyEncryptionService } from '../../keys/application/ports/IKeyEncryptionService.js'
import type { ISamlIdpService } from '../../saml/application/ports/ISamlIdpService.js'
import type { ISamlCertificateService } from '../../saml/application/ports/ISamlCertificateService.js'
import type { Logger } from '../../../shared/logger/logger.js'
import type { Env } from '../../../shared/config/env.js'
import { isErr } from '../../../shared/result/Result.js'

interface Deps {
  applicationRepository: IApplicationRepository
  signingKeyRepository: ISigningKeyRepository
  keyEncryptionService: IKeyEncryptionService
  samlIdpService: ISamlIdpService
  samlCertificateService: ISamlCertificateService
  config: Env
  logger: Logger
}

/**
 * HttpSloFanoutService — sends SLO requests to all participating apps.
 *
 * SAML: builds a LogoutRequest using samlify and POSTs it to the SP's SLO URL.
 * OIDC: no active fanout needed — oidc-provider tokens are Redis-backed and
 *       expire naturally; we log the app as notified.
 *
 * All operations are best-effort — failures are logged but never thrown.
 */
export class HttpSloFanoutService implements ISloFanoutService {
  constructor(private readonly deps: Deps) {}

  async fanout(
    userId: string,
    participatingApps: ParticipatingApp[],
  ): Promise<SloFanoutResult[]> {
    const results = await Promise.allSettled(
      participatingApps.map(app => this.notifyApp(userId, app)),
    )

    return results.map((result, i) => {
      if (result.status === 'fulfilled') return result.value
      return {
        appId: participatingApps[i]!.appId,
        protocol: participatingApps[i]!.protocol,
        success: false,
        error: result.reason instanceof Error ? result.reason.message : String(result.reason),
      }
    })
  }

  private async notifyApp(userId: string, app: ParticipatingApp): Promise<SloFanoutResult> {
    if (app.protocol === 'oidc') {
      // OIDC tokens are stored in Redis with TTL — they expire naturally.
      // Full token revocation requires iterating Redis keys which is expensive.
      // M10 tracks the session; token revocation is handled at introspection time.
      this.deps.logger.debug({ userId, appId: app.appId }, 'OIDC app noted for SLO — tokens expire via Redis TTL')
      return { appId: app.appId, protocol: 'oidc', success: true }
    }

    // SAML — build and POST a LogoutRequest to the SP's SLO URL
    return this.notifySamlApp(app)
  }

  private async notifySamlApp(app: ParticipatingApp): Promise<SloFanoutResult> {
    const { applicationRepository, signingKeyRepository, keyEncryptionService,
            samlIdpService, samlCertificateService, config, logger } = this.deps

    try {
      const appResult = await applicationRepository.findWithConfig(app.appId)
      if (isErr(appResult) || !appResult.value.samlConfig?.sloUrl) {
        return { appId: app.appId, protocol: 'saml', success: true } // no SLO URL configured — skip
      }
      const { samlConfig } = appResult.value

      const keyResult = await signingKeyRepository.findActiveSigningKey()
      if (isErr(keyResult)) throw new Error('No active signing key')

      const decryptResult = await keyEncryptionService.decrypt(
        keyResult.value.encryptedPrivateKey,
        keyResult.value.encryptionIv,
      )
      if (isErr(decryptResult)) throw new Error('Key decryption failed')

      const certResult = await samlCertificateService.generateOrGetCert(
        keyResult.value.kid,
        decryptResult.value,
        keyResult.value.publicKeyPem,
      )
      if (isErr(certResult)) throw new Error('Cert generation failed')

      const sloResult = await samlIdpService.createSloResponse(
        samlConfig,
        config.IDP_BASE_URL,
        app.appId,
        '', // IDP-initiated SLO — no incoming request to parse
        undefined,
        { privateKeyPem: decryptResult.value, certPem: certResult.value, kid: keyResult.value.kid },
      )

      if (isErr(sloResult)) throw new Error(sloResult.error.message)

      // POST the LogoutRequest to the SP's SLO endpoint
      const response = await fetch(samlConfig.sloUrl!, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({ SAMLResponse: sloResult.value.samlResponse }),
        signal: AbortSignal.timeout(5000),
      })

      logger.info({ appId: app.appId, status: response.status }, 'SAML SLO fanout sent')
      return { appId: app.appId, protocol: 'saml', success: response.ok }
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e)
      logger.warn({ appId: app.appId, error: message }, 'SAML SLO fanout failed')
      return { appId: app.appId, protocol: 'saml', success: false, error: message }
    }
  }
}