import { eq, and, or, isNull, gt, inArray } from 'drizzle-orm'
import { ok, err } from '../../../shared/result/Result.js'
import type { Result } from '../../../shared/result/Result.js'
import { DatabaseError, NotFoundError } from '../../../shared/errors/AppError.js'
import type { DrizzleClient } from '../../../infrastructure/database/postgres.client.js'
import { signingKeys } from './keys.schema.js'
import { SigningKey } from '../domain/SigningKey.js'
import type {
  ISigningKeyRepository,
  CreateSigningKeyInput
} from '../application/ports/ISigningKeyRepository.js'
import type { KeyStatus } from '../../../shared/types/domain-types.js'
import type { IKeyCache, CachedKey } from '../application/ports/IKeyCache.js'
import { isOk } from '../../../shared/result/Result.js'

type SigningKeyRow = typeof signingKeys.$inferSelect

interface Deps {
  db: DrizzleClient
  keyCache: IKeyCache
}

export class SupabaseSigningKeyRepository implements ISigningKeyRepository {
  private readonly db: DrizzleClient
  private readonly cache: IKeyCache

  constructor({ db, keyCache }: Deps) {
    this.db = db
    this.cache = keyCache
  }

  async save(input: CreateSigningKeyInput): Promise<Result<SigningKey, DatabaseError>> {
    try {
      const rows = await this.db
        .insert(signingKeys)
        .values({
          organizationId:      input.organizationId,
          keyId:               input.kid,
          algorithm:           input.algorithm as SigningKeyRow['algorithm'],
          status:              input.status as SigningKeyRow['status'],
          publicKey:           input.publicKeyPem,
          publicKeyJwk:        input.publicKeyJwk,
          encryptedPrivateKey: input.encryptedPrivateKey,
          encryptionIv:        input.encryptionIv,
          expiresAt:           input.expiresAt,
        })
        .returning()
      return ok(this.toDomain(rows[0]!))
    } catch (e) {
      return err(new DatabaseError('Failed to save signing key', e))
    }
  }

  async findActiveKey(organizationId: string): Promise<Result<SigningKey, NotFoundError | DatabaseError>> {
    // 1. Check cache first
    try {
      const cached = await this.cache.get(organizationId)
      if (isOk(cached) && cached.value) {
        const c = cached.value as CachedKey
        return ok(new SigningKey(
          '', organizationId, c.kid,
          c.algorithm as SigningKeyRow['algorithm'],
          'active', c.publicKeyPem, c.publicKeyJwk,
          c.encryptedPrivateKey, c.encryptionIv,
          null, new Date(), null,
        ))
      }
    } catch {
      // Cache failure is non-fatal — fall through to DB
    }

    // 2. Fetch from DB
    try {
      const rows = await this.db
        .select()
        .from(signingKeys)
        .where(and(
          eq(signingKeys.organizationId, organizationId),
          eq(signingKeys.status, 'active'),
          or(isNull(signingKeys.expiresAt), gt(signingKeys.expiresAt, new Date())),
        ))
        .limit(1)

      const row = rows[0]
      if (!row) return err(new NotFoundError(`No active signing key for org ${organizationId}`))

      // 3. Populate cache
      await this.cache.set(organizationId, {
        kid:                 row.keyId,
        organizationId,
        algorithm:           row.algorithm,
        publicKeyPem:        row.publicKey,
        publicKeyJwk:        row.publicKeyJwk,
        encryptedPrivateKey: row.encryptedPrivateKey,
        encryptionIv:        row.encryptionIv,
      })

      return ok(this.toDomain(row))
    } catch (e) {
      return err(new DatabaseError('Failed to query active signing key', e))
    }
  }

  async findByKid(organizationId: string, kid: string): Promise<Result<SigningKey, NotFoundError | DatabaseError>> {
    try {
      const rows = await this.db
        .select()
        .from(signingKeys)
        .where(and(
          eq(signingKeys.organizationId, organizationId),
          eq(signingKeys.keyId, kid),
        ))
        .limit(1)

      const row = rows[0]
      if (!row) return err(new NotFoundError(`Signing key ${kid} not found`))
      return ok(this.toDomain(row))
    } catch (e) {
      return err(new DatabaseError(`Failed to query signing key: ${kid}`, e))
    }
  }

  async findPublicKeys(organizationId: string): Promise<Result<SigningKey[], DatabaseError>> {
    try {
      const rows = await this.db
        .select()
        .from(signingKeys)
        .where(and(
          eq(signingKeys.organizationId, organizationId),
          inArray(signingKeys.status, ['active', 'rotating']),
        ))
      return ok(rows.map(r => this.toDomain(r)))
    } catch (e) {
      return err(new DatabaseError('Failed to query public keys', e))
    }
  }

  async listKeys(organizationId: string): Promise<Result<SigningKey[], DatabaseError>> {
    try {
      const rows = await this.db
        .select()
        .from(signingKeys)
        .where(eq(signingKeys.organizationId, organizationId))
      return ok(rows.map(r => this.toDomain(r)))
    } catch (e) {
      return err(new DatabaseError('Failed to list keys', e))
    }
  }

  async updateStatus(organizationId: string, kid: string, status: KeyStatus): Promise<Result<void, DatabaseError>> {
    try {
      await this.db
        .update(signingKeys)
        .set({
          status,
          ...(status === 'retired' ? { rotatedAt: new Date() } : {}),
        })
        .where(and(
          eq(signingKeys.organizationId, organizationId),
          eq(signingKeys.keyId, kid),
        ))
      await this.cache.invalidate(organizationId)
      return ok(undefined)
    } catch (e) {
      return err(new DatabaseError('Failed to update key status', e))
    }
  }

  private toDomain(row: SigningKeyRow): SigningKey {
    return new SigningKey(
      row.id,
      row.organizationId,
      row.keyId,
      row.algorithm,
      row.status,
      row.publicKey,
      row.publicKeyJwk,
      row.encryptedPrivateKey,
      row.encryptionIv,
      row.expiresAt,
      row.createdAt,
      row.rotatedAt ?? null,
    )
  }
}