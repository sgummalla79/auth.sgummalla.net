import type { Result } from '../../../../shared/result/Result.js'
import type { DatabaseError, NotFoundError, ConflictError } from '../../../../shared/errors/AppError.js'
import type { User } from '../../domain/User.js'
import type { UserProfile } from '../../domain/UserProfile.js'

export interface CreateUserInput {
  organizationId: string
  email: string
  passwordHash: string
}

export interface CreateProfileInput {
  userId: string
  givenName?: string
  familyName?: string
  displayName?: string
}

export interface UpdateProfileInput {
  givenName?: string
  familyName?: string
  displayName?: string
  pictureUrl?: string
  locale?: string
  zoneinfo?: string
}

export interface IUserRepository {
  save(input: CreateUserInput): Promise<Result<User, DatabaseError | ConflictError>>
  findById(id: string): Promise<Result<User, NotFoundError | DatabaseError>>
  findByEmail(email: string): Promise<Result<User, NotFoundError | DatabaseError>>
  findByEmailAndOrg(email: string, organizationId: string): Promise<Result<User, NotFoundError | DatabaseError>>
  listByOrg(organizationId: string): Promise<Result<User[], DatabaseError>>
  deleteFromOrg(userId: string, organizationId: string): Promise<Result<void, DatabaseError>>
  saveProfile(input: CreateProfileInput): Promise<Result<UserProfile, DatabaseError>>
  findProfile(userId: string): Promise<Result<UserProfile, NotFoundError | DatabaseError>>
  updateProfile(userId: string, input: UpdateProfileInput): Promise<Result<UserProfile, DatabaseError>>
  incrementFailedLogins(userId: string): Promise<Result<void, DatabaseError>>
  lockAccount(userId: string, until: Date): Promise<Result<void, DatabaseError>>
  resetFailedLogins(userId: string): Promise<Result<void, DatabaseError>>
  updateLastLogin(userId: string): Promise<Result<void, DatabaseError>>
  verifyEmail(userId: string): Promise<Result<void, DatabaseError>>
}