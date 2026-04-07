import type { FastifyInstance } from 'fastify'
import { registerMfaRoutes } from './interface/MfaRoutes.js'

export async function registerMfaModule(app: FastifyInstance): Promise<void> {
  await registerMfaRoutes(app)
  app.log.info('MFA module registered')
}