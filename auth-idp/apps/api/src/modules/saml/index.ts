import type { FastifyInstance } from 'fastify'
import { registerSamlRoutes } from './interface/SamlRoutes.js'

export async function registerSamlModule(app: FastifyInstance): Promise<void> {
  await registerSamlRoutes(app)
  app.log.info('SAML 2.0 module registered')
}