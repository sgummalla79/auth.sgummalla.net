import type { Result } from '../../../../shared/result/Result.js'
import type { CacheError, NotFoundError } from '../../../../shared/errors/AppError.js'

export interface SessionData {
  userId: string; email: string; createdAt: number; expiresAt: number
}

export interface ISessionStore {
  create(userId: string, email: string, ttlSeconds: number): Promise<Result<string, CacheError>>
  get(token: string): Promise<Result<SessionData, NotFoundError | CacheError>>
  delete(token: string): Promise<Result<void, CacheError>>
}