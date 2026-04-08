import { eq } from 'drizzle-orm'
import { ok, err } from '../../../shared/result/Result.js'
import type { Result } from '../../../shared/result/Result.js'
import { DatabaseError, NotFoundError, ConflictError } from '../../../shared/errors/AppError.js'
import type { DrizzleClient } from '../../../infrastructure/database/postgres.client.js'
import {
  applications,
  samlConfigs,
  oidcClients,
  jwtConfigs,
} from './applications.schema.js'
import type { ApplicationStatus } from '../../../shared/types/domain-types.js'
import { Application, SamlConfig, OidcClient, JwtConfig } from '../domain/Application.js'
import type {
  IApplicationRepository, ApplicationWithConfig,
  CreateApplicationInput, CreateSamlConfigInput,
  CreateOidcClientInput, CreateJwtConfigInput, UpdateApplicationInput,
} from '../application/ports/IApplicationRepository.js'
import { sql } from 'drizzle-orm'

type AppRow = typeof applications.$inferSelect
type SamlRow = typeof samlConfigs.$inferSelect
type OidcRow = typeof oidcClients.$inferSelect
type JwtRow = typeof jwtConfigs.$inferSelect

interface Deps { db: DrizzleClient; }

export class SupabaseApplicationRepository implements IApplicationRepository {
  private readonly db: DrizzleClient

  constructor({ db }: Deps) {
    this.db = db
  }

  async save(input: CreateApplicationInput): Promise<Result<Application, DatabaseError | ConflictError>> {
    try {
      const rows = await this.db
      .insert(applications)
      .values({
        organizationId: '',        // ← ADD — placeholder until M17
        name:           input.name,
        slug:           input.slug,
        protocol:       input.protocol as AppRow['protocol'],
        logoUrl:        input.logoUrl,
        description:    input.description,
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
      const row = await this.db
        .select()
        .from(applications)
        .where(eq(applications.id, id))
        .limit(1)
        .then(rows => rows[0])

      if (!row) {
        return err(new NotFoundError(`Application not found: ${id}`))
      }

      const application = this.toDomain(row)

      const [samlRows, oidcRows, jwtRows] = await Promise.all([
        this.db.select().from(samlConfigs).where(eq(samlConfigs.applicationId, id)),
        this.db.select().from(oidcClients).where(eq(oidcClients.applicationId, id)),
        this.db.select().from(jwtConfigs).where(eq(jwtConfigs.applicationId, id)),
      ])

      return ok({
        application,
        samlConfig:  samlRows[0]  ? this.toSamlDomain(samlRows[0])  : undefined,
        oidcClient:  oidcRows[0]  ? this.toOidcDomain(oidcRows[0])  : undefined,
        jwtConfig:   jwtRows[0]   ? this.toJwtDomain(jwtRows[0])    : undefined,
      })
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e)
      if (message.includes('invalid input syntax for type uuid')) {
        return err(new NotFoundError(`Application not found: ${id}`))
      }
      return err(new DatabaseError(`Failed to find application with config: ${id}`, e))
    }
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
      const rows = await this.db
      .insert(oidcClients)
      .values({
        applicationId:           input.applicationId,
        clientId:                input.clientId,
        clientSecretHash:        input.clientSecretHash,
        redirectUris:            sql`${JSON.stringify(input.redirectUris)}::text[]`,
        postLogoutRedirectUris:  sql`${JSON.stringify(input.postLogoutUris ?? [])}::text[]`,        // ← postLogoutUris
        grantTypes:              sql`${JSON.stringify(input.grantTypes ?? ['authorization_code'])}::text[]`,
        responseTypes:           sql`${JSON.stringify(input.responseTypes ?? ['code'])}::text[]`,
        scopes:                  Array.isArray(input.scopes)
                                  ? input.scopes.join(' ')
                                  : (input.scopes ?? 'openid profile email'),
        requirePkce:             input.pkceRequired ?? true,                                        // ← pkceRequired
        tokenEndpointAuthMethod: input.tokenEndpointAuth ?? 'client_secret_basic',                  // ← tokenEndpointAuth
        accessTokenTtl:          input.accessTokenTtl ?? 3600,
        refreshTokenTtl:         input.refreshTokenTtl ?? 86400,
        idTokenTtl:              3600,                                                               // ← not in input, use default
      }).returning()
      return ok(this.toOidcDomain(rows[0]!))
    } catch (e) { return err(new DatabaseError('Failed to create OIDC client', e)) }
  }

  async saveJwtConfig(input: CreateJwtConfigInput): Promise<Result<JwtConfig, DatabaseError>> {
    try {
      const rows = await this.db
      .insert(jwtConfigs)
      .values({
        applicationId:         input.applicationId,
        clientId:              input.applicationId,                                                  // ← use applicationId as placeholder until M17
        allowedAlgorithms:     sql`${JSON.stringify([input.signingAlgorithm ?? 'RS256'])}::text[]`,
        allowedAudiences:      sql`${JSON.stringify(input.audience ?? [])}::text[]`,
        certificateThumbprint: input.certThumbprint ?? null,
        tokenTtl:              input.tokenLifetime ?? 3600,
        requireMtls:           false,
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

  async findByThumbprint(thumbprint: string): Promise<Result<ApplicationWithConfig, NotFoundError | DatabaseError>> {
    try {
      const jwtRow = await this.db
        .select()
        .from(jwtConfigs)
        .where(eq(jwtConfigs.certThumbprint, thumbprint))
        .limit(1)
        .then(rows => rows[0])

      if (!jwtRow) {
        return err(new NotFoundError(`No application found for thumbprint: ${thumbprint}`))
      }

      return this.findWithConfig(jwtRow.applicationId)
    } catch (e) {
      return err(new DatabaseError('Failed to find application by thumbprint', e))
    }
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