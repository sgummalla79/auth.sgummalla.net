import Provider from 'oidc-provider'
import type { Configuration } from 'oidc-provider'
import type { Redis } from 'ioredis'
import { importPKCS8, exportJWK } from 'jose'
import type { Env } from '../../../shared/config/env.js'
import type { IUserRepository } from '../../users/application/ports/IUserRepository.js'
import type { IApplicationRepository } from '../../applications/application/ports/IApplicationRepository.js'
import type { ISigningKeyRepository } from '../../keys/application/ports/ISigningKeyRepository.js'
import type { IKeyEncryptionService } from '../../keys/application/ports/IKeyEncryptionService.js'
import type { Logger } from '../../../shared/logger/logger.js'
import { OidcAdapter, initOidcAdapter } from '../adapter/RedisOidcAdapter.js'
import { OidcAccountAdapter } from '../adapter/OidcAccountAdapter.js'
import { isErr } from '../../../shared/result/Result.js'

export async function buildOidcProvider(deps: {
  config: Env
  redis: Redis
  userRepository: IUserRepository
  applicationRepository: IApplicationRepository
  signingKeyRepository: ISigningKeyRepository
  keyEncryptionService: IKeyEncryptionService
  logger: Logger
}): Promise<Provider> {
  const { config, redis, userRepository, applicationRepository, signingKeyRepository, keyEncryptionService, logger } = deps

  const accountAdapter = new OidcAccountAdapter(userRepository, logger)
  const jwks = await buildJwks(signingKeyRepository, keyEncryptionService, logger)

  initOidcAdapter(redis, () => applicationRepository, logger)

  const configuration: Configuration = {
    adapter: OidcAdapter,
    jwks,

    async findAccount(ctx, sub) {
      return accountAdapter.findAccount(ctx, sub)
    },

    async loadExistingGrant(ctx) {
      const grantId = ctx.oidc.result?.consent?.grantId
        || ctx.oidc.session?.grantIdFor(ctx.oidc.client!.clientId)

      if (grantId) {
        const grant = await ctx.oidc.provider.Grant.find(grantId)
        if (grant) return grant
      }

      // Auto-grant all scopes — skip consent screen for enterprise IDP
      const grant = new ctx.oidc.provider.Grant({
        accountId: ctx.oidc.session!.accountId,
        clientId: ctx.oidc.client!.clientId,
      })
      grant.addOIDCScope('openid email profile offline_access')
      await grant.save()
      return grant
    },

    clientAuthMethods: ['none', 'client_secret_basic', 'client_secret_post'],

    interactions: {
      url(_ctx, interaction) {
        return `/oidc/interaction/${interaction.uid}`
      },
    },

    features: {
      devInteractions: { enabled: false },
      introspection: { enabled: true },
      revocation: { enabled: true },
      clientCredentials: { enabled: true },
      rpInitiatedLogout: { enabled: true },
    },

    scopes: ['openid', 'offline_access', 'profile', 'email'],

    claims: {
      openid: ['sub'],
      email: ['email', 'email_verified'],
      profile: ['name', 'given_name', 'family_name', 'picture', 'locale', 'zoneinfo', 'updated_at'],
    },

    ttl: {
      AccessToken: 3600,
      AuthorizationCode: 300,
      BackchannelAuthenticationRequest: 600,
      ClientCredentials: 3600,
      DeviceCode: 600,
      Grant: 1_209_600,
      IdToken: 3600,
      Interaction: 3600,
      RefreshToken: 1_209_600,
      Session: 1_209_600,
    },

    pkce: {
      required(_ctx, client) {
        return client.tokenEndpointAuthMethod === 'none'
      },
    },

    cookies: {
      keys: [config.COOKIE_SECRET],
      long: { signed: true, secure: config.NODE_ENV === 'production', sameSite: 'lax', httpOnly: true },
      short: { signed: true, secure: config.NODE_ENV === 'production', sameSite: 'lax', httpOnly: true },
    },

    routes: {
      authorization: '/oidc/auth',
      backchannel_authentication: '/oidc/backchannel',
      code_verification: '/oidc/device',
      device_authorization: '/oidc/device/auth',
      end_session: '/oidc/end_session',
      introspection: '/oidc/introspect',
      jwks: '/oidc/jwks',
      pushed_authorization_request: '/oidc/request',
      registration: '/oidc/register',
      revocation: '/oidc/revoke',
      token: '/oidc/token',
      userinfo: '/oidc/userinfo',
    },

    renderError(ctx, _out, error) {
      logger.error({ 
        error,
        message: error.message,
        cause: error.cause,
        stack: error.stack,
      }, 'OIDC provider error')
      ctx.type = 'application/json'
      ctx.body = {
        code:    'OIDC_ERROR',
        message: error.message,
        detail:  error.cause instanceof Error
                  ? error.cause.message
                  : (error as any).error_detail,
      }
    },
  }

  return new Provider(config.IDP_ISSUER, configuration)
}

async function buildJwks(
  signingKeyRepository: ISigningKeyRepository,
  keyEncryptionService: IKeyEncryptionService,
  logger: Logger,
): Promise<{ keys: object[] }> {
  const keysResult = await signingKeyRepository.findPublicKeys('')
  if (isErr(keysResult) || keysResult.value.length === 0) {
    logger.warn('No signing keys found for OIDC provider')
    return { keys: [] }
  }

  const keys: object[] = []

  for (const key of keysResult.value) {
    if (!key.canVerify()) continue

    // Decrypt the PEM private key
    const decryptResult = keyEncryptionService.decrypt(
      key.encryptedPrivateKey,
      key.encryptionIv,
    )
    if (isErr(decryptResult)) {
      logger.error({ kid: key.kid }, 'Failed to decrypt signing key')
      continue
    }

    try {
      // Import the PEM private key and convert to JWK format
      // oidc-provider needs a full JWK with n, e, d, p, q, dp, dq, qi
      const privateKey = await importPKCS8(decryptResult.value, key.algorithm, { extractable: true })
      const jwk = await exportJWK(privateKey)

      keys.push({
        ...jwk,
        kid: key.kid,
        alg: key.algorithm,
        use: 'sig',
      })
    } catch (error) {
      logger.error({ kid: key.kid, err: error }, 'Failed to convert key to JWK')
      continue
    }
  }

  return { keys }
}