import { createContainer, asValue, asFunction, InjectionMode, AwilixContainer } from 'awilix'
import { getPostgresClient, DrizzleClient } from '../../infrastructure/database/postgres.client.js'
import { getRedisClient } from '../../infrastructure/cache/redis.client.js'
import { getMongoDb } from '../../infrastructure/mongo/mongo.client.js'
import { createLogger, Logger } from '../logger/logger.js'
import { getConfig } from '../config/env.js'
import type { Env } from '../config/env.js'
import type { Db } from 'mongodb'
import type Redis from 'ioredis'
import type { ISigningKeyRepository } from '../../modules/keys/application/ports/ISigningKeyRepository.js'
import type { IKeyEncryptionService } from '../../modules/keys/application/ports/IKeyEncryptionService.js'
import type { IKeyGenerationService } from '../../modules/keys/application/ports/IKeyGenerationService.js'
import type { IKeyCache } from '../../modules/keys/application/ports/IKeyCache.js'
import type { GenerateSigningKeyUseCase } from '../../modules/keys/application/use-cases/GenerateSigningKey.js'
import type { RotateSigningKeyUseCase } from '../../modules/keys/application/use-cases/RotateSigningKey.js'
import type { GetJwksUseCase } from '../../modules/keys/application/use-cases/GetJwks.js'

export interface Cradle {
  db: DrizzleClient
  redis: Redis
  mongoDb: Db
  logger: Logger
  config: Env
  keyGenerationService: IKeyGenerationService
  keyEncryptionService: IKeyEncryptionService
  keyCache: IKeyCache
  signingKeyRepository: ISigningKeyRepository
  generateSigningKeyUseCase: GenerateSigningKeyUseCase
  rotateSigningKeyUseCase: RotateSigningKeyUseCase
  getJwksUseCase: GetJwksUseCase
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
    config: asValue(getConfig())
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