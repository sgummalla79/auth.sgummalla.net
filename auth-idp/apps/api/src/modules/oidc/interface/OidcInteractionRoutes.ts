import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify'
import type Provider from 'oidc-provider'
import { isAppError } from '../../../shared/errors/AppError.js'
import type { LoginUserUseCase } from '../../users/application/use-cases/LoginUser.js'
import type { Logger } from '../../../shared/logger/logger.js'
import { isErr } from '../../../shared/result/Result.js'

interface Deps {
  oidcProvider: Provider
  loginUserUseCase: LoginUserUseCase
  logger: Logger
}

export async function registerOidcInteractionRoutes(
  app: FastifyInstance,
  { oidcProvider, loginUserUseCase, logger }: Deps,
): Promise<void> {

  // ── GET /oidc/interaction/:uid ──────────────────────────────────────────
  // Returns prompt details so the client knows what to submit.
  // We pass through to oidc-provider's callback so it handles cookies.

  app.get(
  '/oidc/interaction/:uid',
  async (request: FastifyRequest<{ Params: { uid: string } }>, reply: FastifyReply) => {
    try {
      const details = await oidcProvider.interactionDetails(request.raw, reply.raw)
      return reply.status(200).send({
        uid: details.uid,
        prompt: details.prompt,
        params: details.params,
        submitUrl: `/oidc/interaction/${details.uid}/login`,
      })
    } catch (error) {
      logger.error({ err: error }, 'Failed to get interaction details')
      return reply.status(400).send({
        code: 'INTERACTION_ERROR',
        message: 'Invalid interaction',
      })
    }
  },
)

  // ── POST /oidc/interaction/:uid/login ────────────────────────────────────

  app.post(
    '/oidc/interaction/:uid/login',
    { config: { rateLimit: { max: 20, timeWindow: '1 minute' } } },
    async (request: FastifyRequest<{ Params: { uid: string } }>, reply: FastifyReply) => {
      try {
        const body = request.body as { email?: string; password?: string }

        if (!body.email || !body.password) {
          return reply.status(400).send({
            code: 'VALIDATION_ERROR',
            message: 'email and password are required',
          })
        }

        const loginResult = await loginUserUseCase.execute({
          email: body.email,
          password: body.password,
        })

        if (isErr(loginResult)) {
          const e = loginResult.error
          return reply.status(isAppError(e) ? e.statusCode : 500).send({
            ...(isAppError(e) ? e.toJSON() : { code: 'INTERNAL_ERROR', message: 'Login failed' }),
            traceId: request.id,
          })
        }

        const { userId } = loginResult.value

        // interactionFinished needs oidc-provider to handle the response
        // directly — hijack so Fastify doesn't interfere
        reply.hijack()

        await oidcProvider.interactionFinished(
          request.raw,
          reply.raw,
          {
            login: {
              accountId: userId,
              amr: ['pwd'],
            },
          },
          { mergeWithLastSubmission: false },
        )
      } catch (error) {
        logger.error({ err: error, uid: request.params.uid }, 'Interaction login failed')
        if (!reply.sent) {
          return reply.status(500).send({
            code: 'INTERNAL_ERROR',
            message: 'Login interaction failed',
            traceId: request.id,
          })
        }
      }
    },
  )

  // ── POST /oidc/interaction/:uid/abort ────────────────────────────────────

  app.post(
    '/oidc/interaction/:uid/abort',
    async (request: FastifyRequest<{ Params: { uid: string } }>, reply: FastifyReply) => {
      try {
        reply.hijack()
        await oidcProvider.interactionFinished(
          request.raw,
          reply.raw,
          {
            error: 'access_denied',
            error_description: 'End-User aborted interaction',
          },
          { mergeWithLastSubmission: false },
        )
      } catch (error) {
        logger.error({ err: error }, 'Interaction abort failed')
        if (!reply.sent) {
          return reply.status(500).send({ code: 'INTERNAL_ERROR', message: 'Abort failed' })
        }
      }
    },
  )

  // ── POST /oidc/interaction/:uid/confirm ──────────────────────────────────────
  // Grants consent for the requested scopes.
  // In production this would show a UI asking the user to approve.
  // Here we auto-grant everything the client requested.

  app.post(
    '/oidc/interaction/:uid/confirm',
    async (request: FastifyRequest<{ Params: { uid: string } }>, reply: FastifyReply) => {
      try {
        const details = await oidcProvider.interactionDetails(request.raw, reply.raw)

        const { session, params, prompt } = details
        const accountId = (session as { accountId: string }).accountId

        // Build the grant
        const grant = new oidcProvider.Grant({
          accountId,
          clientId: params['client_id'] as string,
        })

        // Auto-grant all requested scopes and claims
        if (prompt.details['missingOIDCScope']) {
          const scopes = prompt.details['missingOIDCScope'] as string[]
          grant.addOIDCScope(scopes.join(' '))
        }

        if (prompt.details['missingOIDCClaims']) {
          const claims = prompt.details['missingOIDCClaims'] as string[]
          grant.addOIDCClaims(claims)
        }

        if (prompt.details['missingResourceScopes']) {
          const resourceScopes = prompt.details['missingResourceScopes'] as Record<string, string[]>
          for (const [indicator, scopes] of Object.entries(resourceScopes)) {
            grant.addResourceScope(indicator, scopes.join(' '))
          }
        }

        const grantId = await grant.save()

        reply.hijack()

        await oidcProvider.interactionFinished(
          request.raw,
          reply.raw,
          { consent: { grantId } },
          { mergeWithLastSubmission: true },
        )
      } catch (error) {
        logger.error({ err: error, uid: request.params.uid }, 'Consent failed')
        if (!reply.sent) {
          return reply.status(500).send({
            code: 'INTERNAL_ERROR',
            message: 'Consent failed',
            traceId: request.id,
          })
        }
      }
    },
  )
}