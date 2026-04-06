import { z } from 'zod'
import { ok, err } from '../../../../shared/result/Result.js'
import type { Result } from '../../../../shared/result/Result.js'
import type { AppError } from '../../../../shared/errors/AppError.js'
import { ValidationError } from '../../../../shared/errors/AppError.js'
import type { Logger } from '../../../../shared/logger/logger.js'
import type { User } from '../domain/User.js'
import type { UserProfile } from '../domain/UserProfile.js'
import type { IUserRepository } from '../ports/IUserRepository.js'

interface GetDeps { userRepository: IUserRepository; logger: Logger }

export interface GetUserProfileResult { user: User; profile: UserProfile }

export class GetUserProfileUseCase {
  private readonly repo: IUserRepository
  private readonly logger: Logger
  constructor({ userRepository, logger }: GetDeps) { this.repo = userRepository; this.logger = logger }

  async execute(userId: string): Promise<Result<GetUserProfileResult, AppError>> {
    const [userResult, profileResult] = await Promise.all([
      this.repo.findById(userId),
      this.repo.findProfile(userId),
    ])
    if (userResult.isErr()) return err(userResult.error)
    if (profileResult.isErr()) return err(profileResult.error)
    return ok({ user: userResult.value, profile: profileResult.value })
  }
}

const UpdateProfileSchema = z.object({
  givenName: z.string().min(1).max(100).optional(),
  familyName: z.string().min(1).max(100).optional(),
  displayName: z.string().min(1).max(150).optional(),
  pictureUrl: z.string().url().optional(),
  locale: z.string().min(2).max(10).optional(),
  zoneinfo: z.string().min(1).max(50).optional(),
})

interface UpdateDeps { userRepository: IUserRepository; logger: Logger }

export class UpdateUserProfileUseCase {
  private readonly repo: IUserRepository
  private readonly logger: Logger
  constructor({ userRepository, logger }: UpdateDeps) { this.repo = userRepository; this.logger = logger }

  async execute(userId: string, cmd: unknown): Promise<Result<UserProfile, AppError>> {
    const parsed = UpdateProfileSchema.safeParse(cmd)
    if (!parsed.success) {
      const fields: Record<string, string[]> = {}
      for (const issue of parsed.error.issues) {
        const key = issue.path.join('.') || 'unknown'
        if (!fields[key]) fields[key] = []
        fields[key]!.push(issue.message)
      }
      return err(new ValidationError('Invalid profile data', fields))
    }
    const result = await this.repo.updateProfile(userId, parsed.data)
    if (result.isErr()) return err(result.error)
    this.logger.info({ userId }, 'Profile updated')
    return ok(result.value)
  }
}