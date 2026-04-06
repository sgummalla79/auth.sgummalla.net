export class UserProfile {
  constructor(
    public readonly userId: string,
    public readonly givenName: string | null,
    public readonly familyName: string | null,
    public readonly displayName: string | null,
    public readonly pictureUrl: string | null,
    public readonly locale: string,
    public readonly zoneinfo: string,
    public readonly customAttributes: Record<string, unknown>,
    public readonly updatedAt: Date,
  ) {}

  fullName(): string | null {
    if (this.givenName && this.familyName) return `${this.givenName} ${this.familyName}`
    return this.displayName ?? null
  }
}