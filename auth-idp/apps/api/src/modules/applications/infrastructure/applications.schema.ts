import {
  pgTable,
  pgEnum,
  uuid,
  text,
  boolean,
  timestamp,
  jsonb,
  integer,
  index,
  uniqueIndex,
} from 'drizzle-orm/pg-core'
import { relations } from 'drizzle-orm'

// ─── Enums ────────────────────────────────────────────────────────────────────

export const authProtocolEnum = pgEnum('auth_protocol', ['saml', 'oidc', 'jwt'])

export const applicationStatusEnum = pgEnum('application_status', [
  'active',
  'inactive',
  'suspended',
])

// ─── Applications ─────────────────────────────────────────────────────────────

export const applications = pgTable(
  'applications',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    name: text('name').notNull(),
    slug: text('slug').notNull(),
    protocol: authProtocolEnum('protocol').notNull(),
    status: applicationStatusEnum('status').notNull().default('active'),
    logoUrl: text('logo_url'),
    description: text('description'),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => ({
    slugIdx: uniqueIndex('applications_slug_idx').on(t.slug),
    statusIdx: index('applications_status_idx').on(t.status),
  }),
)

// ─── SAML Config ──────────────────────────────────────────────────────────────

export const samlConfigs = pgTable(
  'saml_configs',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    applicationId: uuid('application_id')
      .notNull()
      .references(() => applications.id, { onDelete: 'cascade' }),
    entityId: text('entity_id').notNull(),
    acsUrl: text('acs_url').notNull(),
    sloUrl: text('slo_url'),
    spCertificate: text('sp_certificate'),
    nameIdFormat: text('name_id_format')
      .notNull()
      .default('urn:oasis:names:tc:SAML:1.1:nameid-format:emailAddress'),
    signAssertions: boolean('sign_assertions').notNull().default(true),
    signResponse: boolean('sign_response').notNull().default(true),
    encryptAssertions: boolean('encrypt_assertions').notNull().default(false),
    attributeMappings: jsonb('attribute_mappings')
      .$type<Record<string, string>>()
      .notNull()
      .default({}),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => ({
    appIdx: index('saml_configs_application_id_idx').on(t.applicationId),
    entityIdx: uniqueIndex('saml_configs_entity_id_idx').on(t.entityId),
  }),
)

// ─── OIDC Client ──────────────────────────────────────────────────────────────

export const oidcClients = pgTable(
  'oidc_clients',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    applicationId: uuid('application_id')
      .notNull()
      .references(() => applications.id, { onDelete: 'cascade' }),
    clientId: text('client_id').notNull(),
    clientSecretHash: text('client_secret_hash').notNull(),
    redirectUris: text('redirect_uris').array().notNull(),
    postLogoutUris: text('post_logout_uris').array().notNull().default([]),
    grantTypes: text('grant_types').array().notNull().default(['authorization_code']),
    responseTypes: text('response_types').array().notNull().default(['code']),
    scopes: text('scopes').array().notNull().default(['openid', 'profile', 'email']),
    tokenEndpointAuth: text('token_endpoint_auth').notNull().default('client_secret_basic'),
    pkceRequired: boolean('pkce_required').notNull().default(true),
    accessTokenTtl: integer('access_token_ttl'),
    refreshTokenTtl: integer('refresh_token_ttl'),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => ({
    clientIdIdx: uniqueIndex('oidc_clients_client_id_idx').on(t.clientId),
    appIdx: index('oidc_clients_application_id_idx').on(t.applicationId),
  }),
)

// ─── JWT Config ───────────────────────────────────────────────────────────────

export const jwtConfigs = pgTable(
  'jwt_configs',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    applicationId: uuid('application_id')
      .notNull()
      .references(() => applications.id, { onDelete: 'cascade' }),
    signingAlgorithm: text('signing_algorithm').notNull().default('RS256'),
    publicKey: text('public_key'),
    certThumbprint: text('cert_thumbprint'),
    tokenLifetime: integer('token_lifetime').notNull().default(3600),
    audience: text('audience').array().notNull().default([]),
    customClaims: jsonb('custom_claims')
      .$type<Record<string, unknown>>()
      .notNull()
      .default({}),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => ({
    appIdx: uniqueIndex('jwt_configs_application_id_idx').on(t.applicationId),
    thumbprintIdx: index('jwt_configs_cert_thumbprint_idx').on(t.certThumbprint),
  }),
)

// ─── Relations ────────────────────────────────────────────────────────────────

export const applicationsRelations = relations(applications, ({ one }) => ({
  samlConfig: one(samlConfigs, {
    fields: [applications.id],
    references: [samlConfigs.applicationId],
  }),
  oidcClient: one(oidcClients, {
    fields: [applications.id],
    references: [oidcClients.applicationId],
  }),
  jwtConfig: one(jwtConfigs, {
    fields: [applications.id],
    references: [jwtConfigs.applicationId],
  }),
}))

export const samlConfigsRelations = relations(samlConfigs, ({ one }) => ({
  application: one(applications, {
    fields: [samlConfigs.applicationId],
    references: [applications.id],
  }),
}))

export const oidcClientsRelations = relations(oidcClients, ({ one }) => ({
  application: one(applications, {
    fields: [oidcClients.applicationId],
    references: [applications.id],
  }),
}))

export const jwtConfigsRelations = relations(jwtConfigs, ({ one }) => ({
  application: one(applications, {
    fields: [jwtConfigs.applicationId],
    references: [applications.id],
  }),
}))

// ─── TypeScript types ─────────────────────────────────────────────────────────

export type Application = typeof applications.$inferSelect
export type NewApplication = typeof applications.$inferInsert
export type SamlConfig = typeof samlConfigs.$inferSelect
export type NewSamlConfig = typeof samlConfigs.$inferInsert
export type OidcClient = typeof oidcClients.$inferSelect
export type NewOidcClient = typeof oidcClients.$inferInsert
export type JwtConfig = typeof jwtConfigs.$inferSelect
export type NewJwtConfig = typeof jwtConfigs.$inferInsert
export type AuthProtocol = (typeof authProtocolEnum.enumValues)[number]
export type ApplicationStatus = (typeof applicationStatusEnum.enumValues)[number]