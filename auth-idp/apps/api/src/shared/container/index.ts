import { createContainer, asValue, asFunction, InjectionMode, AwilixContainer } from 'awilix'
import { getPostgresClient, DrizzleClient } from '../../infrastructure/database/postgres.client.js'
import { getRedisClient } from '../../infrastructure/cache/redis.client.js'
import { getMongoDb } from '../../infrastructure/mongo/mongo.client.js'
import { createLogger, Logger } from '../logger/logger.js'
import type { Db } from 'mongodb'
import type Redis from 'ioredis'

export interface Cradle {
  db: DrizzleClient
  redis: Redis
  mongoDb: Db
  logger: Logger
}

export type AppContainer = AwilixContainer<Cradle>

export function buildContainer(): AppContainer {
  const container = createContainer<Cradle>({
    injectionMode: InjectionMode.PROXY,
    strict: true,
  })

  container.register({
    db: asFunction(getPostgresClient).singleton(),
    redis: asValue(getRedisClient()),
    mongoDb: asFunction(getMongoDb).singleton(),
    logger: asFunction(() => createLogger('app')).singleton(),
  })

  return container
}

export function createRequestScope(
  container: AppContainer,
  context: { traceId: string },
): AwilixContainer<Cradle> {
  return container.createScope().register({
    logger: asValue(createLogger('request').child({ traceId: context.traceId })),
  })
}