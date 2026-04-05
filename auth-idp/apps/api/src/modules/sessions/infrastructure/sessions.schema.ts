import {
  pgTable, pgEnum, uuid, text, timestamp, index, uniqueIndex,
} from 'drizzle-orm/pg-core'
import { relations } from 'drizzle-orm'
import { users } from '../../users/infrastructure/users.schema'

// ─── Enums ────────────────────────────────────────────────────────────────────

export const sessionStatusEnum = pgEnum('session_status', [
  'active',
  'expired',
  'logged_out',
  'revoked',
])

// ─── SSO Sessions ─────────────────────────────────────────────────────────────

export const ssoSessions = pgTable(
  'sso_sessions',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    sessionToken: text('session_token').notNull(),
    status: sessionStatusEnum('status').notNull().default('active'),
    participatingAppIds: text('participating_app_ids').array().notNull().default([]),
    ipAddress: text('ip_address'),
    amr: text('amr').array().notNull().default([]),
    userAgent: text('user_agent'),
    authenticatedAt: timestamp('authenticated_at', { withTimezone: true }).defaultNow().notNull(),
    lastActiveAt: timestamp('last_active_at', { withTimezone: true }).defaultNow().notNull(),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => ({
    tokenIdx: uniqueIndex('sso_sessions_token_idx').on(t.sessionToken),
    userIdx: index('sso_sessions_user_id_idx').on(t.userId),
    statusIdx: index('sso_sessions_status_idx').on(t.status),
    expiresIdx: index('sso_sessions_expires_at_idx').on(t.expiresAt),
  }),
)

// ─── Relations ────────────────────────────────────────────────────────────────

export const ssoSessionsRelations = relations(ssoSessions, ({ one }) => ({
  user: one(users, {
    fields: [ssoSessions.userId],
    references: [users.id],
  }),
}))

// ─── TypeScript types ─────────────────────────────────────────────────────────

export type SsoSession = typeof ssoSessions.$inferSelect
export type NewSsoSession = typeof ssoSessions.$inferInsert
export type SessionStatus = (typeof sessionStatusEnum.enumValues)[number]