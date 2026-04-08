import { describe, it, expect, vi, beforeEach } from 'vitest'
import { RegisterUserUseCase } from '../../modules/users/application/use-cases/RegisterUser.js'
import { LoginUserUseCase } from '../../modules/users/application/use-cases/LoginUser.js'
import { ok, err, isErr, isOk } from '../../shared/result/Result.js'
import { ConflictError, NotFoundError, UnauthorizedError } from '../../shared/errors/AppError.js'
import { User } from '../../modules/users/domain/User.js'
import pino from 'pino'

const logger = pino({ level: 'silent' })

const mockAuditLogger = { log: vi.fn().mockResolvedValue(undefined) }

function makeUser(): User {
  return new User(
    'user-123', 'test@example.com', false,
    '$argon2id$v=19$m=65536,t=3,p=4$hashedpassword',
    'pending_verification', 0, null, new Date(), new Date(), null,
  )
}

describe('RegisterUserUseCase', () => {
  let mockRepo: any
  let mockHash: any
  let useCase: RegisterUserUseCase

  beforeEach(() => {
    mockRepo = {
      findByEmail: vi.fn().mockResolvedValue(err(new NotFoundError('not found'))),
      save: vi.fn().mockResolvedValue(ok(makeUser())),
      saveProfile: vi.fn().mockResolvedValue(ok({})),
    }
    mockHash = { hash: vi.fn().mockResolvedValue(ok('$argon2id$hashed')) }
    useCase = new RegisterUserUseCase({ userRepository: mockRepo, hashService: mockHash, logger })
  })

  it('registers a new user successfully', async () => {
    const result = await useCase.execute({ email: 'new@example.com', password: 'Password1' })
    expect(isOk(result)).toBe(true)
    expect(mockHash.hash).toHaveBeenCalledWith('Password1')
  })

  it('returns conflict when email already exists', async () => {
    mockRepo.findByEmail.mockResolvedValue(ok(makeUser()))
    const result = await useCase.execute({ email: 'existing@example.com', password: 'Password1' })
    expect(isErr(result)).toBe(true)
    if (isErr(result)) expect(result.error).toBeInstanceOf(ConflictError)
  })

  it('rejects weak passwords', async () => {
    const result = await useCase.execute({ email: 'test@example.com', password: 'weak' })
    expect(isErr(result)).toBe(true)
    if (isErr(result)) expect(result.error.code).toBe('VALIDATION_ERROR')
  })

  it('rejects invalid email', async () => {
    const result = await useCase.execute({ email: 'not-an-email', password: 'Password1' })
    expect(isErr(result)).toBe(true)
    if (isErr(result)) expect(result.error.code).toBe('VALIDATION_ERROR')
  })

  it('lowercases email', async () => {
    await useCase.execute({ email: 'UPPER@EXAMPLE.COM', password: 'Password1' })
    expect(mockRepo.findByEmail).toHaveBeenCalledWith('upper@example.com')
  })
})

describe('LoginUserUseCase', () => {
  let mockRepo: any
  let mockHash: any
  let mockSessions: any
  let useCase: LoginUserUseCase

  beforeEach(() => {
    mockRepo = {
      findByEmail: vi.fn().mockResolvedValue(ok(makeUser())),
      incrementFailedLogins: vi.fn().mockResolvedValue(ok(undefined)),
      lockAccount: vi.fn().mockResolvedValue(ok(undefined)),
      resetFailedLogins: vi.fn().mockResolvedValue(ok(undefined)),
      updateLastLogin: vi.fn().mockResolvedValue(ok(undefined)),
    }
    mockHash = { verify: vi.fn().mockResolvedValue(ok(true)) }
    mockSessions = { create: vi.fn().mockResolvedValue(ok('session-token-abc')) }
    useCase = new LoginUserUseCase({
      userRepository: mockRepo,
      hashService: mockHash,
      sessionStore: mockSessions,
      logger,
      auditLogger: mockAuditLogger,
    })
  })

  it('returns session token on valid credentials', async () => {
    const result = await useCase.execute({ email: 'test@example.com', password: 'Password1' })
    expect(isOk(result)).toBe(true)
    if (isOk(result)) expect(result.value.sessionToken).toBe('session-token-abc')
  })

  it('returns unauthorized on wrong password', async () => {
    mockHash.verify.mockResolvedValue(ok(false))
    const result = await useCase.execute({ email: 'test@example.com', password: 'Wrong1' })
    expect(isErr(result)).toBe(true)
    if (isErr(result)) expect(result.error).toBeInstanceOf(UnauthorizedError)
    expect(mockRepo.incrementFailedLogins).toHaveBeenCalled()
  })

  it('returns unauthorized for unknown email', async () => {
    mockRepo.findByEmail.mockResolvedValue(err(new NotFoundError('not found')))
    const result = await useCase.execute({ email: 'unknown@example.com', password: 'Password1' })
    expect(isErr(result)).toBe(true)
    if (isErr(result)) expect(result.error).toBeInstanceOf(UnauthorizedError)
  })

  it('returns unauthorized for locked account', async () => {
    const lockedUser = new User('user-123', 'test@example.com', false,
      '$argon2id$hashed', 'active', 5, new Date(Date.now() + 60_000),
      new Date(), new Date(), null)
    mockRepo.findByEmail.mockResolvedValue(ok(lockedUser))
    const result = await useCase.execute({ email: 'test@example.com', password: 'Password1' })
    expect(isErr(result)).toBe(true)
    if (isErr(result)) expect(result.error.message).toContain('locked')
  })

  it('locks account after 5 failed attempts', async () => {
    mockHash.verify.mockResolvedValue(ok(false))
    const nearLockUser = new User('user-123', 'test@example.com', false,
      '$argon2id$hashed', 'active', 4, null, new Date(), new Date(), null)
    mockRepo.findByEmail.mockResolvedValue(ok(nearLockUser))
    await useCase.execute({ email: 'test@example.com', password: 'Wrong1' })
    expect(mockRepo.lockAccount).toHaveBeenCalled()
  })

  it('resets failed attempts on success', async () => {
    const result = await useCase.execute({ email: 'test@example.com', password: 'Password1' })
    expect(isOk(result)).toBe(true)
    expect(mockRepo.resetFailedLogins).toHaveBeenCalledWith('user-123')
  })
})