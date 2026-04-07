import type { AuditEvent, AuditEventType } from '../../domain/AuditEvent.js'
import type { Result } from '../../../../shared/result/Result.js'
import type { DatabaseError, NotFoundError } from '../../../../shared/errors/AppError.js'

export interface QueryAuditEventsInput {
  userId?: string
  appId?: string
  type?: AuditEventType
  outcome?: 'success' | 'failure'
  from?: Date
  to?: Date
  limit?: number
  offset?: number
}

export interface IAuditRepository {
  save(event: Omit<AuditEvent, 'id'>): Promise<Result<AuditEvent, DatabaseError>>
  findById(id: string): Promise<Result<AuditEvent, NotFoundError | DatabaseError>>
  query(input: QueryAuditEventsInput): Promise<Result<AuditEvent[], DatabaseError>>
}