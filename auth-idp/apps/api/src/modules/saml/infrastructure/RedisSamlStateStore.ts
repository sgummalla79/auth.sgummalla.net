import { randomBytes } from 'crypto'
import type { Redis } from 'ioredis'
import { ok, err } from '../../../shared/result/Result.js'
import type { Result } from '../../../shared/result/Result.js'
import { CacheError, NotFoundError } from '../../../shared/errors/AppError.js'
import type { ISamlStateStore, PendingSamlRequest } from '../application/ports/ISamlStateStore.js'
import type { Logger } from '../../../shared/logger/logger.js'

const KEY_PREFIX = 'saml:pending:'
const TTL_SECONDS = 30 * 60 // 30 minutes — enough to complete a login flow

interface Deps {
  redis: Redis
  logger: Logger
}

export class RedisSamlStateStore implements ISamlStateStore {
  private readonly redis: Redis
  private readonly logger: Logger

  constructor({ redis, logger }: Deps) {
    this.redis = redis
    this.logger = logger.child({ store: 'SamlStateStore' })
  }

  async save(state: PendingSamlRequest): Promise<Result<string, CacheError>> {
    try {
      const nonce = randomBytes(24).toString('hex')
      await this.redis.setex(
        `${KEY_PREFIX}${nonce}`,
        TTL_SECONDS,
        JSON.stringify(state),
      )
      this.logger.debug({ appId: state.appId }, 'Stored pending SAML request')
      return ok(nonce)
    } catch (e) {
      return err(new CacheError('Failed to store pending SAML request', e))
    }
  }

  async consume(nonce: string): Promise<Result<PendingSamlRequest, NotFoundError | CacheError>> {
    const key = `${KEY_PREFIX}${nonce}`
    try {
      const raw = await this.redis.get(key)
      if (!raw) {
        return err(new NotFoundError('Pending SAML request not found or expired'))
      }
      // Single-use — delete immediately after reading
      await this.redis.del(key)
      return ok(JSON.parse(raw) as PendingSamlRequest)
    } catch (e) {
      return err(new CacheError('Failed to retrieve pending SAML request', e))
    }
  }
}