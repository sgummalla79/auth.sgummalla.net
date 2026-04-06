import { randomBytes } from 'crypto'
import { ok, err } from '../../../../shared/result/Result.js'
import type { Result } from '../../../../shared/result/Result.js'
import type { AppError } from '../../../../shared/errors/AppError.js'
import { NotFoundError } from '../../../../shared/errors/AppError.js'
import type { Logger } from '../../../../shared/logger/logger.js'
import type { KeyAlgorithm } from '../../../../database/index.js'
import type { SigningKey } from '../../domain/SigningKey.js'
import type { ISigningKeyRepository } from '../ports/ISigningKeyRepository.js'
import type { IKeyEncryptionService } from '../ports/IKeyEncryptionService.js'
import type { IKeyGenerationService } from '../ports/IKeyGenerationService.js'
import type { IKeyCache } from '../ports/IKeyCache.js'

export interface RotateSigningKeyCmd {
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

export class RotateSigningKeyUseCase {
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

  async execute(cmd: RotateSigningKeyCmd = {}): Promise<Result<SigningKey, AppError>> {
    const algorithm = cmd.algorithm ?? 'RS256'
    const expiresInDays = cmd.expiresInDays ?? 90

    const currentResult = await this.repo.findActiveSigningKey()
    if (currentResult.isErr()) {
      return err(new NotFoundError('No active signing key to rotate. Generate one first.'))
    }

    const currentKey = currentResult.value
    this.logger.info({ outgoingKid: currentKey.kid }, 'Rotating signing key')

    const keyPairResult = this.generation.generateKeyPair(algorithm)
    if (keyPairResult.isErr()) return err(keyPairResult.error)

    const encryptResult = this.encryption.encrypt(keyPairResult.value.privateKeyPem)
    if (encryptResult.isErr()) return err(encryptResult.error)

    const kid = `key_${randomBytes(8).toString('hex')}`
    const expiresAt = new Date()
    expiresAt.setDate(expiresAt.getDate() + expiresInDays)

    const retireResult = await this.repo.updateStatus(currentKey.kid, 'retired')
    if (retireResult.isErr()) return err(retireResult.error)

    const saveResult = await this.repo.save({
      kid, algorithm, use: 'sig', status: 'active',
      publicKeyPem: keyPairResult.value.publicKeyPem,
      encryptedPrivateKey: encryptResult.value.ciphertext,
      encryptionIv: encryptResult.value.iv,
      expiresAt,
    })
    if (saveResult.isErr()) return err(saveResult.error)

    await this.cache.invalidate()

    this.logger.info({ incomingKid: kid, outgoingKid: currentKey.kid }, 'Key rotated')
    return ok(saveResult.value)
  }
}