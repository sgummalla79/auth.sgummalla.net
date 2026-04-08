export interface CachedKey {
  kid: string
  organizationId: string
  algorithm: string
  publicKeyPem: string
  publicKeyJwk: string
  encryptedPrivateKey: string
  encryptionIv: string
}

export interface IKeyCache {
  get(organizationId: string): Promise<any>
  set(organizationId: string, key: CachedKey): Promise<void>
  invalidate(organizationId: string): Promise<void>
}