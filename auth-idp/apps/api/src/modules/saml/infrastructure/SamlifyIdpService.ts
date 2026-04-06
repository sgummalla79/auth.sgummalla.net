import { IdentityProvider, ServiceProvider, setSchemaValidator } from 'samlify'
import { ok, err } from '../../../shared/result/Result.js'
import type { Result } from '../../../shared/result/Result.js'
import { InternalError } from '../../../shared/errors/AppError.js'
import type { SamlConfig } from '../../applications/domain/Application.js'
import type { ISamlIdpService, IdpKeyMaterial, SsoResponse, SloResponse } from '../application/ports/ISamlIdpService.js'
import type { SamlAssertion } from '../domain/SamlAssertion.js'
import type { Logger } from '../../../shared/logger/logger.js'

// Skip XML schema validation in development.
// Production: replace with @authenio/samlify-xsd-schema-validator
setSchemaValidator({ validate: () => Promise.resolve('') })

const POST_BINDING = 'urn:oasis:names:tc:SAML:2.0:bindings:HTTP-POST'

interface Deps {
  logger: Logger
}

export class SamlifyIdpService implements ISamlIdpService {
  private readonly logger: Logger

  constructor({ logger }: Deps) {
    this.logger = logger.child({ service: 'SamlifyIdpService' })
  }

  // ─── Metadata ────────────────────────────────────────────────────────────

  async getMetadata(
    config: SamlConfig,
    idpBaseUrl: string,
    appId: string,
    keyMaterial: IdpKeyMaterial,
  ): Promise<Result<string, InternalError>> {
    try {
      const idp = this.buildIdp(appId, config, idpBaseUrl, keyMaterial, [])
      const xml = idp.entityMeta.getMetadata()
      return ok(xml)
    } catch (e) {
      return err(new InternalError('Failed to build SAML IDP metadata', e))
    }
  }

  // ─── SSO ─────────────────────────────────────────────────────────────────

  async createSsoResponse(
    config: SamlConfig,
    idpBaseUrl: string,
    appId: string,
    samlRequest: string,
    relayState: string | undefined,
    assertion: SamlAssertion,
    keyMaterial: IdpKeyMaterial,
  ): Promise<Result<SsoResponse, InternalError>> {
    try {
      // Build attribute definitions from this app's attributeMappings.
      // Keys are internal claim names; values are SP attribute names.
      // samlify's valueTag uses the key to look up a property on the user object.
      const attributeDefs = Object.entries(config.attributeMappings).map(
        ([internalName, spAttributeName]) => ({
          name: spAttributeName,
          valueTag: internalName,
          nameFormat: 'urn:oasis:names:tc:SAML:2.0:attrname-format:basic',
          valueXsiType: 'xs:string',
        }),
      )

      const idp = this.buildIdp(appId, config, idpBaseUrl, keyMaterial, attributeDefs)
      const sp  = this.buildSp(config)

      const requestInfo = await idp.parseLoginRequest(sp, 'post', {
        body: {
          SAMLRequest: samlRequest,
          RelayState: relayState ?? '',
        },
      })

      const user = assertion.toSamlifyUser()

      const loginResult = await idp.createLoginResponse(sp, requestInfo, 'post', user) as { context: string; entityEndpoint: string }
      const { context: samlResponse, entityEndpoint } = loginResult

      this.logger.debug({ appId, nameId: assertion.nameId }, 'SAML SSO response created')

      return ok({
        binding: 'post',
        endpoint: (entityEndpoint as string) ?? config.acsUrl,
        samlResponse: samlResponse as string,
        relayState,
      })
    } catch (e) {
      return err(new InternalError('Failed to create SAML SSO response', e))
    }
  }

  // ─── SLO ─────────────────────────────────────────────────────────────────

  async createSloResponse(
    config: SamlConfig,
    idpBaseUrl: string,
    appId: string,
    samlRequest: string,
    relayState: string | undefined,
    keyMaterial: IdpKeyMaterial,
  ): Promise<Result<SloResponse, InternalError>> {
    try {
      const idp = this.buildIdp(appId, config, idpBaseUrl, keyMaterial, [])
      const sp  = this.buildSp(config)

      const requestInfo = await idp.parseLogoutRequest(sp, 'post', {
        body: {
          SAMLRequest: samlRequest,
          RelayState: relayState ?? '',
        },
      })

      const logoutResult = await idp.createLogoutResponse(sp, requestInfo, 'post', relayState ?? '') as { context: string; entityEndpoint: string }
      const { context: samlResponse, entityEndpoint } = logoutResult

      this.logger.debug({ appId }, 'SAML SLO response created')

      return ok({
        binding: 'post',
        endpoint: (entityEndpoint as string) ?? (config.sloUrl ?? config.acsUrl),
        samlResponse: samlResponse as string,
        relayState,
      })
    } catch (e) {
      return err(new InternalError('Failed to create SAML SLO response', e))
    }
  }

  // ─── Builders ────────────────────────────────────────────────────────────

  private buildIdp(
    appId: string,
    config: SamlConfig,
    idpBaseUrl: string,
    keyMaterial: IdpKeyMaterial,
    attributeDefs: {
      name: string
      valueTag: string
      nameFormat: string
      valueXsiType: string
    }[],
  ) {
    const sloServices = config.sloUrl
      ? [{ Binding: POST_BINDING, Location: `${idpBaseUrl}/saml/${appId}/slo` }]
      : []

    return IdentityProvider({
      entityID:              `${idpBaseUrl}/saml/${appId}/metadata`,
      privateKey:            keyMaterial.privateKeyPem,
      signingCert:           keyMaterial.certPem,
      isAssertionEncrypted:  config.encryptAssertions,
      wantAuthnRequestsSigned: false,
      loginResponseTemplate: {
        context: undefined as unknown as string, // use samlify default template
        attributes: attributeDefs,
      },
      nameIDFormat: [config.nameIdFormat],
      singleSignOnService: [
        { Binding: POST_BINDING, Location: `${idpBaseUrl}/saml/${appId}/sso` },
      ],
      singleLogoutService: sloServices,
    })
  }

  private buildSp(config: SamlConfig) {
    return ServiceProvider({
      entityID: config.entityId,
      assertionConsumerService: [
        { Binding: POST_BINDING, Location: config.acsUrl },
      ],
      ...(config.sloUrl
        ? { singleLogoutService: [{ Binding: POST_BINDING, Location: config.sloUrl }] }
        : {}),
      ...(config.spCertificate ? { signingCert: config.spCertificate } : {}),
      allowCreate: true,
      isAssertionEncrypted: false,
    })
  }
}