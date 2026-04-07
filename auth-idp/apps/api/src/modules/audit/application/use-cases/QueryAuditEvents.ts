import type { Result } from '../../../../shared/result/Result.js'
import type { AppError } from '../../../../shared/errors/AppError.js'
import type { Logger } from '../../../../shared/logger/logger.js'
import type { IAuditRepository, QueryAuditEventsInput } from '../ports/IAuditRepository.js'
import type { AuditEvent } from '../../domain/AuditEvent.js'

interface Deps {
  auditRepository: IAuditRepository
  logger: Logger
}

export class QueryAuditEventsUseCase {
  constructor(private readonly deps: Deps) {}

  async execute(input: QueryAuditEventsInput): Promise<Result<AuditEvent[], AppError>> {
    const { auditRepository } = this.deps

    const limit = Math.min(input.limit ?? 50, 200)
    return auditRepository.query({ ...input, limit })
  }
}