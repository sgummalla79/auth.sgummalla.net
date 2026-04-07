import { eq } from 'drizzle-orm'
import { ok, err } from '../../../shared/result/Result.js'
import type { Result } from '../../../shared/result/Result.js'
import { DatabaseError, NotFoundError } from '../../../shared/errors/AppError.js'
import type { DrizzleClient } from '../../../infrastructure/database/postgres.client.js'
import { users } from '../../../database/index.js'
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
      const row = await this.db
        .select({
          mfaEnabled: users.mfaEnabled,
          totpPending: users.totpPending,
          totpSecret:  users.totpSecret,
          backupCodes: users.backupCodes,
        })
        .from(users)
        .where(eq(users.id, userId))
        .limit(1)
        .then(rows => rows[0])

      if (!row) return err(new NotFoundError(`User not found: ${userId}`))

      return ok({
        mfaEnabled:  row.mfaEnabled,
        totpPending: row.totpPending,
        totpSecret:  row.totpSecret,
        backupCodes: row.backupCodes,
      })
    } catch (e) {
      return err(new DatabaseError('Failed to get MFA data', e))
    }
  }

  async savePendingTotp(userId: string, encryptedSecret: string): Promise<Result<void, DatabaseError>> {
    try {
      await this.db
        .update(users)
        .set({ totpSecret: encryptedSecret, totpPending: true, mfaEnabled: false })
        .where(eq(users.id, userId))
      return ok(undefined)
    } catch (e) {
      return err(new DatabaseError('Failed to save pending TOTP', e))
    }
  }

  async activateMfa(userId: string, hashedBackupCodes: string[]): Promise<Result<void, DatabaseError>> {
    try {
      await this.db
        .update(users)
        .set({ mfaEnabled: true, totpPending: false, backupCodes: hashedBackupCodes })
        .where(eq(users.id, userId))
      return ok(undefined)
    } catch (e) {
      return err(new DatabaseError('Failed to activate MFA', e))
    }
  }

  async disableMfa(userId: string): Promise<Result<void, DatabaseError>> {
    try {
      await this.db
        .update(users)
        .set({ mfaEnabled: false, totpPending: false, totpSecret: null, backupCodes: [] })
        .where(eq(users.id, userId))
      return ok(undefined)
    } catch (e) {
      return err(new DatabaseError('Failed to disable MFA', e))
    }
  }

  async saveBackupCodes(userId: string, hashedBackupCodes: string[]): Promise<Result<void, DatabaseError>> {
    try {
      await this.db
        .update(users)
        .set({ backupCodes: hashedBackupCodes })
        .where(eq(users.id, userId))
      return ok(undefined)
    } catch (e) {
      return err(new DatabaseError('Failed to save backup codes', e))
    }
  }

  async consumeBackupCode(userId: string, remainingCodes: string[]): Promise<Result<void, DatabaseError>> {
    try {
      await this.db
        .update(users)
        .set({ backupCodes: remainingCodes })
        .where(eq(users.id, userId))
      return ok(undefined)
    } catch (e) {
      return err(new DatabaseError('Failed to consume backup code', e))
    }
  }
}