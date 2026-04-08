import type { Result } from '../../../../shared/result/Result.js'
import type { DatabaseError, NotFoundError } from '../../../../shared/errors/AppError.js'
import type { KeyStatus } from '../../../../database/index.js'
import type { SigningKey } from '../../domain/SigningKey.js'

export interface ISigningKeyRepository {
  save(key: CreateSigningKeyInput): Promise<Result<SigningKey, DatabaseError>>
  findActiveSigningKey(): Promise<Result<SigningKey, NotFoundError | DatabaseError>>
  findByKid(kid: string): Promise<Result<SigningKey, NotFoundError | DatabaseError>>
  findPublicKeys(): Promise<Result<SigningKey[], DatabaseError>>
  updateStatus(kid: string, status: KeyStatus): Promise<Result<void, DatabaseError>>
}

export interface CreateSigningKeyInput {
  kid: string
  organizationId: string
  algorithm: string
  status: string
  publicKeyPem: string
  publicKeyJwk: string
  encryptedPrivateKey: string
  encryptionIv: string
  expiresAt: Date | null
}