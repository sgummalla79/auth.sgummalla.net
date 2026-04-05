import {
  pgTable,
  pgEnum,
  uuid,
  text,
  timestamp,
  index,
  uniqueIndex,
} from 'drizzle-orm/pg-core'

// ─── Enums ────────────────────────────────────────────────────────────────────

export const keyUseEnum = pgEnum('key_use', ['sig', 'enc'])

export const keyAlgorithmEnum = pgEnum('key_algorithm', [
  'RS256', 'RS384', 'RS512',
  'ES256', 'ES384', 'ES512',
])

export const keyStatusEnum = pgEnum('key_status', [
  'active',    // Current primary — used for signing
  'rotating',  // Published in JWKS but not yet signing
  'retired',   // Kept only to verify existing tokens
  'revoked',   // Compromised — never used again
])

// ─── Signing Keys ─────────────────────────────────────────────────────────────

export const signingKeys = pgTable(
  'signing_keys',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    kid: text('kid').notNull(),
    algorithm: keyAlgorithmEnum('algorithm').notNull(),
    use: keyUseEnum('use').notNull().default('sig'),
    status: keyStatusEnum('status').notNull().default('active'),
    publicKey: text('public_key').notNull(),
    encryptedPrivateKey: text('encrypted_private_key').notNull(),
    encryptionIv: text('encryption_iv').notNull(),
    expiresAt: timestamp('expires_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    rotatedAt: timestamp('rotated_at', { withTimezone: true }),
    revokedAt: timestamp('revoked_at', { withTimezone: true }),
  },
  (t) => ({
    kidIdx: uniqueIndex('signing_keys_kid_idx').on(t.kid),
    statusIdx: index('signing_keys_status_idx').on(t.status),
    useStatusIdx: index('signing_keys_use_status_idx').on(t.use, t.status),
  }),
)

// ─── TypeScript types ─────────────────────────────────────────────────────────

export type SigningKey = typeof signingKeys.$inferSelect
export type NewSigningKey = typeof signingKeys.$inferInsert
export type KeyUse = (typeof keyUseEnum.enumValues)[number]
export type KeyAlgorithm = (typeof keyAlgorithmEnum.enumValues)[number]
export type KeyStatus = (typeof keyStatusEnum.enumValues)[number]