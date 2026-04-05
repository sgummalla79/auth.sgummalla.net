import { drizzle, PostgresJsDatabase } from 'drizzle-orm/postgres-js'
import postgres from 'postgres'
import { getConfig } from '../../shared/config/env.js'
import { createLogger } from '../../shared/logger/logger.js'
import * as schema from '../../database/index.js'

const logger = createLogger('postgres')

export type DrizzleClient = PostgresJsDatabase<typeof schema>

let _sql: postgres.Sql | null = null
let _db: DrizzleClient | null = null

export function getPostgresClient(): DrizzleClient {
  if (_db) return _db

  const { DATABASE_URL, NODE_ENV } = getConfig()

  _sql = postgres(DATABASE_URL, {
    max: NODE_ENV === 'production' ? 10 : 3,
    idle_timeout: 20,
    connect_timeout: 10,
    prepare: false,
    onnotice: (notice) => logger.debug({ notice }, 'Postgres notice'),
  })

  _db = drizzle(_sql, { schema, logger: NODE_ENV === 'development' })

  logger.info('Postgres client initialized')
  return _db
}

export async function checkPostgresHealth(): Promise<boolean> {
  try {
    if (!_sql) return false
    await _sql`SELECT 1`
    return true
  } catch (error) {
    logger.error({ err: error }, 'Postgres health check failed')
    return false
  }
}

export async function disconnectPostgres(): Promise<void> {
  if (_sql) {
    await _sql.end()
    _sql = null
    _db = null
    logger.info('Postgres disconnected')
  }
}