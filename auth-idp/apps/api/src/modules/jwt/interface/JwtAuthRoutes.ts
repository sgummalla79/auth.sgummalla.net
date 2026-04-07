import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify'
import { z } from 'zod'
import type { Cradle } from '../../../shared/container/container.js'

const JwtAssertionSchema = z.object({
  client_id: z.string().min(1),
  client_assertion_type: z.string().min(1),
  client_assertion: z.string().min(1),
})

export async function registerJwtAuthRoutes(app: FastifyInstance): Promise<void> {

  app.post(
    '/auth/token/jwt-assertion',
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { handleJwtAssertionUseCase } = request.container.cradle as Cradle

      const parsed = JwtAssertionSchema.safeParse(request.body)
      if (!parsed.success) {
        const fields: Record<string, string[]> = {}
        for (const issue of parsed.error.issues) {
          const key = issue.path.join('.') || 'unknown'
          if (!fields[key]) fields[key] = []
          fields[key]!.push(issue.message)
        }
        return reply.status(422).send({ code: 'VALIDATION_ERROR', message: 'Invalid request', fields })
      }

      const result = await handleJwtAssertionUseCase.execute({
        clientId: parsed.data.client_id,
        clientAssertionType: parsed.data.client_assertion_type,
        clientAssertion: parsed.data.client_assertion,
      })

      if (result.isErr()) throw result.error

      const token = result.value
      return reply.status(200).send({
        access_token: token.token,
        token_type: 'Bearer',
        expires_in: Math.floor((token.expiresAt.getTime() - Date.now()) / 1000),
        audience: token.audience,
      })
    },
  )

  app.post(
    '/auth/token/mtls',
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { handleMtlsTokenUseCase } = request.container.cradle as Cradle

      const rawCert = request.headers['x-ssl-client-cert'] as string | undefined
      const certVerified = request.headers['x-ssl-client-verify'] === 'SUCCESS'

      const body = request.body as Record<string, string> | undefined
      const devCert = body?.client_cert_pem
      const isDev = process.env.NODE_ENV !== 'production'

      const clientCertPem = rawCert
        ? decodeURIComponent(rawCert)
        : (isDev && devCert ? devCert : undefined)

      const effectiveCertVerified = rawCert ? certVerified : (isDev && !!devCert)

      if (!clientCertPem) {
        return reply.status(401).send({ code: 'UNAUTHORIZED', message: 'No client certificate provided' })
      }

      const result = await handleMtlsTokenUseCase.execute({
        clientCertPem,
        certVerified: effectiveCertVerified,
      })

      if (result.isErr()) throw result.error

      const token = result.value
      return reply.status(200).send({
        access_token: token.token,
        token_type: 'Bearer',
        expires_in: Math.floor((token.expiresAt.getTime() - Date.now()) / 1000),
        audience: token.audience,
      })
    },
  )
}