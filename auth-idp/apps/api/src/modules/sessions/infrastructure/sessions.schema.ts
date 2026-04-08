import {
  pgTable,
  pgEnum,
  uuid,
  text,
  timestamp,
  index,
} from 'drizzle-orm/pg-core'
import { organizations } from '../../organizations/infrastructure/organizations.schema.js'
import { users } from '../../users/infrastructure/users.schema.js'
import { sql } from 'drizzle-orm'

// ─── Enums ────────────────────────────────────────────────────────────────────

export const sessionStatusEnum = pgEnum('session_status', [
  'active',
  'expired',
  'revoked',
])

// ─── SSO Sessions ─────────────────────────────────────────────────────────────
// organization_id stored directly for fast tenant-filtered queries (no join needed)

export const ssoSessions = pgTable(
  'sso_sessions',
  {
    id:                  uuid('id').primaryKey().defaultRandom(),
    organizationId:      uuid('organization_id')
                           .notNull()
                           .references(() => organizations.id, { onDelete: 'cascade' }),
    userId:              uuid('user_id')
                           .notNull()
                           .references(() => users.id, { onDelete: 'cascade' }),
    status:              sessionStatusEnum('status').notNull().default('active'),
    ipAddress:           text('ip_address'),
    userAgent:           text('user_agent'),
    amr:                 text('amr').array().notNull().default(sql`'{}'::text[]`),
    participatingAppIds: text('participating_app_ids').array().notNull().default(sql`'{}'::text[]`),
    expiresAt:           timestamp('expires_at', { withTimezone: true }).notNull(),
    revokedAt:           timestamp('revoked_at', { withTimezone: true }),
    createdAt:           timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt:           timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => ({
    orgIdx:    index('sso_sessions_organization_id_idx').on(t.organizationId),
    userIdx:   index('sso_sessions_user_id_idx').on(t.userId),
    statusIdx: index('sso_sessions_status_idx').on(t.status),
    expiryIdx: index('sso_sessions_expires_at_idx').on(t.expiresAt),
  }),
)