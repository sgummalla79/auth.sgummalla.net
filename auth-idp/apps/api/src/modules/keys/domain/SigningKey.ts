import type { KeyAlgorithm, KeyStatus, KeyUse } from '../../../database/index.js'

export class SigningKey {
  constructor(
    public readonly id: string,
    public readonly kid: string,
    public readonly algorithm: KeyAlgorithm,
    public readonly use: KeyUse,
    public readonly status: KeyStatus,
    public readonly publicKeyPem: string,
    public readonly encryptedPrivateKey: string,
    public readonly encryptionIv: string,
    public readonly expiresAt: Date | null,
    public readonly createdAt: Date,
    public readonly rotatedAt: Date | null,
    public readonly revokedAt: Date | null,
  ) {}

  isActive(): boolean { return this.status === 'active' }

  isExpired(): boolean {
    if (!this.expiresAt) return false
    return new Date() > this.expiresAt
  }

  canSign(): boolean { return this.status === 'active' && !this.isExpired() }

  canVerify(): boolean { return this.status !== 'revoked' }
}