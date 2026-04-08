import { Redis } from 'ioredis'
import { getConfig } from '../../shared/config/env.js'
import { createLogger } from '../../shared/logger/logger.js'

const logger = createLogger('redis')

let _client: Redis | null = null

export function getRedisClient(): Redis {
  if (_client) return _client
  const { REDIS_URL } = getConfig()

  _client = new Redis(REDIS_URL, {
    lazyConnect: true,
    retryStrategy(times: number): number | null {
      if (times > 10) return null
      return Math.min(times * 200, 2000)
    },
    maxRetriesPerRequest: 3,
    enableReadyCheck: true,
    keepAlive: 10000,
  })

  _client.on('connect', () => logger.info('Redis connecting'))
  _client.on('ready', () => logger.info('Redis ready'))
  _client.on('error', (err: Error) => logger.error({ err }, 'Redis error'))
  _client.on('close', () => logger.warn('Redis connection closed'))

  return _client
}

export async function connectRedis(): Promise<void> {
  const client = getRedisClient()
  await client.connect()
}

export async function checkRedisHealth(): Promise<boolean> {
  try {
    if (!_client) return false
    const pong = await _client.ping()
    return pong === 'PONG'
  } catch (error) {
    logger.error({ err: error }, 'Redis health check failed')
    return false
  }
}

export async function disconnectRedis(): Promise<void> {
  if (_client) {
    await _client.quit()
    _client = null
    logger.info('Redis disconnected')
  }
}