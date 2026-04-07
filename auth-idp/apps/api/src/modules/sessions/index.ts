import type { FastifyInstance } from 'fastify'
import { registerSessionRoutes } from './interface/SessionRoutes.js'

export async function registerSessionModule(app: FastifyInstance): Promise<void> {
  await registerSessionRoutes(app)
  app.log.info('Session management module registered')
}