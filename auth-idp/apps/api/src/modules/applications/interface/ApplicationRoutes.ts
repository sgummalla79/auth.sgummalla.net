import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify'
import { isAppError, UnauthorizedError } from '../../../shared/errors/AppError.js'
import type { RegisterApplicationUseCase } from '../application/use-cases/RegisterApplication.js'
import type { GetApplicationUseCase, ListApplicationsUseCase, UpdateApplicationUseCase } from '../application/use-cases/ApplicationQueries.js'
import type { Env } from '../../../shared/config/env.js'
import { isOk, isErr } from '../../../shared/result/Result.js'

interface Deps {
  registerApplicationUseCase: RegisterApplicationUseCase
  getApplicationUseCase: GetApplicationUseCase
  listApplicationsUseCase: ListApplicationsUseCase
  updateApplicationUseCase: UpdateApplicationUseCase
  config: Env
}

function makeAdminAuthHook(adminApiKey: string) {
  return async (request: FastifyRequest, reply: FastifyReply): Promise<void> => {
    const token = request.headers['authorization']?.replace('Bearer ', '').trim()
    if (!token || token !== adminApiKey) {
      const error = new UnauthorizedError('Invalid or missing admin API key')
      return reply.status(401).send({ ...error.toJSON(), traceId: request.id })
    }
  }
}

function sendError(reply: FastifyReply, e: unknown, traceId: string) {
  return reply.status(isAppError(e) ? e.statusCode : 500).send({
    ...(isAppError(e) ? e.toJSON() : { code: 'INTERNAL_ERROR', message: 'Unknown error' }),
    traceId,
  })
}

export async function registerApplicationRoutes(app: FastifyInstance, deps: Deps): Promise<void> {
  const { registerApplicationUseCase, getApplicationUseCase, listApplicationsUseCase, updateApplicationUseCase, config } = deps

  await app.register(async (adminApp) => {
    adminApp.addHook('onRequest', makeAdminAuthHook(config.ADMIN_API_KEY))

    adminApp.post('/api/v1/admin/applications',
      async (request: FastifyRequest, reply: FastifyReply) => {
        const result = await registerApplicationUseCase.execute(request.body)
        if (isErr(result)) return sendError(reply, result.error, request.id)

        const { application, samlConfig, oidcClient, oidcClientSecret, jwtConfig } = result.value
        const response: Record<string, unknown> = {
          id: application.id, name: application.name, slug: application.slug,
          protocol: application.protocol, status: application.status, createdAt: application.createdAt,
        }

        if (samlConfig) {
          response['saml'] = {
            entityId: samlConfig.entityId, acsUrl: samlConfig.acsUrl, sloUrl: samlConfig.sloUrl,
            nameIdFormat: samlConfig.nameIdFormat, signAssertions: samlConfig.signAssertions,
          }
          response['idpMetadataUrl'] = `${config.IDP_BASE_URL}/saml/${application.id}/metadata`
        }

        if (oidcClient) {
          response['oidc'] = {
            clientId: oidcClient.clientId, clientSecret: oidcClientSecret,
            redirectUris: oidcClient.redirectUris, grantTypes: oidcClient.grantTypes,
            scopes: oidcClient.scopes, pkceRequired: oidcClient.pkceRequired,
          }
          response['discoveryUrl'] = `${config.IDP_ISSUER}/.well-known/openid-configuration`
          response['warning'] = 'Store the clientSecret immediately — it will not be shown again.'
        }

        if (jwtConfig) {
          response['jwt'] = {
            signingAlgorithm: jwtConfig.signingAlgorithm,
            tokenLifetime: jwtConfig.tokenLifetime,
            audience: jwtConfig.audience,
          }
        }

        return reply.status(201).send(response)
      },
    )

    adminApp.get('/api/v1/admin/applications',
      async (request: FastifyRequest, reply: FastifyReply) => {
        const result = await listApplicationsUseCase.execute()
        if (isErr(result)) return sendError(reply, result.error, request.id)
        return reply.status(200).send({
          applications: result.value.map((a) => ({
            id: a.id, name: a.name, slug: a.slug,
            protocol: a.protocol, status: a.status,
            createdAt: a.createdAt, updatedAt: a.updatedAt,
          })),
          total: result.value.length,
        })
      },
    )

    adminApp.get('/api/v1/admin/applications/:id',
      async (request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
        const result = await getApplicationUseCase.execute(request.params.id)
        if (isErr(result)) return sendError(reply, result.error, request.id)

        const { application, samlConfig, oidcClient, jwtConfig } = result.value
        const response: Record<string, unknown> = {
          id: application.id, name: application.name, slug: application.slug,
          protocol: application.protocol, status: application.status,
          logoUrl: application.logoUrl, description: application.description,
          createdAt: application.createdAt, updatedAt: application.updatedAt,
        }
        if (samlConfig) {
          response['saml'] = {
            entityId: samlConfig.entityId, acsUrl: samlConfig.acsUrl, sloUrl: samlConfig.sloUrl,
            nameIdFormat: samlConfig.nameIdFormat, signAssertions: samlConfig.signAssertions,
            signResponse: samlConfig.signResponse, encryptAssertions: samlConfig.encryptAssertions,
            attributeMappings: samlConfig.attributeMappings,
          }
        }
        if (oidcClient) {
          response['oidc'] = {
            clientId: oidcClient.clientId,
            redirectUris: oidcClient.redirectUris, postLogoutUris: oidcClient.postLogoutUris,
            grantTypes: oidcClient.grantTypes, responseTypes: oidcClient.responseTypes,
            scopes: oidcClient.scopes, tokenEndpointAuth: oidcClient.tokenEndpointAuth,
            pkceRequired: oidcClient.pkceRequired, accessTokenTtl: oidcClient.accessTokenTtl,
          }
        }
        if (jwtConfig) {
          response['jwt'] = {
            signingAlgorithm: jwtConfig.signingAlgorithm, publicKey: jwtConfig.publicKey,
            certThumbprint: jwtConfig.certThumbprint, tokenLifetime: jwtConfig.tokenLifetime,
            audience: jwtConfig.audience, customClaims: jwtConfig.customClaims,
          }
        }
        return reply.status(200).send(response)
      },
    )

    adminApp.patch('/api/v1/admin/applications/:id',
      async (request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
        const result = await updateApplicationUseCase.execute(request.params.id, request.body)
        if (isErr(result)) return sendError(reply, result.error, request.id)
        const a = result.value
        return reply.status(200).send({
          id: a.id, name: a.name, slug: a.slug, protocol: a.protocol,
          status: a.status, logoUrl: a.logoUrl, description: a.description, updatedAt: a.updatedAt,
        })
      },
    )
  })
}