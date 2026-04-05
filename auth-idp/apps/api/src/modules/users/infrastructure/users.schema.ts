import {
  pgTable,
  pgEnum,
  uuid,
  text,
  boolean,
  timestamp,
  jsonb,
  index,
  uniqueIndex,
} from 'drizzle-orm/pg-core'
import { relations } from 'drizzle-orm'

// ─── Enums ────────────────────────────────────────────────────────────────────

export const userStatusEnum = pgEnum('user_status', [
  'active',
  'inactive',
  'suspended',
  'pending_verification',
])

export const mfaTypeEnum = pgEnum('mfa_type', ['totp', 'webauthn', 'sms', 'email'])

// ─── Users ────────────────────────────────────────────────────────────────────

export const users = pgTable(
  'users',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    email: text('email').notNull(),
    emailVerified: boolean('email_verified').notNull().default(false),
    passwordHash: text('password_hash'),
    status: userStatusEnum('status').notNull().default('pending_verification'),
    failedLoginAttempts: text('failed_login_attempts').notNull().default('0'),
    lockedUntil: timestamp('locked_until', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
    lastLoginAt: timestamp('last_login_at', { withTimezone: true }),
  },
  (t) => ({
    emailIdx: uniqueIndex('users_email_idx').on(t.email),
    statusIdx: index('users_status_idx').on(t.status),
  }),
)

// ─── User Profiles ────────────────────────────────────────────────────────────

export const userProfiles = pgTable('user_profiles', {
  userId: uuid('user_id')
    .primaryKey()
    .references(() => users.id, { onDelete: 'cascade' }),
  givenName: text('given_name'),
  familyName: text('family_name'),
  displayName: text('display_name'),
  pictureUrl: text('picture_url'),
  locale: text('locale').notNull().default('en'),
  zoneinfo: text('zoneinfo').notNull().default('UTC'),
  customAttributes: jsonb('custom_attributes')
    .$type<Record<string, unknown>>()
    .notNull()
    .default({}),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
})

// ─── User MFA ─────────────────────────────────────────────────────────────────

export const userMfa = pgTable(
  'user_mfa',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    type: mfaTypeEnum('type').notNull(),
    encryptedSecret: text('encrypted_secret'),
    credentialId: text('credential_id'),
    publicKey: text('public_key'),
    backupCodeHashes: text('backup_code_hashes').array().notNull().default([]),
    verified: boolean('verified').notNull().default(false),
    name: text('name'),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    lastUsedAt: timestamp('last_used_at', { withTimezone: true }),
  },
  (t) => ({
    userIdx: index('user_mfa_user_id_idx').on(t.userId),
    credentialIdx: uniqueIndex('user_mfa_credential_id_idx').on(t.credentialId),
  }),
)

// ─── Relations ────────────────────────────────────────────────────────────────

export const usersRelations = relations(users, ({ one, many }) => ({
  profile: one(userProfiles, {
    fields: [users.id],
    references: [userProfiles.userId],
  }),
  mfaFactors: many(userMfa),
}))

export const userProfilesRelations = relations(userProfiles, ({ one }) => ({
  user: one(users, {
    fields: [userProfiles.userId],
    references: [users.id],
  }),
}))

export const userMfaRelations = relations(userMfa, ({ one }) => ({
  user: one(users, {
    fields: [userMfa.userId],
    references: [users.id],
  }),
}))

// ─── TypeScript types ─────────────────────────────────────────────────────────

export type User = typeof users.$inferSelect
export type NewUser = typeof users.$inferInsert
export type UserProfile = typeof userProfiles.$inferSelect
export type NewUserProfile = typeof userProfiles.$inferInsert
export type UserMfa = typeof userMfa.$inferSelect
export type NewUserMfa = typeof userMfa.$inferInsert
export type UserStatus = (typeof userStatusEnum.enumValues)[number]
export type MfaType = (typeof mfaTypeEnum.enumValues)[number]