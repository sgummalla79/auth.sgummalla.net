import { randomBytes } from 'crypto'
import { ok, err, isErr, isOk } from '../../../../shared/result/Result.js'
import type { Result } from '../../../../shared/result/Result.js'
import type { AppError } from '../../../../shared/errors/AppError.js'
import { ConflictError } from '../../../../shared/errors/AppError.js'
import type { Logger } from '../../../../shared/logger/logger.js'
import type { KeyAlgorithm } from '../../../../shared/types/domain-types.js'
import type { SigningKey } from '../../domain/SigningKey.js'
import type { ISigningKeyRepository } from '../ports/ISigningKeyRepository.js'
import type { IKeyEncryptionService } from '../ports/IKeyEncryptionService.js'
import type { IKeyGenerationService } from '../ports/IKeyGenerationService.js'
import type { IKeyCache } from '../ports/IKeyCache.js'

export interface GenerateSigningKeyCmd {
  algorithm?: KeyAlgorithm
  expiresInDays?: number
}

interface Deps {
  signingKeyRepository: ISigningKeyRepository
  keyEncryptionService: IKeyEncryptionService
  keyGenerationService: IKeyGenerationService
  keyCache: IKeyCache
  logger: Logger
}

export class GenerateSigningKeyUseCase {
  private readonly repo: ISigningKeyRepository
  private readonly encryption: IKeyEncryptionService
  private readonly generation: IKeyGenerationService
  private readonly cache: IKeyCache
  private readonly logger: Logger

  constructor({ signingKeyRepository, keyEncryptionService, keyGenerationService, keyCache, logger }: Deps) {
    this.repo = signingKeyRepository
    this.encryption = keyEncryptionService
    this.generation = keyGenerationService
    this.cache = keyCache
    this.logger = logger
  }

  async execute(cmd: GenerateSigningKeyCmd = {}): Promise<Result<SigningKey, AppError>> {
    const algorithm = cmd.algorithm ?? 'RS256'
    const expiresInDays = cmd.expiresInDays ?? 90

    this.logger.info({ algorithm }, 'Generating signing key')

    const existing = await this.repo.findActiveSigningKey()
    if (isErr(existing)) {
      return err(new ConflictError(
        'An active signing key already exists. Use /rotate to replace it.',
      ))
    }

    const keyPairResult = this.generation.generateKeyPair(algorithm)
    if (isErr(keyPairResult)) return err(keyPairResult.error)

    const encryptResult = this.encryption.encrypt(keyPairResult.value.privateKeyPem)
    if (isErr(encryptResult)) return err(encryptResult.error)

    const kid = `key_${randomBytes(8).toString('hex')}`
    const expiresAt = new Date()
    expiresAt.setDate(expiresAt.getDate() + expiresInDays)

    const saveResult = await this.repo.save({
      kid,
      algorithm,
      use: 'sig',
      status: 'active',
      publicKeyPem: keyPairResult.value.publicKeyPem,
      encryptedPrivateKey: encryptResult.value.ciphertext,
      encryptionIv: encryptResult.value.iv,
      expiresAt,
    })

    if (isErr(saveResult)) return err(saveResult.error)

    await this.cache.invalidate()

    this.logger.info({ kid, expiresAt }, 'Signing key generated')
    return ok(saveResult.value)
  }
}