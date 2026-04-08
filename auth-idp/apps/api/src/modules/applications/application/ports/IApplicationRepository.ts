import type { Result } from '../../../../shared/result/Result.js'
import type { DatabaseError, NotFoundError, ConflictError } from '../../../../shared/errors/AppError.js'
import type { ApplicationStatus } from '../../../../shared/types/domain-types.js'
import type { Application, SamlConfig, OidcClient, JwtConfig } from '../../domain/Application.js'

export interface ApplicationWithConfig {
  application: Application
  samlConfig?: SamlConfig
  oidcClient?: OidcClient
  jwtConfig?: JwtConfig
}

export interface CreateApplicationInput {
  organizationId?: string; name: string; slug: string; protocol: string; logoUrl?: string; description?: string
}

export interface CreateSamlConfigInput {
  applicationId: string; entityId: string; acsUrl: string; sloUrl?: string
  spCertificate?: string; nameIdFormat?: string; signAssertions?: boolean
  signResponse?: boolean; encryptAssertions?: boolean; attributeMappings?: Record<string, string>
}

export interface CreateOidcClientInput {
  applicationId: string; clientId: string; clientSecretHash: string
  redirectUris: string[]; postLogoutUris?: string[]; grantTypes?: string[]
  responseTypes?: string[]; scopes?: string[]; tokenEndpointAuth?: string
  pkceRequired?: boolean; accessTokenTtl?: number; refreshTokenTtl?: number
}

export interface CreateJwtConfigInput {
  applicationId: string; signingAlgorithm?: string; publicKey?: string
  certThumbprint?: string; tokenLifetime?: number; audience?: string[]
  customClaims?: Record<string, unknown>
}

export interface UpdateApplicationInput {
  name?: string; logoUrl?: string; description?: string; status?: ApplicationStatus
}

export interface IApplicationRepository {
  save(input: CreateApplicationInput): Promise<Result<Application, DatabaseError | ConflictError>>
  findById(id: string): Promise<Result<Application, NotFoundError | DatabaseError>>
  findBySlug(slug: string): Promise<Result<Application, NotFoundError | DatabaseError>>
  findAll(): Promise<Result<Application[], DatabaseError>>
  update(id: string, input: UpdateApplicationInput): Promise<Result<Application, DatabaseError>>
  findWithConfig(id: string): Promise<Result<ApplicationWithConfig, NotFoundError | DatabaseError>>
  saveSamlConfig(input: CreateSamlConfigInput): Promise<Result<SamlConfig, DatabaseError>>
  saveOidcClient(input: CreateOidcClientInput): Promise<Result<OidcClient, DatabaseError>>
  saveJwtConfig(input: CreateJwtConfigInput): Promise<Result<JwtConfig, DatabaseError>>
  findOidcClientByClientId(clientId: string): Promise<Result<OidcClient, NotFoundError | DatabaseError>>
  findByThumbprint(thumbprint: string): Promise<Result<ApplicationWithConfig, NotFoundError | DatabaseError>>
}