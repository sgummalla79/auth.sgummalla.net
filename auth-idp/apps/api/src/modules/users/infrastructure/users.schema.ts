import {
  pgTable,
  pgEnum,
  uuid,
  text,
  boolean,
  integer,
  timestamp,
  index,
  uniqueIndex,
} from 'drizzle-orm/pg-core'
import { organizations } from '../../organizations/infrastructure/organizations.schema'
import { sql } from 'drizzle-orm'

// ─── Enums ────────────────────────────────────────────────────────────────────

export const userStatusEnum = pgEnum('user_status', [
  'active',
  'inactive',
  'suspended',
])

export const mfaFactorTypeEnum = pgEnum('mfa_factor_type', [
  'totp',
  'webauthn',
])

// ─── Users ────────────────────────────────────────────────────────────────────

export const users = pgTable(
  'users',
  {
    id:                   uuid('id').primaryKey().defaultRandom(),
    organizationId:       uuid('organization_id')
                            .notNull()
                            .references(() => organizations.id, { onDelete: 'cascade' }),
    email:                text('email').notNull(),
    passwordHash:         text('password_hash').notNull(),
    status:               userStatusEnum('status').notNull().default('active'),
    emailVerified:        boolean('email_verified').notNull().default(false),
    failedLoginAttempts:  text('failed_login_attempts').notNull().default('0'),
    lockedUntil:          timestamp('locked_until', { withTimezone: true }),
    createdAt:            timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt:            timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => ({
    orgIdx:      index('users_organization_id_idx').on(t.organizationId),
    emailIdx:    uniqueIndex('users_org_email_idx').on(t.organizationId, t.email), // email unique per org
    statusIdx:   index('users_status_idx').on(t.status),
  }),
)

// ─── User Profiles ────────────────────────────────────────────────────────────

export const userProfiles = pgTable(
  'user_profiles',
  {
    id:          uuid('id').primaryKey().defaultRandom(),
    userId:      uuid('user_id')
                   .notNull()
                   .references(() => users.id, { onDelete: 'cascade' }),
    firstName:   text('first_name'),
    lastName:    text('last_name'),
    displayName: text('display_name'),
    pictureUrl:  text('picture_url'),
    locale:      text('locale').default('en'),
    zoneInfo:    text('zone_info'),
    phoneNumber: text('phone_number'),
    updatedAt:   timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
)

// ─── User MFA ─────────────────────────────────────────────────────────────────

export const userMfa = pgTable(
  'user_mfa',
  {
    id:           uuid('id').primaryKey().defaultRandom(),
    userId:       uuid('user_id')
                    .notNull()
                    .references(() => users.id, { onDelete: 'cascade' }),
    factorType:   mfaFactorTypeEnum('factor_type').notNull(),
    secret:       text('secret'),
    credentialId: text('credential_id'),
    publicKey:    text('public_key'),
    backupCodes: text('backup_codes').array().notNull().default(sql`'{}'::text[]`),
    verified:     boolean('verified').notNull().default(false),
    createdAt:    timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt:    timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => ({
    userIdx: index('user_mfa_user_id_idx').on(t.userId),
    typeIdx: index('user_mfa_factor_type_idx').on(t.factorType),
  }),
)