import { z } from 'zod'
import { ok, err } from '../../../../shared/result/Result.js'
import type { Result } from '../../../../shared/result/Result.js'
import type { AppError } from '../../../../shared/errors/AppError.js'
import { ValidationError, ConflictError } from '../../../../shared/errors/AppError.js'
import type { Logger } from '../../../../shared/logger/logger.js'
import type { User } from '../domain/User.js'
import type { IUserRepository } from '../ports/IUserRepository.js'
import type { IHashService } from '../ports/IHashService.js'

const PasswordSchema = z
  .string()
  .min(8, 'Password must be at least 8 characters')
  .max(128, 'Password must be at most 128 characters')
  .regex(/[A-Z]/, 'Password must contain at least one uppercase letter')
  .regex(/[a-z]/, 'Password must contain at least one lowercase letter')
  .regex(/[0-9]/, 'Password must contain at least one number')

const RegisterUserSchema = z.object({
  email: z.string().email('Invalid email address').toLowerCase(),
  password: PasswordSchema,
  givenName: z.string().min(1).max(100).optional(),
  familyName: z.string().min(1).max(100).optional(),
})

export type RegisterUserCmd = z.infer<typeof RegisterUserSchema>
export interface RegisterUserResult { user: User }

interface Deps {
  userRepository: IUserRepository
  hashService: IHashService
  logger: Logger
}

export class RegisterUserUseCase {
  private readonly repo: IUserRepository
  private readonly hash: IHashService
  private readonly logger: Logger

  constructor({ userRepository, hashService, logger }: Deps) {
    this.repo = userRepository
    this.hash = hashService
    this.logger = logger
  }

  async execute(cmd: unknown): Promise<Result<RegisterUserResult, AppError>> {
    const parsed = RegisterUserSchema.safeParse(cmd)
    if (!parsed.success) {
      const fields: Record<string, string[]> = {}
      for (const issue of parsed.error.issues) {
        const key = issue.path.join('.') || 'unknown'
        if (!fields[key]) fields[key] = []
        fields[key]!.push(issue.message)
      }
      return err(new ValidationError('Invalid registration data', fields))
    }

    const { email, password, givenName, familyName } = parsed.data

    this.logger.info({ email }, 'User registration attempt')

    const existing = await this.repo.findByEmail(email)
    if (existing.isOk()) {
      return err(new ConflictError('An account with this email already exists'))
    }

    const hashResult = await this.hash.hash(password)
    if (hashResult.isErr()) return err(hashResult.error)

    const saveResult = await this.repo.save({ email, passwordHash: hashResult.value })
    if (saveResult.isErr()) return err(saveResult.error)

    const user = saveResult.value

    await this.repo.saveProfile({
      userId: user.id,
      givenName,
      familyName,
      displayName: givenName ? `${givenName} ${familyName ?? ''}`.trim() : undefined,
    })

    this.logger.info({ userId: user.id, email }, 'User registered successfully')
    return ok({ user })
  }
}