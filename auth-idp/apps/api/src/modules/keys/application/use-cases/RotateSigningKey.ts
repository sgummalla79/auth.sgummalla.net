import { randomBytes } from 'crypto'
import { z } from 'zod'
import { ok, err, isErr } from '../../../../shared/result/Result.js'
import type { Result } from '../../../../shared/result/Result.js'
import type { AppError } from '../../../../shared/errors/AppError.js'
import { ValidationError, NotFoundError, InternalError } from '../../../../shared/errors/AppError.js'
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

export type RotateSigningKeyInput = z.infer<typeof InputSchema>

type Deps = {
  signingKeyRepository: ISigningKeyRepository
  keyGenerationService: IKeyGenerationService
  keyEncryptionService: IKeyEncryptionService
  keyCache:             IKeyCache
  logger:               Logger
}

export class RotateSigningKeyUseCase {
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

  async execute(input: RotateSigningKeyInput): Promise<Result<SigningKey, AppError>> {
    const parsed = InputSchema.safeParse(input)
    if (!parsed.success) {
      return err(new ValidationError('Invalid rotation input', parsed.error.flatten().fieldErrors as Record<string, string[]>))
    }

    const { organizationId, algorithm, expiresInDays } = parsed.data

    // 1. Find current active key
    const currentResult = await this.repo.findActiveKey(organizationId)
    if (isErr(currentResult)) {
      return err(new NotFoundError(`No active signing key found for org ${organizationId}`))
    }
    const currentKey = currentResult.value

    // 2. Generate new keypair
    const keyPairResult = await this.keygen.generateKeyPair(algorithm as KeyAlgorithm)
    if (isErr(keyPairResult)) return err(new InternalError('Key generation failed'))

    const encryptResult = await this.encrypt.encrypt(keyPairResult.value.privateKeyPem)
    if (isErr(encryptResult)) return err(new InternalError('Key encryption failed'))

    // 3. Retire old key
    const retireResult = await this.repo.updateStatus(organizationId, currentKey.kid, 'retired')
    if (isErr(retireResult)) return err(retireResult.error)

    // 4. Save new key
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
    this.logger.info({ incomingKid: kid, outgoingKid: currentKey.kid, organizationId }, 'Key rotated')

    return ok(saveResult.value)
  }
}