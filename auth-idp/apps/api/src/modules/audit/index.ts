import type { FastifyInstance } from 'fastify'
import { registerAuditRoutes } from './interface/AuditRoutes.js'
import type { AuditWorker } from './worker/AuditWorker.js'
import type { MongoAuditRepository } from './infrastructure/MongoAuditRepository.js'

export async function registerAuditModule(
  app: FastifyInstance,
  auditRepository: MongoAuditRepository,
  auditWorker: AuditWorker,
): Promise<void> {
  // Ensure MongoDB indexes exist on startup
  await auditRepository.ensureIndexes()

  await registerAuditRoutes(app)

  // Graceful shutdown — close worker before process exits
  app.addHook('onClose', async () => {
    await auditWorker.close()
  })

  app.log.info('Audit logging module registered')
}