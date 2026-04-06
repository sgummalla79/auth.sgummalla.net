import argon2 from 'argon2'
import { ok, err } from '../../../shared/result/Result.js'
import type { Result } from '../../../shared/result/Result.js'
import { InternalError } from '../../../shared/errors/AppError.js'
import type { IHashService } from '../application/ports/IHashService.js'

export class Argon2HashService implements IHashService {
  private readonly options = {
    type: argon2.argon2id,
    memoryCost: 65536,
    timeCost: 3,
    parallelism: 4,
  }

  async hash(plaintext: string): Promise<Result<string, InternalError>> {
    try {
      return ok(await argon2.hash(plaintext, this.options))
    } catch (error) {
      return err(new InternalError('Password hashing failed', error))
    }
  }

  async verify(hash: string, plaintext: string): Promise<Result<boolean, InternalError>> {
    try {
      return ok(await argon2.verify(hash, plaintext))
    } catch (error) {
      if (error instanceof Error && error.message.includes('pchstr')) return ok(false)
      return err(new InternalError('Password verification failed', error))
    }
  }
}