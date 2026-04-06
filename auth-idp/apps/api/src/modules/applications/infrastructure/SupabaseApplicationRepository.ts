import { eq } from 'drizzle-orm'
import { ok, err } from '../../../shared/result/Result.js'
import type { Result } from '../../../shared/result/Result.js'
import { DatabaseError, NotFoundError, ConflictError } from '../../../shared/errors/AppError.js'
import type { Logger } from '../../../shared/logger/logger.js'
import type { DrizzleClient } from '../../../infrastructure/database/postgres.client.js'
import { applications, samlConfigs, oidcClients, jwtConfigs } from '../../../database/index.js'
import type {
  Application as AppRow, SamlConfig as SamlRow,
  OidcClient as OidcRow, JwtConfig as JwtRow, ApplicationStatus,
} from '../../../database/index.js'
import { Application, SamlConfig, OidcClient, JwtConfig } from '../domain/Application.js'
import type {
  IApplicationRepository, ApplicationWithConfig,
  CreateApplicationInput, CreateSamlConfigInput,
  CreateOidcClientInput, CreateJwtConfigInput, UpdateApplicationInput,
} from '../application/ports/IApplicationRepository.js'

interface Deps { db: DrizzleClient; logger: Logger }

export class SupabaseApplicationRepository implements IApplicationRepository {
  private readonly db: DrizzleClient
  private readonly logger: Logger
  constructor({ db, logger }: Deps) {
    this.db = db
    this.logger = logger.child({ repository: 'ApplicationRepository' })
  }

  async save(input: CreateApplicationInput): Promise<Result<Application, DatabaseError | ConflictError>> {
    try {
      const rows = await this.db.insert(applications).values({
        name: input.name, slug: input.slug,
        protocol: input.protocol as AppRow['protocol'],
        logoUrl: input.logoUrl, description: input.description,
      }).returning()
      return ok(this.toDomain(rows[0]!))
    } catch (e: unknown) {
      if (e instanceof Error && e.message.includes('unique')) {
        return err(new ConflictError('Application slug already exists'))
      }
      return err(new DatabaseError('Failed to create application', e))
    }
  }

  async findById(id: string): Promise<Result<Application, NotFoundError | DatabaseError>> {
    try {
      const row = await this.db.query.applications.findFirst({ where: eq(applications.id, id) })
      if (!row) return err(new NotFoundError(`Application not found: ${id}`))
      return ok(this.toDomain(row))
    } catch (e) { return err(new DatabaseError(`Failed to find application: ${id}`, e)) }
  }

  async findBySlug(slug: string): Promise<Result<Application, NotFoundError | DatabaseError>> {
    try {
      const row = await this.db.query.applications.findFirst({ where: eq(applications.slug, slug) })
      if (!row) return err(new NotFoundError(`Application not found: ${slug}`))
      return ok(this.toDomain(row))
    } catch (e) { return err(new DatabaseError(`Failed to find application by slug: ${slug}`, e)) }
  }

  async findAll(): Promise<Result<Application[], DatabaseError>> {
    try {
      const rows = await this.db.query.applications.findMany()
      return ok(rows.map(this.toDomain.bind(this)))
    } catch (e) { return err(new DatabaseError('Failed to list applications', e)) }
  }

  async update(id: string, input: UpdateApplicationInput): Promise<Result<Application, DatabaseError>> {
    try {
      const rows = await this.db.update(applications).set({
        ...(input.name !== undefined && { name: input.name }),
        ...(input.logoUrl !== undefined && { logoUrl: input.logoUrl }),
        ...(input.description !== undefined && { description: input.description }),
        ...(input.status !== undefined && { status: input.status as ApplicationStatus }),
      }).where(eq(applications.id, id)).returning()
      return ok(this.toDomain(rows[0]!))
    } catch (e) { return err(new DatabaseError(`Failed to update application: ${id}`, e)) }
  }

  async findWithConfig(id: string): Promise<Result<ApplicationWithConfig, NotFoundError | DatabaseError>> {
    try {
      const app = await this.db.query.applications.findFirst({
        where: eq(applications.id, id),
        with: { samlConfig: true, oidcClient: true, jwtConfig: true },
      })
      if (!app) return err(new NotFoundError(`Application not found: ${id}`))
      const result: ApplicationWithConfig = { application: this.toDomain(app) }
      if (app.samlConfig) result.samlConfig = this.toSamlDomain(app.samlConfig)
      if (app.oidcClient) result.oidcClient = this.toOidcDomain(app.oidcClient)
      if (app.jwtConfig) result.jwtConfig = this.toJwtDomain(app.jwtConfig)
      return ok(result)
    } catch (e) { return err(new DatabaseError(`Failed to find application with config: ${id}`, e)) }
  }

