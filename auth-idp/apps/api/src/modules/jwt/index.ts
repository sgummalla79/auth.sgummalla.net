import type { FastifyInstance } from 'fastify'
import { registerJwtAuthRoutes } from './interface/JwtAuthRoutes.js'

export async function registerJwtAuthModule(app: FastifyInstance): Promise<void> {
  await registerJwtAuthRoutes(app)
  app.log.info('JWT / cert auth module registered')
}