import { MongoClient, Db } from 'mongodb'
import { getConfig } from '../../shared/config/env.js'
import { createLogger } from '../../shared/logger/logger.js'

const logger = createLogger('mongodb')

let _client: MongoClient | null = null
let _db: Db | null = null

export async function connectMongoDB(): Promise<Db> {
  if (_db) return _db
  const { MONGODB_URI, MONGODB_DB_NAME } = getConfig()

  _client = new MongoClient(MONGODB_URI, {
    maxPoolSize: 10,
    serverSelectionTimeoutMS: 5000,
    socketTimeoutMS: 45000,
  })

  await _client.connect()
  _db = _client.db(MONGODB_DB_NAME)

  await _db.collection('audit_logs').createIndexes([
    { key: { createdAt: -1 }, name: 'idx_audit_created_at' },
    { key: { actorId: 1, createdAt: -1 }, name: 'idx_audit_actor' },
    { key: { createdAt: 1 }, name: 'idx_audit_ttl', expireAfterSeconds: 60 * 60 * 24 * 365 },
  ])

  logger.info({ database: MONGODB_DB_NAME }, 'MongoDB connected')
  return _db
}

export function getMongoDb(): Db {
  if (!_db) throw new Error('MongoDB not connected. Call connectMongoDB() first.')
  return _db
}

export async function checkMongoHealth(): Promise<boolean> {
  try {
    if (!_client) return false
    await _client.db('admin').command({ ping: 1 })
    return true
  } catch (error) {
    logger.error({ err: error }, 'MongoDB health check failed')
    return false
  }
}

export async function disconnectMongoDB(): Promise<void> {
  if (_client) {
    await _client.close()
    _client = null
    _db = null
    logger.info('MongoDB disconnected')
  }
}