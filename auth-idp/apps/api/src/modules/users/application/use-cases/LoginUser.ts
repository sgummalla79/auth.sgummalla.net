import { z } from 'zod'
import { ok, err } from '../../../../shared/result/Result.js'
import type { Result } from '../../../../shared/result/Result.js'
import type { AppError } from '../../../../shared/errors/AppError.js'
import { ValidationError, UnauthorizedError } from '../../../../shared/errors/AppError.js'
import type { Logger } from '../../../../shared/logger/logger.js'
import type { IUserRepository } from '../ports/IUserRepository.js'
import type { IHashService } from '../ports/IHashService.js'
import type { ISessionStore } from '../ports/ISessionStore.js'
import type { IAuditLogger } from '../../../audit/application/ports/IAuditLogger.js'

const MAX_FAILED_ATTEMPTS = 5
const LOCKOUT_MINUTES = 15
const SESSION_TTL_SECONDS = 60 * 60 * 8

const LoginSchema = z.object({
  email: z.string().email().toLowerCase(),
  password: z.string().min(1),
})

export type LoginCmd = z.infer<typeof LoginSchema>

export interface LoginResult {
  sessionToken: string; userId: string; email: string; expiresAt: Date
}

interface Deps {
  userRepository: IUserRepository
  hashService: IHashService
  sessionStore: ISessionStore
  auditLogger: IAuditLogger
  logger: Logger
}

export class LoginUserUseCase {
  private readonly repo: IUserRepository
  private readonly hash: IHashService
  private readonly sessions: ISessionStore
  private readonly logger: Logger
  private readonly auditLogger: IAuditLogger

  constructor({ userRepository, hashService, sessionStore, logger, auditLogger }: Deps) {
    this.repo = userRepository
    this.hash = hashService
    this.sessions = sessionStore
    this.logger = logger
    this.auditLogger = auditLogger
  }

  async execute(cmd: unknown): Promise<Result<LoginResult, AppError>> {
    const parsed = LoginSchema.safeParse(cmd)
    if (!parsed.success) return err(new ValidationError('Invalid credentials'))

    const { email, password } = parsed.data

    const userResult = await this.repo.findByEmail(email)
    if (userResult.isErr()) {
      // Timing-safe: hash even for unknown users to prevent enumeration
      await this.hash.verify('$argon2id$v=19$m=65536,t=3,p=4$dummy$dummy', password)
      return err(new UnauthorizedError('Invalid email or password'))
    }

    const user = userResult.value

    if (user.isLocked()) {
      return err(new UnauthorizedError(
        `Account is temporarily locked. Try again after ${user.lockedUntil!.toISOString()}`,
      ))
    }

    if (!user.canLogin()) return err(new UnauthorizedError('Account is not active'))
    if (!user.passwordHash) return err(new UnauthorizedError('Invalid email or password'))

    const verifyResult = await this.hash.verify(user.passwordHash, password)
    if (verifyResult.isErr()) return err(verifyResult.error)

    if (!verifyResult.value) {
      await this.repo.incrementFailedLogins(user.id)
      if (user.failedLoginAttempts + 1 >= MAX_FAILED_ATTEMPTS) {
        const lockUntil = new Date()
        lockUntil.setMinutes(lockUntil.getMinutes() + LOCKOUT_MINUTES)
        await this.repo.lockAccount(user.id, lockUntil)
      }

      void this.auditLogger.log({
        type: 'user.login.failure',
        outcome: 'failure',
        metadata: { email, reason: 'invalid_credentials' },
      })

      return err(new UnauthorizedError('Invalid email or password'))
    }

    await this.repo.resetFailedLogins(user.id)
    await this.repo.updateLastLogin(user.id)

    const sessionResult = await this.sessions.create(user.id, email, SESSION_TTL_SECONDS)
    if (sessionResult.isErr()) return err(sessionResult.error)

    const expiresAt = new Date(Date.now() + SESSION_TTL_SECONDS * 1000)

    this.logger.info({ userId: user.id, email }, 'User logged in')

    // Fire-and-forget — don't await, don't block login
    void this.auditLogger.log({
      type: 'user.login.success',
      outcome: 'success',
      userId: user.id,
      metadata: { email },
    })

    return ok({ sessionToken: sessionResult.value, userId: user.id, email, expiresAt })
  }
}