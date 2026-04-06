import type { Result } from '../../../../shared/result/Result.js'
import type { CacheError } from '../../../../shared/errors/AppError.js'

export interface IKeyCache {
  get(): Promise<Result<CachedKeyRow | null, CacheError>>
  set(key: CachedKeyRow): Promise<Result<void, CacheError>>
  invalidate(): Promise<Result<void, CacheError>>
}

export interface CachedKeyRow {
  kid: string
  algorithm: string
  publicKeyPem: string
  encryptedPrivateKey: string
  encryptionIv: string
}