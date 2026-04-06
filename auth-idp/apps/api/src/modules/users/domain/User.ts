import type { UserStatus } from '../../../database/index.js'

export class User {
  constructor(
    public readonly id: string,
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

  isPendingVerification(): boolean { return this.status === 'pending_verification' }

  canLogin(): boolean {
    return (this.status === 'active' || this.status === 'pending_verification')
      && !this.isLocked()
  }
}