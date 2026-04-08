import { eq, sql } from 'drizzle-orm'
import { ok, err } from '../../../shared/result/Result.js'
import type { Result } from '../../../shared/result/Result.js'
import { DatabaseError, NotFoundError } from '../../../shared/errors/AppError.js'
import type { DrizzleClient } from '../../../infrastructure/database/postgres.client.js'
import { userMfa } from '../../../database/index.js'
import type { IMfaRepository, MfaUserData } from '../application/ports/IMfaRepository.js'

interface Deps {
  db: DrizzleClient
}

export class SupabaseMfaRepository implements IMfaRepository {
  private readonly db: DrizzleClient

  constructor({ db }: Deps) {
    this.db = db
  }

  async getMfaData(userId: string): Promise<Result<MfaUserData, NotFoundError | DatabaseError>> {
    try {
      const rows = await this.db
        .select()
        .from(userMfa)
        .where(eq(userMfa.userId, userId))

      if (rows.length === 0) {
        // No MFA factors — return empty/disabled state
        return ok({
          mfaEnabled:  false,
          totpPending: false,
          totpSecret:  null,
          backupCodes: [],
        })
      }

      const totpRow = rows.find(r => r.factorType === 'totp')

      return ok({
        mfaEnabled:  rows.some(r => r.verified),
        totpPending: !!totpRow && !totpRow.verified,
        totpSecret:  totpRow?.secret ?? null,
        backupCodes: totpRow?.backupCodes ?? [],
      })
    } catch (e) {
      return err(new DatabaseError('Failed to get MFA data', e))
    }
  }

  async savePendingTotp(userId: string, encryptedSecret: string): Promise<Result<void, DatabaseError>> {
    try {
      // Upsert — insert or update existing TOTP row
      const existing = await this.db
        .select()
        .from(userMfa)
        .where(eq(userMfa.userId, userId))
        .limit(1)

      const totpRow = existing.find(r => r.factorType === 'totp')

      if (totpRow) {
        await this.db
          .update(userMfa)
          .set({ secret: encryptedSecret, verified: false })
          .where(eq(userMfa.id, totpRow.id))
      } else {
        await this.db
          .insert(userMfa)
          .values({
            userId,
            factorType: 'totp',
            secret:     encryptedSecret,
            verified:   false,
            backupCodes: sql`'{}'::text[]`,
          })
      }

      return ok(undefined)
    } catch (e) {
      return err(new DatabaseError('Failed to save pending TOTP', e))
    }
  }

  async activateMfa(userId: string, hashedBackupCodes: string[]): Promise<Result<void, DatabaseError>> {
    try {
      await this.db
        .update(userMfa)
        .set({
          verified:    true,
          backupCodes: sql`${JSON.stringify(hashedBackupCodes)}::text[]`,
        })
        .where(eq(userMfa.userId, userId))

      return ok(undefined)
    } catch (e) {
      return err(new DatabaseError('Failed to activate MFA', e))
    }
  }

  async disableMfa(userId: string): Promise<Result<void, DatabaseError>> {
    try {
      // Delete all MFA factors for this user
      await this.db
        .delete(userMfa)
        .where(eq(userMfa.userId, userId))

      return ok(undefined)
    } catch (e) {
      return err(new DatabaseError('Failed to disable MFA', e))
    }
  }

  async saveBackupCodes(userId: string, hashedBackupCodes: string[]): Promise<Result<void, DatabaseError>> {
    try {
      await this.db
        .update(userMfa)
        .set({ backupCodes: sql`${JSON.stringify(hashedBackupCodes)}::text[]` })
        .where(eq(userMfa.userId, userId))

      return ok(undefined)
    } catch (e) {
      return err(new DatabaseError('Failed to save backup codes', e))
    }
  }

  async consumeBackupCode(userId: string, remainingCodes: string[]): Promise<Result<void, DatabaseError>> {
    try {
      await this.db
        .update(userMfa)
        .set({ backupCodes: sql`${JSON.stringify(remainingCodes)}::text[]` })
        .where(eq(userMfa.userId, userId))

      return ok(undefined)
    } catch (e) {
      return err(new DatabaseError('Failed to consume backup code', e))
    }
  }
}