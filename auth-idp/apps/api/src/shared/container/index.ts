import { createContainer, asValue, asFunction, InjectionMode, AwilixContainer, asClass} from 'awilix'
import { getPostgresClient, DrizzleClient } from '../../infrastructure/database/postgres.client.js'
import { getRedisClient } from '../../infrastructure/cache/redis.client.js'
import { getMongoDb } from '../../infrastructure/mongo/mongo.client.js'
import { createLogger, Logger } from '../logger/logger.js'
import { getConfig } from '../config/env.js'
import { SetupTotpUseCase } from '../../modules/mfa/application/use-cases/SetupTotp.js'
import { VerifyTotpSetupUseCase } from '../../modules/mfa/application/use-cases/VerifyTotpSetup.js'
import { ValidateTotpUseCase } from '../../modules/mfa/application/use-cases/ValidateTotp.js'
import { GenerateBackupCodesUseCase } from '../../modules/mfa/application/use-cases/GenerateBackupCodes.js'
import { UseBackupCodeUseCase } from '../../modules/mfa/application/use-cases/UseBackupCode.js'
import { GetMfaStatusUseCase } from '../../modules/mfa/application/use-cases/GetMfaStatus.js'
import { OtplibTotpService } from '../../modules/mfa/infrastructure/OtplibTotpService.js'
import { Argon2BackupCodeService } from '../../modules/mfa/infrastructure/Argon2BackupCodeService.js'
import { SupabaseMfaRepository } from '../../modules/mfa/infrastructure/SupabaseMfaRepository.js'
import { GetIdpMetadataUseCase } from '../../modules/saml/application/use-cases/GetIdpMetadata.js'
import { HandleSsoRequestUseCase } from '../../modules/saml/application/use-cases/HandleSsoRequest.js'
import { HandleSloRequestUseCase } from '../../modules/saml/application/use-cases/HandleSloRequest.js'
import { SamlifyIdpService } from '../../modules/saml/infrastructure/SamlifyIdpService.js'
import { ForgeSamlCertificateService } from '../../modules/saml/infrastructure/ForgeSamlCertificateService.js'
import { RedisSamlStateStore } from '../../modules/saml/infrastructure/RedisSamlStateStore.js'
import { HandleJwtAssertionUseCase } from '../../modules/jwt/application/use-cases/HandleJwtAssertion.js'
import { HandleMtlsTokenUseCase } from '../../modules/jwt/application/use-cases/HandleMtlsToken.js'
import { JoseJwtAssertionVerifier } from '../../modules/jwt/infrastructure/JoseJwtAssertionVerifier.js'
import { JoseAccessTokenIssuer } from '../../modules/jwt/infrastructure/JoseAccessTokenIssuer.js'
import { ForgeCertThumbprintExtractor } from '../../modules/jwt/infrastructure/ForgeCertThumbprintExtractor.js'
import { CreateSsoSessionUseCase } from '../../modules/sessions/application/use-cases/CreateSsoSession.js'
import { AddParticipatingAppUseCase } from '../../modules/sessions/application/use-cases/AddParticipatingApp.js'
import { GetUserSessionsUseCase } from '../../modules/sessions/application/use-cases/GetUserSessions.js'
import { RevokeSessionUseCase } from '../../modules/sessions/application/use-cases/RevokeSession.js'
import { RevokeAllSessionsUseCase } from '../../modules/sessions/application/use-cases/RevokeAllSessions.js'
import { SupabaseSsoSessionRepository } from '../../modules/sessions/infrastructure/SupabaseSsoSessionRepository.js'
import { HttpSloFanoutService } from '../../modules/sessions/infrastructure/HttpSloFanoutService.js'
import { MongoAuditRepository } from '../../modules/audit/infrastructure/MongoAuditRepository.js'
import { BullmqAuditLogger } from '../../modules/audit/infrastructure/BullmqAuditLogger.js'
import { AuditWorker } from '../../modules/audit/worker/AuditWorker.js'
import { QueryAuditEventsUseCase } from '../../modules/audit/application/use-cases/QueryAuditEvents.js'
import { GetAuditEventUseCase } from '../../modules/audit/application/use-cases/GetAuditEvent.js'

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
  handleJwtAssertionUseCase: HandleJwtAssertionUseCase
  handleMtlsTokenUseCase: HandleMtlsTokenUseCase
  jwtAssertionVerifier: JoseJwtAssertionVerifier
  accessTokenIssuer: JoseAccessTokenIssuer
  certThumbprintExtractor: ForgeCertThumbprintExtractor
  //MFA
  mfaRepository: SupabaseMfaRepository
  totpService: OtplibTotpService
  backupCodeService: Argon2BackupCodeService
  setupTotpUseCase: SetupTotpUseCase
  verifyTotpSetupUseCase: VerifyTotpSetupUseCase
  validateTotpUseCase: ValidateTotpUseCase
  generateBackupCodesUseCase: GenerateBackupCodesUseCase
  useBackupCodeUseCase: UseBackupCodeUseCase
  getMfaStatusUseCase: GetMfaStatusUseCase
  //sessions
  ssoSessionRepository: SupabaseSsoSessionRepository
  sloFanoutService: HttpSloFanoutService
  createSsoSessionUseCase: CreateSsoSessionUseCase
  addParticipatingAppUseCase: AddParticipatingAppUseCase
  getUserSessionsUseCase: GetUserSessionsUseCase
  revokeSessionUseCase: RevokeSessionUseCase
  revokeAllSessionsUseCase: RevokeAllSessionsUseCase
  //Audit
  auditRepository: MongoAuditRepository
  auditLogger: BullmqAuditLogger
  auditWorker: AuditWorker
  queryAuditEventsUseCase: QueryAuditEventsUseCase
  getAuditEventUseCase: GetAuditEventUseCase
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

  container.register({
    jwtAssertionVerifier:      asClass(JoseJwtAssertionVerifier).singleton(),
    accessTokenIssuer:         asClass(JoseAccessTokenIssuer).singleton(),
    certThumbprintExtractor:   asClass(ForgeCertThumbprintExtractor).singleton(),
    handleJwtAssertionUseCase: asClass(HandleJwtAssertionUseCase).scoped(),
    handleMtlsTokenUseCase:    asClass(HandleMtlsTokenUseCase).scoped(),
  })

  container.register({
    mfaRepository:             asClass(SupabaseMfaRepository).scoped(),
    totpService:               asClass(OtplibTotpService).singleton(),
    backupCodeService:         asClass(Argon2BackupCodeService).singleton(),
    setupTotpUseCase:          asClass(SetupTotpUseCase).scoped(),
    verifyTotpSetupUseCase:    asClass(VerifyTotpSetupUseCase).scoped(),
    validateTotpUseCase:       asClass(ValidateTotpUseCase).scoped(),
    generateBackupCodesUseCase: asClass(GenerateBackupCodesUseCase).scoped(),
    useBackupCodeUseCase:      asClass(UseBackupCodeUseCase).scoped(),
    getMfaStatusUseCase:       asClass(GetMfaStatusUseCase).scoped(),
  })

  container.register({
    ssoSessionRepository:      asClass(SupabaseSsoSessionRepository).scoped(),
    sloFanoutService:          asClass(HttpSloFanoutService).scoped(),
    createSsoSessionUseCase:   asClass(CreateSsoSessionUseCase).scoped(),
    addParticipatingAppUseCase: asClass(AddParticipatingAppUseCase).scoped(),
    getUserSessionsUseCase:    asClass(GetUserSessionsUseCase).scoped(),
    revokeSessionUseCase:      asClass(RevokeSessionUseCase).scoped(),
    revokeAllSessionsUseCase:  asClass(RevokeAllSessionsUseCase).scoped(),
  })

  container.register({
    auditRepository:          asClass(MongoAuditRepository).singleton(),
    auditLogger:              asClass(BullmqAuditLogger).singleton(),
    auditWorker:              asClass(AuditWorker).singleton(),
    queryAuditEventsUseCase:  asClass(QueryAuditEventsUseCase).scoped(),
    getAuditEventUseCase:     asClass(GetAuditEventUseCase).scoped(),
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