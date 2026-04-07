export class AccessToken {
  constructor(
    public readonly token: string,
    public readonly clientId: string,
    public readonly audience: string[],
    public readonly expiresAt: Date,
    public readonly issuedAt: Date,
  ) {}
}