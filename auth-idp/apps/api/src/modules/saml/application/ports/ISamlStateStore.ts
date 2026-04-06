import type { Result } from '../../../../shared/result/Result.js'
import type { CacheError, NotFoundError } from '../../../../shared/errors/AppError.js'

/** Stores a pending SAML AuthnRequest while the user logs in. */
export interface PendingSamlRequest {
  samlRequest: string
  relayState?: string
  appId: string
  createdAt: number
}

export interface ISamlStateStore {
  /** Persist pending request. Returns the nonce key. */
  save(state: PendingSamlRequest): Promise<Result<string, CacheError>>
  /** Retrieve and delete pending request (single-use). */
  consume(nonce: string): Promise<Result<PendingSamlRequest, NotFoundError | CacheError>>
}