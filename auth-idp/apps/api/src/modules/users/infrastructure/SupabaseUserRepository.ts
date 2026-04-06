import { eq } from 'drizzle-orm'
import { ok, err } from '../../../shared/result/Result.js'
import type { Result } from '../../../shared/result/Result.js'
import { DatabaseError, NotFoundError, ConflictError } from '../../../shared/errors/AppError.js'
import type { Logger } from '../../../shared/logger/logger.js'
import type { DrizzleClient } from '../../../infrastructure/database/postgres.client.js'
import { users, userProfiles } from '../../../database/index.js'
import type { User as UserRow, UserProfile as UserProfileRow } from '../../../database/index.js'
import { User } from '../domain/User.js'
import { UserProfile } from '../domain/UserProfile.js'
import type { IUserRepository, CreateUserInput, CreateProfileInput, UpdateProfileInput } from '../application/ports/IUserRepository.js'

interface Deps { db: DrizzleClient; logger: Logger }

export class SupabaseUserRepository implements IUserRepository {
  private readonly db: DrizzleClient
  private readonly logger: Logger
  constructor({ db, logger }: Deps) { this.db = db; this.logger = logger.child({ repository: 'UserRepository' }) }

  async save(input: CreateUserInput): Promise<Result<User, DatabaseError | ConflictError>> {
    try {
      const rows = await this.db.insert(users).values({
        email: input.email, passwordHash: input.passwordHash, status: 'pending_verification',
      }).returning()
      return ok(this.toDomain(rows[0]!))
    } catch (e: unknown) {
      if (e instanceof Error && e.message.includes('unique')) {
        return err(new ConflictError('Email already registered'))
      }
      return err(new DatabaseError('Failed to create user', e))
    }
  }

  async findById(id: string): Promise<Result<User, NotFoundError | DatabaseError>> {
    try {
      const row = await this.db.query.users.findFirst({ where: eq(users.id, id) })
      if (!row) return err(new NotFoundError(`User not found: ${id}`))
      return ok(this.toDomain(row))
    } catch (e) { return err(new DatabaseError(`Failed to find user: ${id}`, e)) }
  }

  async findByEmail(email: string): Promise<Result<User, NotFoundError | DatabaseError>> {
    try {
      const row = await this.db.query.users.findFirst({ where: eq(users.email, email.toLowerCase()) })
      if (!row) return err(new NotFoundError(`User not found: ${email}`))
      return ok(this.toDomain(row))
    } catch (e) { return err(new DatabaseError('Failed to find user by email', e)) }
  }

  async saveProfile(input: CreateProfileInput): Promise<Result<UserProfile, DatabaseError>> {
    try {
      const rows = await this.db.insert(userProfiles).values({
        userId: input.userId, givenName: input.givenName,
        familyName: input.familyName, displayName: input.displayName,
      }).returning()
      return ok(this.toProfileDomain(rows[0]!))
    } catch (e) { return err(new DatabaseError('Failed to create profile', e)) }
  }

  async findProfile(userId: string): Promise<Result<UserProfile, NotFoundError | DatabaseError>> {
    try {
      const row = await this.db.query.userProfiles.findFirst({ where: eq(userProfiles.userId, userId) })
      if (!row) return err(new NotFoundError(`Profile not found: ${userId}`))
      return ok(this.toProfileDomain(row))
    } catch (e) { return err(new DatabaseError(`Failed to find profile: ${userId}`, e)) }
  }

  async updateProfile(userId: string, input: UpdateProfileInput): Promise<Result<UserProfile, DatabaseError>> {
    try {
      const rows = await this.db.update(userProfiles).set({
        ...(input.givenName !== undefined && { givenName: input.givenName }),
        ...(input.familyName !== undefined && { familyName: input.familyName }),
        ...(input.displayName !== undefined && { displayName: input.displayName }),
        ...(input.pictureUrl !== undefined && { pictureUrl: input.pictureUrl }),
        ...(input.locale !== undefined && { locale: input.locale }),
        ...(input.zoneinfo !== undefined && { zoneinfo: input.zoneinfo }),
      }).where(eq(userProfiles.userId, userId)).returning()
      return ok(this.toProfileDomain(rows[0]!))
    } catch (e) { return err(new DatabaseError(`Failed to update profile: ${userId}`, e)) }
  }

  async incrementFailedLogins(userId: string): Promise<Result<void, DatabaseError>> {
    try {
      const row = await this.db.query.users.findFirst({ where: eq(users.id, userId) })
      const current = parseInt(row?.failedLoginAttempts ?? '0', 10)
      await this.db.update(users).set({ failedLoginAttempts: String(current + 1) }).where(eq(users.id, userId))
      return ok(undefined)
    } catch (e) { return err(new DatabaseError('Failed to increment failed logins', e)) }
  }

  async lockAccount(userId: string, until: Date): Promise<Result<void, DatabaseError>> {
    try {
      await this.db.update(users).set({ lockedUntil: until }).where(eq(users.id, userId))
      return ok(undefined)
    } catch (e) { return err(new DatabaseError('Failed to lock account', e)) }
  }

  async resetFailedLogins(userId: string): Promise<Result<void, DatabaseError>> {
    try {
      await this.db.update(users).set({ failedLoginAttempts: '0', lockedUntil: null }).where(eq(users.id, userId))
      return ok(undefined)
    } catch (e) { return err(new DatabaseError('Failed to reset failed logins', e)) }
  }

  async updateLastLogin(userId: string): Promise<Result<void, DatabaseError>> {
    try {
      await this.db.update(users).set({ lastLoginAt: new Date() }).where(eq(users.id, userId))
      return ok(undefined)
    } catch (e) { return err(new DatabaseError('Failed to update last login', e)) }
  }

  async verifyEmail(userId: string): Promise<Result<void, DatabaseError>> {
    try {
      await this.db.update(users).set({ emailVerified: true, status: 'active' }).where(eq(users.id, userId))
      return ok(undefined)
    } catch (e) { return err(new DatabaseError('Failed to verify email', e)) }
  }

  private toDomain(row: UserRow): User {
    return new User(
      row.id, row.email, row.emailVerified, row.passwordHash, row.status,
      parseInt(row.failedLoginAttempts, 10), row.lockedUntil,
      row.createdAt, row.updatedAt, row.lastLoginAt,
    )
  }

  private toProfileDomain(row: UserProfileRow): UserProfile {
    return new UserProfile(
      row.userId, row.givenName, row.familyName, row.displayName,
      row.pictureUrl, row.locale, row.zoneinfo,
      row.customAttributes as Record<string, unknown>, row.updatedAt,
    )
  }
}