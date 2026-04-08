import { exportJWK, importSPKI } from 'jose'
import { ok, err, isErr } from '../../../../shared/result/Result.js'
import type { Result } from '../../../../shared/result/Result.js'
import type { AppError } from '../../../../shared/errors/AppError.js'
import { InternalError } from '../../../../shared/errors/AppError.js'
import type { Logger } from '../../../../shared/logger/logger.js'
import type { ISigningKeyRepository } from '../ports/ISigningKeyRepository.js'
import type { SigningKey } from '../../domain/SigningKey.js'

export interface JwksResponse { keys: JwkKey[] }

export interface JwkKey {
  kty: string; use: string; alg: string; kid: string
  n?: string; e?: string; crv?: string; x?: string; y?: string
}

interface Deps {
  signingKeyRepository: ISigningKeyRepository
  logger: Logger
}

export class GetJwksUseCase {
  private readonly repo: ISigningKeyRepository
  private readonly logger: Logger

  constructor({ signingKeyRepository, logger }: Deps) {
    this.repo = signingKeyRepository
    this.logger = logger
  }

  async execute(): Promise<Result<JwksResponse, AppError>> {
    const keysResult = await this.repo.findPublicKeys()
    if (isErr(keysResult)) return err(keysResult.error)

    const jwkKeys: JwkKey[] = []

    for (const key of keysResult.value) {
      const jwkResult = await this.toJwk(key)
      if (isErr(jwkResult)) {
        this.logger.error({ kid: key.kid, err: jwkResult.error }, 'Failed to convert key to JWK')
        continue
      }
      jwkKeys.push(jwkResult.value)
    }

    return ok({ keys: jwkKeys })
  }

  private async toJwk(key: SigningKey): Promise<Result<JwkKey, InternalError>> {
    try {
      const cryptoKey = await importSPKI(key.publicKeyPem, key.algorithm)
      const jwk = await exportJWK(cryptoKey)
      return ok({ ...jwk, kid: key.kid, use: 'sig', alg: key.algorithm } as JwkKey)
    } catch (error) {
      return err(new InternalError(`Failed to export JWK for kid ${key.kid}`, error))
    }
  }
}