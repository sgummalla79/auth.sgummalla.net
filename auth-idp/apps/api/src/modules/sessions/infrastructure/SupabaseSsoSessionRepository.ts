import { eq, and, gt, sql } from 'drizzle-orm'
import { ok, err } from '../../../shared/result/Result.js'
import type { Result } from '../../../shared/result/Result.js'
import { DatabaseError, NotFoundError } from '../../../shared/errors/AppError.js'
import type { DrizzleClient } from '../../../infrastructure/database/postgres.client.js'
import { ssoSessions } from './sessions.schema.js'
import { SsoSession } from '../domain/SsoSession.js'
import type { ParticipatingApp } from '../domain/SsoSession.js'
import type {
  ISsoSessionRepository,
  CreateSsoSessionInput,
} from '../application/ports/ISsoSessionRepository.js'

type SessionRow = typeof ssoSessions.$inferSelect

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
      const rows = await this.db
        .insert(ssoSessions)
        .values({
          organizationId:      input.organizationId ?? '',   // placeholder until M19
          userId:              input.userId,
          status:              'active',
          ipAddress:           input.ipAddress ?? null,
          userAgent:           input.userAgent ?? null,
          amr:                 sql`'{}'::text[]`,
          participatingAppIds: sql`'{}'::text[]`,
          expiresAt,
        })
        .returning()

      return ok(this.toDomain(rows[0]!))
    } catch (e) {
      return err(new DatabaseError('Failed to create SSO session', e))
    }
  }

  async findById(id: string): Promise<Result<SsoSession, NotFoundError | DatabaseError>> {
    try {
      const rows = await this.db
        .select()
        .from(ssoSessions)
        .where(eq(ssoSessions.id, id))
        .limit(1)

      const row = rows[0]
      if (!row) return err(new NotFoundError(`SSO session not found: ${id}`))
      return ok(this.toDomain(row))
    } catch (e) {
      return err(new DatabaseError('Failed to find SSO session', e))
    }
  }

  async findByToken(_token: string): Promise<Result<SsoSession, NotFoundError | DatabaseError>> {
    // sessionToken was removed from the new schema — sessions are looked up by id
    // This is a no-op placeholder until M19 restructures session lookup
    return err(new NotFoundError('findByToken not supported in new schema — use findById'))
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
      return err(new DatabaseError('Failed to find active SSO sessions', e))
    }
  }

  async addParticipatingApp(sessionId: string, app: ParticipatingApp): Promise<Result<void, DatabaseError>> {
    try {
      const rows = await this.db
        .select({ ids: ssoSessions.participatingAppIds })
        .from(ssoSessions)
        .where(eq(ssoSessions.id, sessionId))
        .limit(1)

      const session = rows[0]
      if (!session) return err(new DatabaseError('Session not found when adding app'))

      const current = session.ids ?? []
      if (current.includes(app.appId)) return ok(undefined)

      await this.db
        .update(ssoSessions)
        .set({ participatingAppIds: sql`${JSON.stringify([...current, app.appId])}::text[]` })
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
        .set({ status: 'revoked', revokedAt: new Date() })
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
        .set({ status: 'revoked', revokedAt: new Date() })
        .where(
          and(
            eq(ssoSessions.userId, userId),
            eq(ssoSessions.status, 'active'),
          ),
        )
      return ok(undefined)
    } catch (e) {
      return err(new DatabaseError('Failed to revoke all SSO sessions for user', e))
    }
  }

  private toDomain(row: SessionRow): SsoSession {
    const participatingApps: ParticipatingApp[] = (row.participatingAppIds ?? []).map((appId: string) => ({
      appId,
      protocol: 'saml' as const,
    }))

    return new SsoSession(
      row.id,
      row.userId,
      row.id,              // sessionToken removed — use id as token until M19
      participatingApps,
      row.createdAt,
      row.expiresAt,
      row.revokedAt ?? null,
    )
  }
}