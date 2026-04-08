import { randomBytes } from 'crypto'
import { z } from 'zod'
import { ok, err, isErr } from '../../../../shared/result/Result.js'
import type { Result } from '../../../../shared/result/Result.js'
import type { AppError } from '../../../../shared/errors/AppError.js'
import { ValidationError, InternalError } from '../../../../shared/errors/AppError.js'
import type { Logger } from '../../../../shared/logger/logger.js'
import type { KeyAlgorithm } from '../../../../shared/types/domain-types.js'
import type { SigningKey } from '../../domain/SigningKey.js'
import type { ISigningKeyRepository } from '../ports/ISigningKeyRepository.js'
import type { IKeyGenerationService } from '../ports/IKeyGenerationService.js'
import type { IKeyEncryptionService } from '../ports/IKeyEncryptionService.js'
import type { IKeyCache } from '../ports/IKeyCache.js'

const InputSchema = z.object({
  organizationId: z.string().uuid(),
  algorithm:      z.enum(['RS256', 'RS384', 'RS512', 'ES256', 'ES384', 'ES512']).default('RS256'),
  expiresInDays:  z.number().int().min(1).max(3650).default(365),
})

export type GenerateSigningKeyInput = z.infer<typeof InputSchema>

type Deps = {
  signingKeyRepository: ISigningKeyRepository
  keyGenerationService: IKeyGenerationService
  keyEncryptionService: IKeyEncryptionService
  keyCache:             IKeyCache
  logger:               Logger
}

export class GenerateSigningKeyUseCase {
  private readonly repo:    ISigningKeyRepository
  private readonly keygen:  IKeyGenerationService
  private readonly encrypt: IKeyEncryptionService
  private readonly cache:   IKeyCache
  private readonly logger:  Logger

  constructor(deps: Deps) {
    this.repo    = deps.signingKeyRepository
    this.keygen  = deps.keyGenerationService
    this.encrypt = deps.keyEncryptionService
    this.cache   = deps.keyCache
    this.logger  = deps.logger
  }

  async execute(input: GenerateSigningKeyInput): Promise<Result<SigningKey, AppError>> {
    const parsed = InputSchema.safeParse(input)
    if (!parsed.success) {
      return err(new ValidationError('Invalid key generation input', parsed.error.flatten().fieldErrors as Record<string, string[]>))
    }

    const { organizationId, algorithm, expiresInDays } = parsed.data

    const keyPairResult = await this.keygen.generateKeyPair(algorithm as KeyAlgorithm)
    if (isErr(keyPairResult)) return err(new InternalError('Key generation failed'))

    const encryptResult = await this.encrypt.encrypt(keyPairResult.value.privateKeyPem)
    if (isErr(encryptResult)) return err(new InternalError('Key encryption failed'))

    const kid = `key_${randomBytes(8).toString('hex')}`
    const expiresAt = new Date()
    expiresAt.setDate(expiresAt.getDate() + expiresInDays)

    const saveResult = await this.repo.save({
      kid,
      organizationId,
      algorithm,
      status:              'active',
      publicKeyPem:        keyPairResult.value.publicKeyPem,
      publicKeyJwk:        '',
      encryptedPrivateKey: encryptResult.value.ciphertext,
      encryptionIv:        encryptResult.value.iv,
      expiresAt,
    })
    if (isErr(saveResult)) return err(saveResult.error)

    await this.cache.invalidate(organizationId)
    this.logger.info({ kid, organizationId, expiresAt }, 'Signing key generated')

    return ok(saveResult.value)
  }
}