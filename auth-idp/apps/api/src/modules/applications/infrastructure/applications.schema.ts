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
import { organizations } from '../../organizations/infrastructure/organizations.schema'
import { sql } from 'drizzle-orm'

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
    id:             uuid('id').primaryKey().defaultRandom(),
    organizationId: uuid('organization_id')
                      .notNull()
                      .references(() => organizations.id, { onDelete: 'cascade' }),
    name:           text('name').notNull(),
    slug:           text('slug').notNull(),
    protocol:       authProtocolEnum('protocol').notNull(),
    status:         applicationStatusEnum('status').notNull().default('active'),
    logoUrl:        text('logo_url'),
    description:    text('description'),
    createdAt:      timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt:      timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => ({
    orgIdx:         index('applications_organization_id_idx').on(t.organizationId),
    slugIdx:        uniqueIndex('applications_slug_idx').on(t.organizationId, t.slug), // slug unique per org
    statusIdx:      index('applications_status_idx').on(t.status),
  }),
)

// ─── Scopes ───────────────────────────────────────────────────────────────────
// API authorization scopes — scoped per application

export const scopes = pgTable(
  'scopes',
  {
    id:            uuid('id').primaryKey().defaultRandom(),
    applicationId: uuid('application_id')
                     .notNull()
                     .references(() => applications.id, { onDelete: 'cascade' }),
    name:          text('name').notNull(),         // e.g. "read:reports", "write:users"
    description:   text('description'),
    createdAt:     timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => ({
    appIdx:        index('scopes_application_id_idx').on(t.applicationId),
    appNameIdx:    uniqueIndex('scopes_app_name_idx').on(t.applicationId, t.name),
  }),
)

// ─── SAML Config ──────────────────────────────────────────────────────────────

export const samlConfigs = pgTable(
  'saml_configs',
  {
    id:                 uuid('id').primaryKey().defaultRandom(),
    applicationId:      uuid('application_id')
                          .notNull()
                          .references(() => applications.id, { onDelete: 'cascade' }),
    entityId:           text('entity_id').notNull(),
    acsUrl:             text('acs_url').notNull(),
    sloUrl:             text('slo_url'),
    spCertificate:      text('sp_certificate'),
    nameIdFormat:       text('name_id_format')
                          .notNull()
                          .default('urn:oasis:names:tc:SAML:1.1:nameid-format:emailAddress'),
    signAssertions:     boolean('sign_assertions').notNull().default(true),
    signResponse:       boolean('sign_response').notNull().default(true),
    encryptAssertions:  boolean('encrypt_assertions').notNull().default(false),
    attributeMappings:  jsonb('attribute_mappings').notNull().default({}),
    allowedClockSkewMs: integer('allowed_clock_skew_ms').notNull().default(30000),
    createdAt:          timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt:          timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => ({
    appIdx:    index('saml_configs_application_id_idx').on(t.applicationId),
    entityIdx: uniqueIndex('saml_configs_entity_id_idx').on(t.entityId),
  }),
)

// ─── OIDC Clients ─────────────────────────────────────────────────────────────

export const oidcClients = pgTable(
  'oidc_clients',
  {
    id:                   uuid('id').primaryKey().defaultRandom(),
    applicationId:        uuid('application_id')
                            .notNull()
                            .references(() => applications.id, { onDelete: 'cascade' }),
    clientId:             text('client_id').notNull().unique(),
    clientSecretHash:     text('client_secret_hash'),
    redirectUris:             text('redirect_uris').array().notNull().default(sql`'{}'::text[]`),
    postLogoutRedirectUris:   text('post_logout_redirect_uris').array().notNull().default(sql`'{}'::text[]`),
    grantTypes:               text('grant_types').array().notNull().default(sql`ARRAY['authorization_code']::text[]`),
    responseTypes:            text('response_types').array().notNull().default(sql`ARRAY['code']::text[]`),
    scopes:               text('scopes').notNull().default('openid profile email'),
    requirePkce:          boolean('require_pkce').notNull().default(true),
    tokenEndpointAuthMethod: text('token_endpoint_auth_method').notNull().default('client_secret_basic'),
    accessTokenTtl:       integer('access_token_ttl').notNull().default(3600),
    refreshTokenTtl:      integer('refresh_token_ttl').notNull().default(86400),
    idTokenTtl:           integer('id_token_ttl').notNull().default(3600),
    createdAt:            timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt:            timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => ({
    appIdx:      index('oidc_clients_application_id_idx').on(t.applicationId),
    clientIdIdx: uniqueIndex('oidc_clients_client_id_idx').on(t.clientId),
  }),
)

// ─── JWT Configs ──────────────────────────────────────────────────────────────

export const jwtConfigs = pgTable(
  'jwt_configs',
  {
    id:                  uuid('id').primaryKey().defaultRandom(),
    applicationId:       uuid('application_id')
                           .notNull()
                           .references(() => applications.id, { onDelete: 'cascade' }),
    clientId:            text('client_id').notNull().unique(),
    allowedAlgorithms:   text('allowed_algorithms').array().notNull().default(sql`ARRAY['RS256']::text[]`),
    allowedAudiences:    text('allowed_audiences').array().notNull().default(sql`'{}'::text[]`),
    certificateThumbprint: text('certificate_thumbprint'),
    tokenTtl:            integer('token_ttl').notNull().default(3600),
    requireMtls:         boolean('require_mtls').notNull().default(false),
    createdAt:           timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt:           timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => ({
    appIdx:      index('jwt_configs_application_id_idx').on(t.applicationId),
    clientIdIdx: uniqueIndex('jwt_configs_client_id_idx').on(t.clientId),
  }),
)