import { importSPKI, exportJWK } from 'jose'
import { ok, err, isErr } from '../../../../shared/result/Result.js'
import type { Result } from '../../../../shared/result/Result.js'
import type { AppError } from '../../../../shared/errors/AppError.js'
import type { Logger } from '../../../../shared/logger/logger.js'
import type { ISigningKeyRepository } from '../ports/ISigningKeyRepository.js'

export interface JwksResponse {
  keys: JwkKey[]
}

export interface JwkKey {
  kty: string
  use: string
  kid: string
  alg: string
  n?: string
  e?: string
  x?: string
  y?: string
  crv?: string
}

type Deps = {
  signingKeyRepository: ISigningKeyRepository
  logger: Logger
}

export class GetJwksUseCase {
  private readonly repo:   ISigningKeyRepository
  private readonly logger: Logger

  constructor(deps: Deps) {
    this.repo   = deps.signingKeyRepository
    this.logger = deps.logger
  }

  async execute(organizationId: string): Promise<Result<JwksResponse, AppError>> {
    const keysResult = await this.repo.findPublicKeys(organizationId)
    if (isErr(keysResult)) return err(keysResult.error)

    const jwkKeys: JwkKey[] = []

    for (const key of keysResult.value) {
      try {
        const publicKey = await importSPKI(key.publicKeyPem, key.algorithm)
        const jwk = await exportJWK(publicKey)
        jwkKeys.push({
          ...jwk,
          use: 'sig',
          kid: key.kid,
          alg: key.algorithm,
        } as JwkKey)
      } catch (e) {
        this.logger.warn({ kid: key.kid, err: e }, 'Failed to export JWK for key — skipping')
      }
    }

    return ok({ keys: jwkKeys })
  }
}