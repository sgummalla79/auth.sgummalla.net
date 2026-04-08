import type { Result } from '../../../../shared/result/Result.js'
import type { DatabaseError, NotFoundError } from '../../../../shared/errors/AppError.js'
import type { SigningKey } from '../../domain/SigningKey.js'
import type { KeyStatus } from '../../../../shared/types/domain-types.js'

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

export interface ISigningKeyRepository {
  save(key: CreateSigningKeyInput): Promise<Result<SigningKey, DatabaseError>>
  findActiveKey(organizationId: string): Promise<Result<SigningKey, NotFoundError | DatabaseError>>
  findByKid(organizationId: string, kid: string): Promise<Result<SigningKey, NotFoundError | DatabaseError>>
  findPublicKeys(organizationId: string): Promise<Result<SigningKey[], DatabaseError>>
  listKeys(organizationId: string): Promise<Result<SigningKey[], DatabaseError>>
  updateStatus(organizationId: string, kid: string, status: KeyStatus): Promise<Result<void, DatabaseError>>
}