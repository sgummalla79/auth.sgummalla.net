import type { UserStatus } from '../../../shared/types/domain-types.js'

export class User {
  constructor(
    public readonly id: string,
    public readonly organizationId: string,   // ← ADD as second parameter
    public readonly email: string,
    public readonly emailVerified: boolean,
    public readonly passwordHash: string | null,
    public readonly status: UserStatus,
    public readonly failedLoginAttempts: number,
    public readonly lockedUntil: Date | null,
    public readonly createdAt: Date,
    public readonly updatedAt: Date,
    public readonly lastLoginAt: Date | null,
  ) {}

  isActive(): boolean { return this.status === 'active' }

  isLocked(): boolean {
    if (!this.lockedUntil) return false
    return new Date() < this.lockedUntil
  }

  isPendingVerification(): boolean {
    return false  // removed in new schema — always false until M16 adds email verification flow
  }

  canLogin(): boolean {
    return this.status === 'active' && !this.isLocked()
  }
}