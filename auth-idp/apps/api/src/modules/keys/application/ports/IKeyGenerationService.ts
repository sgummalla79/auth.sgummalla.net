import type { Result } from '../../../../shared/result/Result.js'
import type { InternalError } from '../../../../shared/errors/AppError.js'
import type { KeyAlgorithm } from '../../../../database/index.js'

export interface IKeyGenerationService {
  generateKeyPair(algorithm: KeyAlgorithm): Result<KeyPair, InternalError>
}

export interface KeyPair {
  publicKeyPem: string
  privateKeyPem: string
}