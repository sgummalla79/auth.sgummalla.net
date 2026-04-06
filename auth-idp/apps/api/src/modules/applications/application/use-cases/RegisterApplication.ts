import { z } from 'zod'
import { ok, err } from '../../../../shared/result/Result.js'
import type { Result } from '../../../../shared/result/Result.js'
import type { AppError } from '../../../../shared/errors/AppError.js'
import { ValidationError, ConflictError } from '../../../../shared/errors/AppError.js'
import type { Logger } from '../../../../shared/logger/logger.js'
import type { IHashService } from '../../../users/application/ports/IHashService.js'
import type { Application, SamlConfig, OidcClient, JwtConfig } from '../domain/Application.js'
import type { IApplicationRepository } from '../ports/IApplicationRepository.js'
import type { ISlugGenerator } from '../ports/ISlugGenerator.js'
import type { ICredentialGenerator } from '../ports/ICredentialGenerator.js'

const SamlInputSchema = z.object({
  entityId: z.string().url('Entity ID must be a valid URI'),
  acsUrl: z.string().url('ACS URL must be a valid URL'),
  sloUrl: z.string().url().optional(),
  spCertificate: z.string().optional(),
  nameIdFormat: z.string().optional(),
  signAssertions: z.boolean().optional(),
  signResponse: z.boolean().optional(),
  encryptAssertions: z.boolean().optional(),
  attributeMappings: z.record(z.string()).optional(),
})

const OidcInputSchema = z.object({
  redirectUris: z.array(z.string().url()).min(1, 'At least one redirect URI is required'),
  postLogoutUris: z.array(z.string().url()).optional(),
  grantTypes: z.array(z.string()).optional(),
  responseTypes: z.array(z.string()).optional(),
  scopes: z.array(z.string()).optional(),
  tokenEndpointAuth: z.enum(['client_secret_basic', 'client_secret_post', 'none']).optional(),
  pkceRequired: z.boolean().optional(),
  accessTokenTtl: z.number().int().min(60).max(86400).optional(),
  refreshTokenTtl: z.number().int().min(3600).optional(),
})

const JwtInputSchema = z.object({
  signingAlgorithm: z.enum(['RS256', 'RS384', 'RS512', 'ES256', 'ES384', 'ES512']).optional(),
  publicKey: z.string().optional(),
  certThumbprint: z.string().optional(),
  tokenLifetime: z.number().int().min(60).max(86400).optional(),
  audience: z.array(z.string()).optional(),
  customClaims: z.record(z.unknown()).optional(),
})

const RegisterApplicationSchema = z.discriminatedUnion('protocol', [
  z.object({ protocol: z.literal('saml'), name: z.string().min(1).max(100),
    logoUrl: z.string().url().optional(), description: z.string().max(500).optional(),
    saml: SamlInputSchema }),
  z.object({ protocol: z.literal('oidc'), name: z.string().min(1).max(100),
    logoUrl: z.string().url().optional(), description: z.string().max(500).optional(),
    oidc: OidcInputSchema }),
  z.object({ protocol: z.literal('jwt'), name: z.string().min(1).max(100),
    logoUrl: z.string().url().optional(), description: z.string().max(500).optional(),
    jwt: JwtInputSchema }),
])

export interface RegisterApplicationResult {
  application: Application
  samlConfig?: SamlConfig
  oidcClient?: OidcClient
  oidcClientSecret?: string
  jwtConfig?: JwtConfig
}

interface Deps {
  applicationRepository: IApplicationRepository
  slugGenerator: ISlugGenerator
  credentialGenerator: ICredentialGenerator
  hashService: IHashService
  logger: Logger
}

export class RegisterApplicationUseCase {
  private readonly repo: IApplicationRepository
  private readonly slugs: ISlugGenerator
  private readonly creds: ICredentialGenerator
  private readonly hash: IHashService
  private readonly logger: Logger

  constructor({ applicationRepository, slugGenerator, credentialGenerator, hashService, logger }: Deps) {
    this.repo = applicationRepository
    this.slugs = slugGenerator
    this.creds = credentialGenerator
    this.hash = hashService
    this.logger = logger
  }

  async execute(cmd: unknown): Promise<Result<RegisterApplicationResult, AppError>> {
    const parsed = RegisterApplicationSchema.safeParse(cmd)
    if (!parsed.success) {
      const fields: Record<string, string[]> = {}
      for (const issue of parsed.error.issues) {
        const key = issue.path.join('.') || 'unknown'
        if (!fields[key]) fields[key] = []
        fields[key]!.push(issue.message)
      }
      return err(new ValidationError('Invalid application registration data', fields))
    }

    const data = parsed.data
    const slug = this.slugs.generate(data.name)

    const existing = await this.repo.findBySlug(slug)
    if (existing.isOk()) {
      return err(new ConflictError(`An application with the name "${data.name}" already exists`))
    }

    const appResult = await this.repo.save({
      name: data.name, slug, protocol: data.protocol,
      logoUrl: data.logoUrl, description: data.description,
    })
    if (appResult.isErr()) return err(appResult.error)

    const application = appResult.value
    this.logger.info({ appId: application.id, protocol: data.protocol }, 'Application registered')

    if (data.protocol === 'saml') {
      const samlResult = await this.repo.saveSamlConfig({ applicationId: application.id, ...data.saml })
      if (samlResult.isErr()) return err(samlResult.error)
      return ok({ application, samlConfig: samlResult.value })
    }

    if (data.protocol === 'oidc') {
      const clientId = this.creds.generateClientId()
      const clientSecret = this.creds.generateClientSecret()
      const hashResult = await this.hash.hash(clientSecret)
      if (hashResult.isErr()) return err(hashResult.error)
      const oidcResult = await this.repo.saveOidcClient({
        applicationId: application.id, clientId, clientSecretHash: hashResult.value,
        redirectUris: data.oidc.redirectUris, postLogoutUris: data.oidc.postLogoutUris,
        grantTypes: data.oidc.grantTypes, responseTypes: data.oidc.responseTypes,
        scopes: data.oidc.scopes, tokenEndpointAuth: data.oidc.tokenEndpointAuth,
        pkceRequired: data.oidc.pkceRequired, accessTokenTtl: data.oidc.accessTokenTtl,
        refreshTokenTtl: data.oidc.refreshTokenTtl,
      })
      if (oidcResult.isErr()) return err(oidcResult.error)
      return ok({ application, oidcClient: oidcResult.value, oidcClientSecret: clientSecret })
    }

    if (data.protocol === 'jwt') {
      const jwtResult = await this.repo.saveJwtConfig({ applicationId: application.id, ...data.jwt })
      if (jwtResult.isErr()) return err(jwtResult.error)
      return ok({ application, jwtConfig: jwtResult.value })
    }

    return ok({ application })
  }
}