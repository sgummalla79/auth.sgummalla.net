import { randomUUID } from 'crypto'
import type { Db, Collection } from 'mongodb'
import { ok, err } from '../../../shared/result/Result.js'
import type { Result } from '../../../shared/result/Result.js'
import { DatabaseError, NotFoundError } from '../../../shared/errors/AppError.js'
import type { IAuditRepository, QueryAuditEventsInput } from '../application/ports/IAuditRepository.js'
import { AuditEvent } from '../domain/AuditEvent.js'
import type { AuditEventType, AuditOutcome } from '../domain/AuditEvent.js'
import type { Logger } from '../../../shared/logger/logger.js'

const COLLECTION = 'audit_events'
const TTL_SECONDS = 90 * 24 * 60 * 60 // 90 days

interface AuditDoc {
  _id: string
  type: AuditEventType
  outcome: AuditOutcome
  userId: string | null
  appId: string | null
  traceId: string | null
  ipAddress: string | null
  userAgent: string | null
  metadata: Record<string, unknown>
  occurredAt: Date
}

interface Deps {
  mongoDb: Db
  logger: Logger
}

export class MongoAuditRepository implements IAuditRepository {
  private readonly col: Collection<AuditDoc>
  private readonly logger: Logger
  private initialized = false

  constructor({ mongoDb, logger }: Deps) {
    this.col = mongoDb.collection<AuditDoc>(COLLECTION)
    this.logger = logger.child({ repository: 'MongoAuditRepository' })
  }

  /**
   * Ensure indexes exist — called once at startup.
   * TTL index auto-expires documents after 90 days.
   */
  async ensureIndexes(): Promise<void> {
    if (this.initialized) return
    try {
      await this.col.createIndexes([
        { key: { occurredAt: 1 }, expireAfterSeconds: TTL_SECONDS, name: 'ttl_90d' },
        { key: { userId: 1, occurredAt: -1 }, name: 'user_time' },
        { key: { type: 1, occurredAt: -1 }, name: 'type_time' },
        { key: { appId: 1, occurredAt: -1 }, name: 'app_time' },
        { key: { outcome: 1, occurredAt: -1 }, name: 'outcome_time' },
      ])
      this.initialized = true
      this.logger.info('Audit indexes ensured')
    } catch (e) {
      this.logger.error({ err: e }, 'Failed to ensure audit indexes')
    }
  }

  async save(event: Omit<AuditEvent, 'id'>): Promise<Result<AuditEvent, DatabaseError>> {
    try {
      const id = randomUUID()
      const doc: AuditDoc = {
        _id: id,
        type: event.type,
        outcome: event.outcome,
        userId: event.userId,
        appId: event.appId,
        traceId: event.traceId,
        ipAddress: event.ipAddress,
        userAgent: event.userAgent,
        metadata: event.metadata,
        occurredAt: event.occurredAt,
      }
      await this.col.insertOne(doc)
      return ok(new AuditEvent(
        id, event.type, event.outcome, event.userId, event.appId,
        event.traceId, event.ipAddress, event.userAgent, event.metadata, event.occurredAt,
      ))
    } catch (e) {
      return err(new DatabaseError('Failed to save audit event', e))
    }
  }

  async findById(id: string): Promise<Result<AuditEvent, NotFoundError | DatabaseError>> {
    try {
      const doc = await this.col.findOne({ _id: id })
      if (!doc) return err(new NotFoundError(`Audit event not found: ${id}`))
      return ok(this.toDomain(doc))
    } catch (e) {
      return err(new DatabaseError('Failed to find audit event', e))
    }
  }

  async query(input: QueryAuditEventsInput): Promise<Result<AuditEvent[], DatabaseError>> {
    try {
      const filter: Record<string, unknown> = {}
      if (input.userId) filter.userId = input.userId
      if (input.appId) filter.appId = input.appId
      if (input.type) filter.type = input.type
      if (input.outcome) filter.outcome = input.outcome
      if (input.from || input.to) {
        filter.occurredAt = {}
        if (input.from) (filter.occurredAt as Record<string, unknown>).$gte = input.from
        if (input.to) (filter.occurredAt as Record<string, unknown>).$lte = input.to
      }

      const docs = await this.col
        .find(filter)
        .sort({ occurredAt: -1 })
        .skip(input.offset ?? 0)
        .limit(input.limit ?? 50)
        .toArray()

      return ok(docs.map(d => this.toDomain(d)))
    } catch (e) {
      return err(new DatabaseError('Failed to query audit events', e))
    }
  }

  private toDomain(doc: AuditDoc): AuditEvent {
    return new AuditEvent(
      doc._id, doc.type, doc.outcome, doc.userId, doc.appId,
      doc.traceId, doc.ipAddress, doc.userAgent, doc.metadata, doc.occurredAt,
    )
  }
}