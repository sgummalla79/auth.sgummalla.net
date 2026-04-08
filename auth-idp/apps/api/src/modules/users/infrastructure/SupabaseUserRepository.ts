import { eq, and } from 'drizzle-orm'
import { ok, err } from '../../../shared/result/Result.js'
import type { Result } from '../../../shared/result/Result.js'
import { DatabaseError, NotFoundError, ConflictError } from '../../../shared/errors/AppError.js'
import type { DrizzleClient } from '../../../infrastructure/database/postgres.client.js'
import { users, userProfiles } from './users.schema.js'
import { User } from '../domain/User.js'
import { UserProfile } from '../domain/UserProfile.js'
import type {
  IUserRepository,
  CreateUserInput,
  CreateProfileInput,
  UpdateProfileInput,
} from '../application/ports/IUserRepository.js'

type UserRow    = typeof users.$inferSelect
type ProfileRow = typeof userProfiles.$inferSelect

interface Deps { db: DrizzleClient }

export class SupabaseUserRepository implements IUserRepository {
  private readonly db: DrizzleClient

  constructor({ db }: Deps) {
    this.db = db
  }

  async save(input: CreateUserInput): Promise<Result<User, DatabaseError | ConflictError>> {
    try {
      const rows = await this.db
        .insert(users)
        .values({
          organizationId:      input.organizationId,
          email:               input.email.toLowerCase(),
          passwordHash:        input.passwordHash,
          status:              'active',
          emailVerified:       false,
          failedLoginAttempts: '0',
        })
        .returning()
      return ok(this.toDomain(rows[0]!))
    } catch (e: unknown) {
      if (e instanceof Error && e.message.includes('unique')) {
        return err(new ConflictError('Email already registered in this organization'))
      }
      return err(new DatabaseError('Failed to create user', e))
    }
  }

  async findById(id: string): Promise<Result<User, NotFoundError | DatabaseError>> {
    try {
      const rows = await this.db.select().from(users).where(eq(users.id, id)).limit(1)
      const row = rows[0]
      if (!row) return err(new NotFoundError(`User not found: ${id}`))
      return ok(this.toDomain(row))
    } catch (e) {
      return err(new DatabaseError(`Failed to find user: ${id}`, e))
    }
  }

  async findByEmail(email: string): Promise<Result<User, NotFoundError | DatabaseError>> {
    try {
      const rows = await this.db
        .select().from(users)
        .where(eq(users.email, email.toLowerCase()))
        .limit(1)
      const row = rows[0]
      if (!row) return err(new NotFoundError(`User not found: ${email}`))
      return ok(this.toDomain(row))
    } catch (e) {
      return err(new DatabaseError('Failed to find user by email', e))
    }
  }

  async findByEmailAndOrg(email: string, organizationId: string): Promise<Result<User, NotFoundError | DatabaseError>> {
    try {
      const rows = await this.db
        .select().from(users)
        .where(and(
          eq(users.email, email.toLowerCase()),
          eq(users.organizationId, organizationId),
        ))
        .limit(1)
      const row = rows[0]
      if (!row) return err(new NotFoundError(`User not found: ${email}`))
      return ok(this.toDomain(row))
    } catch (e) {
      return err(new DatabaseError('Failed to find user by email and org', e))
    }
  }

  async listByOrg(organizationId: string): Promise<Result<User[], DatabaseError>> {
    try {
      const rows = await this.db
        .select().from(users)
        .where(eq(users.organizationId, organizationId))
      return ok(rows.map(r => this.toDomain(r)))
    } catch (e) {
      return err(new DatabaseError('Failed to list users', e))
    }
  }

  async deleteFromOrg(userId: string, organizationId: string): Promise<Result<void, DatabaseError>> {
    try {
      await this.db
        .delete(users)
        .where(and(
          eq(users.id, userId),
          eq(users.organizationId, organizationId),
        ))
      return ok(undefined)
    } catch (e) {
      return err(new DatabaseError('Failed to delete user from org', e))
    }
  }

