import type { Result } from '../../../../shared/result/Result.js'
import type { AppError } from '../../../../shared/errors/AppError.js'
import type { Logger } from '../../../../shared/logger/logger.js'
import type { IAuditRepository } from '../ports/IAuditRepository.js'
import type { AuditEvent } from '../../domain/AuditEvent.js'

interface Deps {
  auditRepository: IAuditRepository
  logger: Logger
}

export class GetAuditEventUseCase {
  constructor(private readonly deps: Deps) {}

  async execute(id: string): Promise<Result<AuditEvent, AppError>> {
    return this.deps.auditRepository.findById(id)
  }
}