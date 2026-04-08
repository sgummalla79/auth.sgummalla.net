import type { Result } from '../../../../shared/result/Result.js'
import type { DatabaseError, NotFoundError } from '../../../../shared/errors/AppError.js'
import type { SsoSession, ParticipatingApp } from '../../domain/SsoSession.js'

export interface CreateSsoSessionInput {
  userId: string
  idpSessionToken: string
  expiresInSeconds?: number
  organizationId?:  string   // ← ADD — placeholder until M19
  ipAddress?:       string   // ← ADD
  userAgent?:       string   // ← ADD
}

export interface ISsoSessionRepository {
  create(input: CreateSsoSessionInput): Promise<Result<SsoSession, DatabaseError>>

  findById(id: string): Promise<Result<SsoSession, NotFoundError | DatabaseError>>

  findByToken(token: string): Promise<Result<SsoSession, NotFoundError | DatabaseError>>

  findActiveByUserId(userId: string): Promise<Result<SsoSession[], DatabaseError>>

  addParticipatingApp(
    sessionId: string,
    app: ParticipatingApp,
  ): Promise<Result<void, DatabaseError>>

  revoke(sessionId: string): Promise<Result<void, DatabaseError>>

  revokeAllForUser(userId: string): Promise<Result<void, DatabaseError>>
}