  async saveProfile(input: CreateProfileInput): Promise<Result<UserProfile, DatabaseError>> {
    try {
      const rows = await this.db
        .insert(userProfiles)
        .values({
          userId:      input.userId,
          firstName:   input.givenName ?? null,
          lastName:    input.familyName ?? null,
          displayName: input.displayName ?? null,
        })
        .returning()
      return ok(this.toProfileDomain(rows[0]!))
    } catch (e) {
      return err(new DatabaseError('Failed to create profile', e))
    }
  }

  async findProfile(userId: string): Promise<Result<UserProfile, NotFoundError | DatabaseError>> {
    try {
      const rows = await this.db
        .select().from(userProfiles)
        .where(eq(userProfiles.userId, userId))
        .limit(1)
      const row = rows[0]
      if (!row) return err(new NotFoundError(`Profile not found: ${userId}`))
      return ok(this.toProfileDomain(row))
    } catch (e) {
      return err(new DatabaseError(`Failed to find profile: ${userId}`, e))
    }
  }

  async updateProfile(userId: string, input: UpdateProfileInput): Promise<Result<UserProfile, DatabaseError>> {
    try {
      const rows = await this.db
        .update(userProfiles)
        .set({
          ...(input.givenName !== undefined   && { firstName: input.givenName }),
          ...(input.familyName !== undefined  && { lastName: input.familyName }),
          ...(input.displayName !== undefined && { displayName: input.displayName }),
          ...(input.pictureUrl !== undefined  && { pictureUrl: input.pictureUrl }),
          ...(input.locale !== undefined      && { locale: input.locale }),
          ...(input.zoneinfo !== undefined    && { zoneInfo: input.zoneinfo }),
        })
        .where(eq(userProfiles.userId, userId))
        .returning()
      return ok(this.toProfileDomain(rows[0]!))
    } catch (e) {
      return err(new DatabaseError(`Failed to update profile: ${userId}`, e))
    }
  }

  async incrementFailedLogins(userId: string): Promise<Result<void, DatabaseError>> {
    try {
      const rows = await this.db.select().from(users).where(eq(users.id, userId)).limit(1)
      const current = parseInt(rows[0]?.failedLoginAttempts ?? '0', 10)
      await this.db.update(users)
        .set({ failedLoginAttempts: String(current + 1) })
        .where(eq(users.id, userId))
      return ok(undefined)
    } catch (e) {
      return err(new DatabaseError('Failed to increment failed logins', e))
    }
  }

  async lockAccount(userId: string, until: Date): Promise<Result<void, DatabaseError>> {
    try {
      await this.db.update(users).set({ lockedUntil: until }).where(eq(users.id, userId))
      return ok(undefined)
    } catch (e) {
      return err(new DatabaseError('Failed to lock account', e))
    }
  }

  async resetFailedLogins(userId: string): Promise<Result<void, DatabaseError>> {
    try {
      await this.db.update(users)
        .set({ failedLoginAttempts: '0', lockedUntil: null })
        .where(eq(users.id, userId))
      return ok(undefined)
    } catch (e) {
      return err(new DatabaseError('Failed to reset failed logins', e))
    }
  }

  async updateLastLogin(_userId: string): Promise<Result<void, DatabaseError>> {
    // lastLoginAt not in new schema — no-op
    return ok(undefined)
  }

  async verifyEmail(userId: string): Promise<Result<void, DatabaseError>> {
    try {
      await this.db.update(users)
        .set({ emailVerified: true, status: 'active' })
        .where(eq(users.id, userId))
      return ok(undefined)
    } catch (e) {
      return err(new DatabaseError('Failed to verify email', e))
    }
  }

  // ─── Mappers ────────────────────────────────────────────────────────────────

  private toDomain(row: UserRow): User {
    return new User(
      row.id,
      row.organizationId,   // ← ADD
      row.email,
      row.emailVerified,
      row.passwordHash,
      row.status,
      parseInt(row.failedLoginAttempts, 10),
      row.lockedUntil,
      row.createdAt,
      row.updatedAt,
      null,
    )
  }

  private toProfileDomain(row: ProfileRow): UserProfile {
    return new UserProfile(
      row.userId,
      row.firstName,
      row.lastName,
      row.displayName,
      row.pictureUrl,
      row.locale ?? 'en',
      row.zoneInfo ?? '',
      {},
      row.updatedAt,
    )
  }
}