import { ok, err } from '../../../shared/result/Result.js'
import type { Result } from '../../../shared/result/Result.js'
import { InternalError } from '../../../shared/errors/AppError.js'
import type { Redis } from 'ioredis'
import type { IKeyCache, CachedKey } from '../application/ports/IKeyCache.js'

const TTL_SECONDS = 300 // 5 minutes

export class RedisKeyCache implements IKeyCache {
  constructor(private readonly redis: Redis) {}

  private cacheKey(organizationId: string): string {
    return `active-signing-key:${organizationId}`
  }

  async get(organizationId: string): Promise<Result<CachedKey | null, InternalError>> {
    try {
      const raw = await this.redis.get(this.cacheKey(organizationId))
      if (!raw) return ok(null)
      return ok(JSON.parse(raw) as CachedKey)
    } catch (e) {
      return err(new InternalError('Cache read failed', e))
    }
  }

  async set(organizationId: string, key: CachedKey): Promise<void> {
    try {
      await this.redis.set(
        this.cacheKey(organizationId),
        JSON.stringify(key),
        'EX',
        TTL_SECONDS,
      )
    } catch {
      // Cache write failure is non-fatal — DB is the source of truth
    }
  }

  async invalidate(organizationId: string): Promise<void> {
    try {
      await this.redis.del(this.cacheKey(organizationId))
    } catch {
      // Cache invalidation failure is non-fatal
    }
  }
}