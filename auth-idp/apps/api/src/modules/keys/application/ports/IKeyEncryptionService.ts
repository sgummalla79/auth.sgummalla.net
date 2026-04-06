import type { Result } from '../../../../shared/result/Result.js'
import type { InternalError } from '../../../../shared/errors/AppError.js'

export interface IKeyEncryptionService {
  encrypt(plaintext: string): Result<EncryptedPayload, InternalError>
  decrypt(ciphertext: string, iv: string): Result<string, InternalError>
}

export interface EncryptedPayload {
  ciphertext: string
  iv: string
}