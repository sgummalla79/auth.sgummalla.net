import { ok, err } from '../../../shared/result/Result.js'
import type { Result } from '../../../shared/result/Result.js'
import { CacheError } from '../../../shared/errors/AppError.js'
import type { Logger } from '../../../shared/logger/logger.js'
import type { Redis } from 'ioredis'
import type { IKeyCache, CachedKeyRow } from '../application/ports/IKeyCache.js'

const CACHE_KEY = 'idp:keys:active:sig'
const CACHE_TTL = 300

interface Deps { redis: Redis; logger: Logger }

export class RedisKeyCache implements IKeyCache {
  private readonly redis: Redis
  private readonly logger: Logger

  constructor({ redis, logger }: Deps) {
    this.redis = redis
    this.logger = logger.child({ cache: 'KeyCache' })
  }

  async get(): Promise<Result<CachedKeyRow | null, CacheError>> {
    try {
      const raw = await this.redis.get(CACHE_KEY)
      if (!raw) return ok(null)
      try {
        return ok(JSON.parse(raw) as CachedKeyRow)
      } catch {
        await this.invalidate()
        return ok(null)
      }
    } catch (e) {
      this.logger.warn({ err: e }, 'Key cache read failed — falling back to DB')
      return err(new CacheError('Cache read failed', e))
    }
  }

  async set(key: CachedKeyRow): Promise<Result<void, CacheError>> {
    try {
      await this.redis.setex(CACHE_KEY, CACHE_TTL, JSON.stringify(key))
      return ok(undefined)
    } catch (e) {
      this.logger.warn({ err: e }, 'Key cache write failed')
      return ok(undefined) // Non-fatal — don't block the caller
    }
  }

  async invalidate(): Promise<Result<void, CacheError>> {
    try {
      await this.redis.del(CACHE_KEY)
      this.logger.debug('Key cache invalidated')
      return ok(undefined)
    } catch (e) {
      this.logger.warn({ err: e }, 'Key cache invalidation failed')
      return ok(undefined) // Non-fatal
    }
  }
}