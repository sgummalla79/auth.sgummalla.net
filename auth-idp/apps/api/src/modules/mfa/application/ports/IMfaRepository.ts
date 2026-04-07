import type { Result } from '../../../../shared/result/Result.js'
import type { DatabaseError, NotFoundError } from '../../../../shared/errors/AppError.js'

export interface MfaUserData {
  mfaEnabled: boolean
  totpPending: boolean
  totpSecret: string | null          // encrypted
  backupCodes: string[]              // hashed
}

export interface IMfaRepository {
  getMfaData(userId: string): Promise<Result<MfaUserData, NotFoundError | DatabaseError>>

  savePendingTotp(
    userId: string,
    encryptedSecret: string,
  ): Promise<Result<void, DatabaseError>>

  activateMfa(
    userId: string,
    hashedBackupCodes: string[],
  ): Promise<Result<void, DatabaseError>>

  disableMfa(userId: string): Promise<Result<void, DatabaseError>>

  saveBackupCodes(
    userId: string,
    hashedBackupCodes: string[],
  ): Promise<Result<void, DatabaseError>>

  consumeBackupCode(
    userId: string,
    remainingCodes: string[],
  ): Promise<Result<void, DatabaseError>>
}