  async saveSamlConfig(input: CreateSamlConfigInput): Promise<Result<SamlConfig, DatabaseError>> {
    try {
      const rows = await this.db.insert(samlConfigs).values({
        applicationId: input.applicationId, entityId: input.entityId, acsUrl: input.acsUrl,
        sloUrl: input.sloUrl, spCertificate: input.spCertificate,
        nameIdFormat: input.nameIdFormat ?? 'urn:oasis:names:tc:SAML:1.1:nameid-format:emailAddress',
        signAssertions: input.signAssertions ?? true, signResponse: input.signResponse ?? true,
        encryptAssertions: input.encryptAssertions ?? false,
        attributeMappings: input.attributeMappings ?? {},
      }).returning()
      return ok(this.toSamlDomain(rows[0]!))
    } catch (e) { return err(new DatabaseError('Failed to create SAML config', e)) }
  }

  async saveOidcClient(input: CreateOidcClientInput): Promise<Result<OidcClient, DatabaseError>> {
    try {
      const rows = await this.db.insert(oidcClients).values({
        applicationId: input.applicationId, clientId: input.clientId,
        clientSecretHash: input.clientSecretHash, redirectUris: input.redirectUris,
        postLogoutUris: input.postLogoutUris ?? [], grantTypes: input.grantTypes ?? ['authorization_code'],
        responseTypes: input.responseTypes ?? ['code'],
        scopes: input.scopes ?? ['openid', 'profile', 'email'],
        tokenEndpointAuth: input.tokenEndpointAuth ?? 'client_secret_basic',
        pkceRequired: input.pkceRequired ?? true,
        accessTokenTtl: input.accessTokenTtl, refreshTokenTtl: input.refreshTokenTtl,
      }).returning()
      return ok(this.toOidcDomain(rows[0]!))
    } catch (e) { return err(new DatabaseError('Failed to create OIDC client', e)) }
  }

  async saveJwtConfig(input: CreateJwtConfigInput): Promise<Result<JwtConfig, DatabaseError>> {
    try {
      const rows = await this.db.insert(jwtConfigs).values({
        applicationId: input.applicationId, signingAlgorithm: input.signingAlgorithm ?? 'RS256',
        publicKey: input.publicKey, certThumbprint: input.certThumbprint,
        tokenLifetime: input.tokenLifetime ?? 3600,
        audience: input.audience ?? [], customClaims: input.customClaims ?? {},
      }).returning()
      return ok(this.toJwtDomain(rows[0]!))
    } catch (e) { return err(new DatabaseError('Failed to create JWT config', e)) }
  }

  async findOidcClientByClientId(clientId: string): Promise<Result<OidcClient, NotFoundError | DatabaseError>> {
    try {
      const row = await this.db.query.oidcClients.findFirst({ where: eq(oidcClients.clientId, clientId) })
      if (!row) return err(new NotFoundError(`OIDC client not found: ${clientId}`))
      return ok(this.toOidcDomain(row))
    } catch (e) { return err(new DatabaseError(`Failed to find OIDC client: ${clientId}`, e)) }
  }

  private toDomain(row: AppRow): Application {
    return new Application(row.id, row.name, row.slug, row.protocol,
      row.status, row.logoUrl, row.description, row.createdAt, row.updatedAt)
  }

  private toSamlDomain(row: SamlRow): SamlConfig {
    return new SamlConfig(row.id, row.applicationId, row.entityId, row.acsUrl,
      row.sloUrl, row.spCertificate, row.nameIdFormat, row.signAssertions,
      row.signResponse, row.encryptAssertions, row.attributeMappings as Record<string, string>)
  }

  private toOidcDomain(row: OidcRow): OidcClient {
    return new OidcClient(row.id, row.applicationId, row.clientId, row.clientSecretHash,
      row.redirectUris, row.postLogoutUris, row.grantTypes, row.responseTypes,
      row.scopes, row.tokenEndpointAuth, row.pkceRequired, row.accessTokenTtl, row.refreshTokenTtl)
  }

  private toJwtDomain(row: JwtRow): JwtConfig {
    return new JwtConfig(row.id, row.applicationId, row.signingAlgorithm,
      row.publicKey, row.certThumbprint, row.tokenLifetime,
      row.audience, row.customClaims as Record<string, unknown>)
  }
}