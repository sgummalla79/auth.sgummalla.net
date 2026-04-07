import { Worker } from 'bullmq'
import type { MongoAuditRepository } from '../infrastructure/MongoAuditRepository.js'
import type { Logger } from '../../../shared/logger/logger.js'
import type { LogAuditEventInput } from '../application/ports/IAuditLogger.js'
import type { Env } from '../../../shared/config/env.js'

const QUEUE_NAME = 'audit-events'

interface Deps {
  config: Env
  auditRepository: MongoAuditRepository
  logger: Logger
}

export class AuditWorker {
  private readonly worker: Worker
  private readonly logger: Logger

  constructor({ config, auditRepository, logger }: Deps) {
    this.logger = logger.child({ worker: 'AuditWorker' })

    this.worker = new Worker(
      QUEUE_NAME,
      async (job) => {
        const data = job.data as LogAuditEventInput & { occurredAt: string }
        const result = await auditRepository.save({
          type: data.type,
          outcome: data.outcome,
          userId: data.userId ?? null,
          appId: data.appId ?? null,
          traceId: data.traceId ?? null,
          ipAddress: data.ipAddress ?? null,
          userAgent: data.userAgent ?? null,
          metadata: data.metadata ?? {},
          occurredAt: new Date(data.occurredAt),
        })
        if (result.isErr()) {
          this.logger.error({ err: result.error, jobId: job.id }, 'Failed to persist audit event')
          throw result.error
        }
        this.logger.debug({ eventType: data.type, jobId: job.id }, 'Audit event persisted')
      },
      {
        connection: {
          url: config.REDIS_URL,
          maxRetriesPerRequest: null,
        },
        concurrency: 5,
      },
    )

    this.worker.on('failed', (job, err) => {
      this.logger.error({ jobId: job?.id, err }, 'Audit job failed permanently')
    })
  }

  async close(): Promise<void> {
    await this.worker.close()
  }
}