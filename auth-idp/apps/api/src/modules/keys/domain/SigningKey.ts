import type { KeyAlgorithm, KeyStatus } from '../../../shared/types/domain-types.js'

export class SigningKey {
  constructor(
    public readonly id: string,
    public readonly organizationId: string,
    public readonly kid: string,
    public readonly algorithm: KeyAlgorithm,
    public readonly status: KeyStatus,
    public readonly publicKeyPem: string,
    public readonly publicKeyJwk: string,
    public readonly encryptedPrivateKey: string,
    public readonly encryptionIv: string,
    public readonly expiresAt: Date | null,
    public readonly createdAt: Date,
    public readonly rotatedAt: Date | null,
  ) {}

  canSign(): boolean {
    return this.status === 'active' && !this.isExpired()
  }

  canVerify(): boolean {
    return this.status !== 'revoked'
  }

  isExpired(): boolean {
    if (!this.expiresAt) return false
    return this.expiresAt < new Date()
  }
}