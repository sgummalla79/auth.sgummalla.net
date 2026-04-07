import { Queue } from 'bullmq'
import type { IAuditLogger, LogAuditEventInput } from '../application/ports/IAuditLogger.js'
import type { Logger } from '../../../shared/logger/logger.js'
import type { Env } from '../../../shared/config/env.js'

const QUEUE_NAME = 'audit-events'

interface Deps {
  config: Env
  logger: Logger
}

export class BullmqAuditLogger implements IAuditLogger {
  private readonly queue: Queue
  private readonly logger: Logger

  constructor({ config, logger }: Deps) {
    this.queue = new Queue(QUEUE_NAME, {
      connection: {
        url: config.REDIS_URL,
        maxRetriesPerRequest: null,
      },
      defaultJobOptions: {
        attempts: 3,
        backoff: { type: 'exponential', delay: 1000 },
        removeOnComplete: 100,
        removeOnFail: 500,
      },
    })
    this.logger = logger.child({ service: 'BullmqAuditLogger' })
  }

  async log(event: LogAuditEventInput): Promise<void> {
    try {
      await this.queue.add('audit', {
        ...event,
        occurredAt: new Date().toISOString(),
      })
    } catch (e) {
      this.logger.error({ err: e, eventType: event.type }, 'Failed to enqueue audit event')
    }
  }
}