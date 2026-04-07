import type { AuditEventType, AuditOutcome } from '../../domain/AuditEvent.js'

export interface LogAuditEventInput {
  type: AuditEventType
  outcome: AuditOutcome
  userId?: string | null
  appId?: string | null
  traceId?: string | null
  ipAddress?: string | null
  userAgent?: string | null
  metadata?: Record<string, unknown>
}

/**
 * IAuditLogger — fire-and-forget audit event logging.
 * Implementations MUST NOT throw — failures are swallowed and logged internally.
 * Callers should not await this if they don't want to add latency.
 */
export interface IAuditLogger {
  log(event: LogAuditEventInput): Promise<void>
}