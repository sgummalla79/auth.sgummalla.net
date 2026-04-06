import 'dotenv/config'

import { loadConfig } from './shared/config/env.js'


const config = loadConfig()

import { createLogger } from './shared/logger/logger.js'
import type { AppContainer } from './shared/container/index.js'
import { connectRedis, disconnectRedis } from './infrastructure/cache/redis.client.js'
import { connectMongoDB, disconnectMongoDB } from './infrastructure/mongo/mongo.client.js'
import { getPostgresClient, disconnectPostgres } from './infrastructure/database/postgres.client.js'
import { buildApp } from './app.js'

const logger = createLogger('server')

async function bootstrapSigningKeys(container: AppContainer): Promise<void> {
  const serverLogger = createLogger('server')
  const repo = container.cradle.signingKeyRepository
  const existing = await repo.findActiveSigningKey()

  if (existing.isOk()) {
    serverLogger.info({ kid: existing.value.kid }, 'Active signing key found')
    return
  }

  serverLogger.info('No active signing key — generating initial RS256 key')
  const generateUseCase = container.cradle.generateSigningKeyUseCase
  const result = await generateUseCase.execute({ algorithm: 'RS256', expiresInDays: 90 })

  if (result.isErr()) {
    throw new Error(`Failed to generate initial signing key: ${result.error.message}`)
  }

  serverLogger.info({ kid: result.value.kid }, 'Initial signing key generated')
}

async function bootstrap(): Promise<void> {
  logger.info({ env: config.NODE_ENV, issuer: config.IDP_ISSUER }, 'Starting IDP server')

  await Promise.all([
    connectRedis().then(() => logger.info('Redis connected')),
    connectMongoDB().then(() => logger.info('MongoDB connected')),
  ])

  getPostgresClient()
  logger.info('Postgres client ready')

  const app = await buildApp()
  await bootstrapSigningKeys(app.container)
  await app.listen({ port: config.PORT, host: config.HOST })
  logger.info({ port: config.PORT }, 'IDP server listening')

  const shutdown = async (signal: string): Promise<void> => {
    logger.info({ signal }, 'Shutting down...')
    await app.close()
    await Promise.all([disconnectRedis(), disconnectMongoDB(), disconnectPostgres()])
    logger.info('Shutdown complete')
    process.exit(0)
  }

  process.on('SIGTERM', () => void shutdown('SIGTERM'))
  process.on('SIGINT', () => void shutdown('SIGINT'))
  process.on('unhandledRejection', (reason) => { logger.fatal({ reason }, 'Unhandled rejection'); process.exit(1) })
}

bootstrap().catch((err) => { console.error('Startup failed:', err); process.exit(1) })