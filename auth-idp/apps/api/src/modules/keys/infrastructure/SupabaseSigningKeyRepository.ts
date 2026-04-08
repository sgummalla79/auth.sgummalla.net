import { eq, and, or, isNull, gt, inArray } from 'drizzle-orm'
import { ok, err } from '../../../shared/result/Result.js'
import type { Result } from '../../../shared/result/Result.js'
import { DatabaseError, NotFoundError } from '../../../shared/errors/AppError.js'
import type { DrizzleClient } from '../../../infrastructure/database/postgres.client.js'
import type { KeyStatus, KeyAlgorithm } from '../../../shared/types/domain-types.js'
import { signingKeys } from './keys.schema.js'
import { SigningKey } from '../domain/SigningKey.js'
import type { ISigningKeyRepository, CreateSigningKeyInput } from '../application/ports/ISigningKeyRepository.js'
import type { IKeyCache } from '../application/ports/IKeyCache.js'
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
          organizationId:      input.organizationId ?? '',   // ← ADD
          keyId:               input.kid,
          algorithm:           input.algorithm as SigningKeyRow['algorithm'],
          status:              input.status as SigningKeyRow['status'],
          publicKey:           input.publicKeyPem,
          publicKeyJwk:        input.publicKeyJwk ?? '',     // ← ADD
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

  async findActiveSigningKey(): Promise<Result<SigningKey, NotFoundError | DatabaseError>> {
    // 1. Check cache first
    try {
      const cached = await this.cache.get()
      if (isOk(cached) && cached.value) {
        const c = cached.value
        return ok(new SigningKey(
          '',                           // id
          '',                           // organizationId ← placeholder until M15
          c.kid,                        // kid
          c.algorithm as KeyAlgorithm,  // algorithm
          'active',                     // status
          c.publicKeyPem,               // publicKeyPem
          '',                           // publicKeyJwk ← placeholder until M15
          c.encryptedPrivateKey,        // encryptedPrivateKey
          c.encryptionIv,               // encryptionIv
          null,                         // expiresAt
          new Date(),                   // createdAt
          null,                         // rotatedAt
        ))
      }
    } catch {
      // Cache failure is non-fatal — fall through to DB
    }

    // 2. Fetch from DB
    try {
      const row = await this.db.query.signingKeys.findFirst({
        where: and(
          eq(signingKeys.status, 'active'),
          or(isNull(signingKeys.expiresAt), gt(signingKeys.expiresAt, new Date())),
        ),
      })

      if (!row) return err(new NotFoundError('No active signing key found'))

      // 3. Populate cache (non-fatal if it fails)
      await this.cache.set({
        kid: row.keyId,
        algorithm: row.algorithm,
        publicKeyPem: row.publicKey,
        encryptedPrivateKey: row.encryptedPrivateKey,
        encryptionIv: row.encryptionIv,
      })

      return ok(this.toDomain(row))
    } catch (e) {
      return err(new DatabaseError('Failed to query active signing key', e))
    }
  }

  async findByKid(kid: string): Promise<Result<SigningKey, NotFoundError | DatabaseError>> {
    try {
      const row = await this.db.query.signingKeys.findFirst({
        where: eq(signingKeys.keyId, kid),
      })
      if (!row) return err(new NotFoundError(`Signing key not found: ${kid}`))
      return ok(this.toDomain(row))
    } catch (e) {
      return err(new DatabaseError(`Failed to query signing key: ${kid}`, e))
    }
  }

  async findPublicKeys(): Promise<Result<SigningKey[], DatabaseError>> {
    try {
      const rows = await this.db.query.signingKeys.findMany({
        where: inArray(signingKeys.status, ['active', 'rotating']),
      })
      return ok(rows.map(this.toDomain.bind(this)))
    } catch (e) {
      return err(new DatabaseError('Failed to query public keys', e))
    }
  }

  async updateStatus(kid: string, status: KeyStatus): Promise<Result<void, DatabaseError>> {
    try {
      await this.db
        .update(signingKeys)
        .set({
          status,
          ...(status === 'retired' ? { rotatedAt: new Date() } : {}),
          ...(status === 'revoked' ? { revokedAt: new Date() } : {}),
        })
        .where(eq(signingKeys.keyId, kid))
      return ok(undefined)
    } catch (e) {
      return err(new DatabaseError(`Failed to update key status: ${kid}`, e))
    }
  }

  private toDomain = (row: SigningKeyRow): SigningKey => {
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