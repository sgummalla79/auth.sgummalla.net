/**
 * TotpSecret — value object wrapping a TOTP secret.
 * The raw secret is never logged — only the encrypted form is persisted.
 */
export class TotpSecret {
  constructor(
    public readonly secret: string,          // base32 secret (in-memory only)
    public readonly otpauthUri: string,      // otpauth://totp/... URI for QR code
  ) {}
}