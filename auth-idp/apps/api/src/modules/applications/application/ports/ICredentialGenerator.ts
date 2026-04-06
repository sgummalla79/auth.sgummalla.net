export interface ICredentialGenerator {
  generateClientId(): string
  generateClientSecret(): string
}