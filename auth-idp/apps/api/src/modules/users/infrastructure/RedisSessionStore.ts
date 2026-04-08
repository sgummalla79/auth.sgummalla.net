import { randomBytes } from 'crypto'
import { ok, err } from '../../../shared/result/Result.js'
import type { Result } from '../../../shared/result/Result.js'
import { CacheError, NotFoundError } from '../../../shared/errors/AppError.js'
import type { Logger } from '../../../shared/logger/logger.js'
import type { Redis } from 'ioredis'
import type { ISessionStore, SessionData } from '../application/ports/ISessionStore.js'

const KEY_PREFIX = 'idp:session:'
interface Deps { redis: Redis; logger: Logger }

export class RedisSessionStore implements ISessionStore {
  private readonly redis: Redis
  private readonly logger: Logger
  constructor({ redis, logger }: Deps) { this.redis = redis; this.logger = logger.child({ store: 'SessionStore' }) }

  async create(userId: string, email: string, ttlSeconds: number): Promise<Result<string, CacheError>> {
    try {
      const token = randomBytes(32).toString('hex')
      const now = Date.now()
      const data: SessionData = { userId, email, createdAt: now, expiresAt: now + ttlSeconds * 1000 }
      await this.redis.setex(`${KEY_PREFIX}${token}`, ttlSeconds, JSON.stringify(data))
      return ok(token)
    } catch (e) {
      return err(new CacheError('Failed to create session', e))
    }
  }

  async get(token: string): Promise<Result<SessionData, NotFoundError | CacheError>> {
    try {
      const raw = await this.redis.get(`${KEY_PREFIX}${token}`)
      if (!raw) return err(new NotFoundError('Session not found or expired'))
      return ok(JSON.parse(raw) as SessionData)
    } catch (e) {
      return err(new CacheError('Failed to read session', e))
    }
  }

  async delete(token: string): Promise<Result<void, CacheError>> {
    try {
      await this.redis.del(`${KEY_PREFIX}${token}`)
      return ok(undefined)
    } catch (e) {
      return err(new CacheError('Failed to delete session', e))
    }
  }
}