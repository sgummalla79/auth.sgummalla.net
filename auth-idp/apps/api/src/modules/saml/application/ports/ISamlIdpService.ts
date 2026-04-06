import type { Result } from '../../../../shared/result/Result.js'
import type { AppError } from '../../../../shared/errors/AppError.js'
import type { SamlConfig } from '../../../applications/domain/Application.js'
import type { SamlAssertion } from '../../domain/SamlAssertion.js'

export interface IdpKeyMaterial {
  privateKeyPem: string   // RSA private key (PKCS#8 PEM)
  certPem: string         // Self-signed X.509 cert PEM (built from the RSA key)
  kid: string
}

export interface SsoResponse {
  binding: 'post'
  endpoint: string        // ACS URL to POST to
  samlResponse: string    // Base64-encoded SAML Response
  relayState?: string
}

export interface SloResponse {
  binding: 'post'
  endpoint: string        // SLO return URL to POST to
  samlResponse: string    // Base64-encoded SAML LogoutResponse
  relayState?: string
}

export interface ISamlIdpService {
  /** Return IDP metadata XML for this app. */
  getMetadata(
    config: SamlConfig,
    idpBaseUrl: string,
    appId: string,
    keyMaterial: IdpKeyMaterial,
  ): Promise<Result<string, AppError>>

  /** Parse an AuthnRequest and produce a signed SAML Response. */
  createSsoResponse(
    config: SamlConfig,
    idpBaseUrl: string,
    appId: string,
    samlRequest: string,      // Base64 SAMLRequest from SP
    relayState: string | undefined,
    assertion: SamlAssertion,
    keyMaterial: IdpKeyMaterial,
  ): Promise<Result<SsoResponse, AppError>>

  /** Parse a LogoutRequest and produce a SAML LogoutResponse. */
  createSloResponse(
    config: SamlConfig,
    idpBaseUrl: string,
    appId: string,
    samlRequest: string,
    relayState: string | undefined,
    keyMaterial: IdpKeyMaterial,
  ): Promise<Result<SloResponse, AppError>>
}