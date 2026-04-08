import {
  pgTable,
  pgEnum,
  uuid,
  text,
  timestamp,
  index,
  uniqueIndex,
} from 'drizzle-orm/pg-core'
import { organizations } from '../../organizations/infrastructure/organizations.schema'

// ─── Enums ────────────────────────────────────────────────────────────────────

export const signingKeyAlgorithmEnum = pgEnum('signing_key_algorithm', [
  'RS256',
  'RS384',
  'RS512',
  'ES256',
  'ES384',
  'ES512',
])

export const signingKeyStatusEnum = pgEnum('signing_key_status', [
  'active',
  'rotating',
  'retired',
  'revoked',
])

// ─── Signing Keys ─────────────────────────────────────────────────────────────
// Each org owns its own RSA/EC keypair — isolated rotation lifecycle

export const signingKeys = pgTable(
  'signing_keys',
  {
    id:                 uuid('id').primaryKey().defaultRandom(),
    organizationId:     uuid('organization_id')
                          .notNull()
                          .references(() => organizations.id, { onDelete: 'cascade' }),
    algorithm:          signingKeyAlgorithmEnum('algorithm').notNull().default('RS256'),
    status:             signingKeyStatusEnum('status').notNull().default('active'),
    encryptedPrivateKey: text('encrypted_private_key').notNull(),
    encryptionIv:       text('encryption_iv').notNull(),
    publicKey:          text('public_key').notNull(),
    publicKeyJwk:       text('public_key_jwk').notNull(),
    keyId:              text('key_id').notNull(),              // kid in JWKS
    certificate:        text('certificate'),                   // X.509 cert for SAML
    expiresAt:          timestamp('expires_at', { withTimezone: true }),
    rotatedAt:          timestamp('rotated_at', { withTimezone: true }),
    createdAt:          timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt:          timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => ({
    orgIdx:      index('signing_keys_organization_id_idx').on(t.organizationId),
    statusIdx:   index('signing_keys_status_idx').on(t.status),
    keyIdIdx:    uniqueIndex('signing_keys_key_id_idx').on(t.organizationId, t.keyId),
  }),
)