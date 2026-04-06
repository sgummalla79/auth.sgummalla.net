import { createContainer, asValue, asFunction, InjectionMode, AwilixContainer, asClass} from 'awilix'
import { getPostgresClient, DrizzleClient } from '../../infrastructure/database/postgres.client.js'
import { getRedisClient } from '../../infrastructure/cache/redis.client.js'
import { getMongoDb } from '../../infrastructure/mongo/mongo.client.js'
import { createLogger, Logger } from '../logger/logger.js'
import { getConfig } from '../config/env.js'

import { GetIdpMetadataUseCase } from '../../modules/saml/application/use-cases/GetIdpMetadata.js'
import { HandleSsoRequestUseCase } from '../../modules/saml/application/use-cases/HandleSsoRequest.js'
import { HandleSloRequestUseCase } from '../../modules/saml/application/use-cases/HandleSloRequest.js'
import { SamlifyIdpService } from '../../modules/saml/infrastructure/SamlifyIdpService.js'
import { ForgeSamlCertificateService } from '../../modules/saml/infrastructure/ForgeSamlCertificateService.js'
import { RedisSamlStateStore } from '../../modules/saml/infrastructure/RedisSamlStateStore.js'

import type { Env } from '../config/env.js'
import type { Db } from 'mongodb'
import type { Redis } from 'ioredis'
import type { ISigningKeyRepository } from '../../modules/keys/application/ports/ISigningKeyRepository.js'
import type { IKeyEncryptionService } from '../../modules/keys/application/ports/IKeyEncryptionService.js'
import type { IKeyGenerationService } from '../../modules/keys/application/ports/IKeyGenerationService.js'
import type { IKeyCache } from '../../modules/keys/application/ports/IKeyCache.js'
import type { GenerateSigningKeyUseCase } from '../../modules/keys/application/use-cases/GenerateSigningKey.js'
import type { RotateSigningKeyUseCase } from '../../modules/keys/application/use-cases/RotateSigningKey.js'
import type { GetJwksUseCase } from '../../modules/keys/application/use-cases/GetJwks.js'
import type { IUserRepository } from '../../modules/users/application/ports/IUserRepository.js'
import type { IHashService } from '../../modules/users/application/ports/IHashService.js'
import type { ISessionStore } from '../../modules/users/application/ports/ISessionStore.js'
import type { RegisterUserUseCase } from '../../modules/users/application/use-cases/RegisterUser.js'
import type { LoginUserUseCase } from '../../modules/users/application/use-cases/LoginUser.js'
import type { GetUserProfileUseCase, UpdateUserProfileUseCase } from '../../modules/users/application/use-cases/UserProfile.js'
import type { IApplicationRepository } from '../../modules/applications/application/ports/IApplicationRepository.js'
import type { ISlugGenerator } from '../../modules/applications/application/ports/ISlugGenerator.js'
import type { ICredentialGenerator } from '../../modules/applications/application/ports/ICredentialGenerator.js'
import type { RegisterApplicationUseCase } from '../../modules/applications/application/use-cases/RegisterApplication.js'
import type { GetApplicationUseCase, ListApplicationsUseCase, UpdateApplicationUseCase } from '../../modules/applications/application/use-cases/ApplicationQueries.js'
import type { ISamlIdpService } from '../../modules/saml/application/ports/ISamlIdpService.js'
import type { ISamlCertificateService } from '../../modules/saml/application/ports/ISamlCertificateService.js'
import type { ISamlStateStore } from '../../modules/saml/application/ports/ISamlStateStore.js'

export interface Cradle {
  db: DrizzleClient
  redis: Redis
  mongoDb: Db
  logger: Logger
  config: Env
  keyGenerationService: IKeyGenerationService
  keyEncryptionService: IKeyEncryptionService
  keyCache: IKeyCache
  signingKeyRepository: ISigningKeyRepository
  generateSigningKeyUseCase: GenerateSigningKeyUseCase
  rotateSigningKeyUseCase: RotateSigningKeyUseCase
  getJwksUseCase: GetJwksUseCase
  //User Module
  userRepository: IUserRepository
  hashService: IHashService
  sessionStore: ISessionStore
  registerUserUseCase: RegisterUserUseCase
  loginUserUseCase: LoginUserUseCase
  getUserProfileUseCase: GetUserProfileUseCase
  updateUserProfileUseCase: UpdateUserProfileUseCase
  // Applications module
  applicationRepository: IApplicationRepository
  slugGenerator: ISlugGenerator
  credentialGenerator: ICredentialGenerator
  registerApplicationUseCase: RegisterApplicationUseCase
  getApplicationUseCase: GetApplicationUseCase
  listApplicationsUseCase: ListApplicationsUseCase
  updateApplicationUseCase: UpdateApplicationUseCase
  //SAML
  getIdpMetadataUseCase: GetIdpMetadataUseCase
  handleSsoRequestUseCase: HandleSsoRequestUseCase
  handleSloRequestUseCase: HandleSloRequestUseCase
  samlIdpService: ISamlIdpService
  samlCertificateService: ISamlCertificateService
  samlStateStore: ISamlStateStore
}

export type AppContainer = AwilixContainer<Cradle>

export function buildContainer(): AppContainer {
  const container = createContainer<Cradle>({
    injectionMode: InjectionMode.PROXY,
    strict: true,
  })

  container.register({
    db: asFunction(getPostgresClient).singleton(),
    redis: asValue(getRedisClient()),
    mongoDb: asFunction(getMongoDb).singleton(),
    logger: asFunction(() => createLogger('app')).singleton(),
    config: asValue(getConfig())
  })

  container.register({
    samlCertificateService: asClass(ForgeSamlCertificateService).singleton(),
    samlIdpService:         asClass(SamlifyIdpService).singleton(),
    samlStateStore:         asClass(RedisSamlStateStore).scoped(),
    getIdpMetadataUseCase:  asClass(GetIdpMetadataUseCase).scoped(),
    handleSsoRequestUseCase: asClass(HandleSsoRequestUseCase).scoped(),
    handleSloRequestUseCase: asClass(HandleSloRequestUseCase).scoped(),
  })

  return container
}

export function createRequestScope(
  container: AppContainer,
  context: { traceId: string },
): AwilixContainer<Cradle> {
  return container.createScope().register({
    logger: asValue(createLogger('request').child({ traceId: context.traceId })),
  })
}