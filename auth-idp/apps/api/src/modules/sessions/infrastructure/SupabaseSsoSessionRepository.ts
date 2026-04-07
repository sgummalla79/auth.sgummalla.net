import { eq, and, gt } from 'drizzle-orm'
import { ok, err } from '../../../shared/result/Result.js'
import type { Result } from '../../../shared/result/Result.js'
import { DatabaseError, NotFoundError } from '../../../shared/errors/AppError.js'
import type { DrizzleClient } from '../../../infrastructure/database/postgres.client.js'
import { ssoSessions } from '../../../database/index.js'
import { SsoSession } from '../domain/SsoSession.js'
import type { ParticipatingApp } from '../domain/SsoSession.js'
import type {
  ISsoSessionRepository,
  CreateSsoSessionInput,
} from '../application/ports/ISsoSessionRepository.js'

interface Deps {
  db: DrizzleClient
}

export class SupabaseSsoSessionRepository implements ISsoSessionRepository {
  private readonly db: DrizzleClient

  constructor({ db }: Deps) {
    this.db = db
  }

  async create(input: CreateSsoSessionInput): Promise<Result<SsoSession, DatabaseError>> {
    try {
      const expiresAt = new Date(Date.now() + (input.expiresInSeconds ?? 86400) * 1000)
      const row = await this.db
        .insert(ssoSessions)
        .values({
          userId: input.userId,
          sessionToken: input.idpSessionToken,
          participatingAppIds: [],
          expiresAt,
        })
        .returning()
        .then(rows => rows[0]!)

      return ok(this.toDomain(row))
    } catch (e) {
      return err(new DatabaseError('Failed to create SSO session', e))
    }
  }

  async findById(id: string): Promise<Result<SsoSession, NotFoundError | DatabaseError>> {
    try {
      const row = await this.db
        .select()
        .from(ssoSessions)
        .where(eq(ssoSessions.id, id))
        .limit(1)
        .then(rows => rows[0])

      if (!row) return err(new NotFoundError(`SSO session not found: ${id}`))
      return ok(this.toDomain(row))
    } catch (e) {
      return err(new DatabaseError('Failed to find SSO session', e))
    }
  }

  async findByToken(token: string): Promise<Result<SsoSession, NotFoundError | DatabaseError>> {
    try {
      const row = await this.db
        .select()
        .from(ssoSessions)
        .where(eq(ssoSessions.sessionToken, token))
        .limit(1)
        .then(rows => rows[0])

      if (!row) return err(new NotFoundError('SSO session not found for token'))
      return ok(this.toDomain(row))
    } catch (e) {
      return err(new DatabaseError('Failed to find SSO session by token', e))
    }
  }

  async findActiveByUserId(userId: string): Promise<Result<SsoSession[], DatabaseError>> {
    try {
      const now = new Date()
      const rows = await this.db
        .select()
        .from(ssoSessions)
        .where(
          and(
            eq(ssoSessions.userId, userId),
            eq(ssoSessions.status, 'active'),
            gt(ssoSessions.expiresAt, now),
          ),
        )

      return ok(rows.map(r => this.toDomain(r)))
    } catch (e) {
      console.error('findActiveByUserId raw error:', e)
      return err(new DatabaseError('Failed to find active SSO sessions', e))
    }
  }

  async addParticipatingApp(sessionId: string, app: ParticipatingApp): Promise<Result<void, DatabaseError>> {
    try {
      const session = await this.db
        .select({ ids: ssoSessions.participatingAppIds })
        .from(ssoSessions)
        .where(eq(ssoSessions.id, sessionId))
        .limit(1)
        .then(rows => rows[0])

      if (!session) return err(new DatabaseError('Session not found when adding app'))

      const current = session.ids ?? []
      if (current.includes(app.appId)) return ok(undefined)

      await this.db
        .update(ssoSessions)
        .set({ participatingAppIds: [...current, app.appId] })
        .where(eq(ssoSessions.id, sessionId))

      return ok(undefined)
    } catch (e) {
      return err(new DatabaseError('Failed to add participating app to session', e))
    }
  }

  async revoke(sessionId: string): Promise<Result<void, DatabaseError>> {
    try {
      await this.db
        .update(ssoSessions)
        .set({ status: 'revoked' })
        .where(eq(ssoSessions.id, sessionId))
      return ok(undefined)
    } catch (e) {
      return err(new DatabaseError('Failed to revoke SSO session', e))
    }
  }

  async revokeAllForUser(userId: string): Promise<Result<void, DatabaseError>> {
    try {
      await this.db
        .update(ssoSessions)
        .set({ status: 'revoked' })
        .where(
          and(
            eq(ssoSessions.userId, userId),
            eq(ssoSessions.status, 'active'),
          ),
        )
      return ok(undefined)
    } catch (e) {
      console.error('revokeAllForUser raw error:', e)
      return err(new DatabaseError('Failed to revoke all SSO sessions for user', e))
    }
  }

  private toDomain(row: typeof ssoSessions.$inferSelect): SsoSession {
    // participatingAppIds is a flat string[] in the schema — wrap as ParticipatingApp[]
    // protocol is unknown from a flat ID list; default to 'saml' for SLO fanout
    const participatingApps: ParticipatingApp[] = (row.participatingAppIds ?? []).map(appId => ({
      appId,
      protocol: 'saml' as const,
    }))

    return new SsoSession(
      row.id,
      row.userId,
      row.sessionToken,
      participatingApps,
      row.createdAt,
      row.expiresAt,
      row.status === 'revoked' ? row.lastActiveAt : null,
    )
  }
}