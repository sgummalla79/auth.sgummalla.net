/**
 * Organization — top-level tenant entity.
 * All other entities (applications, users, keys, sessions) hang off this.
 */
export class Organization {
  constructor(
    public readonly id: string,
    public readonly name: string,
    public readonly slug: string,
    public readonly status: 'active' | 'suspended',
    public readonly logoUrl: string | null,
    public readonly createdAt: Date,
    public readonly updatedAt: Date,
  ) {}

  isSuspended(): boolean {
    return this.status === 'suspended'
  }

  isActive(): boolean {
    return this.status === 'active'
  }
}