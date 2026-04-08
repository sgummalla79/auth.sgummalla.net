import { generateKeyPairSync } from 'crypto'
import { ok, err } from '../../../shared/result/Result.js'
import type { Result } from '../../../shared/result/Result.js'
import { InternalError } from '../../../shared/errors/AppError.js'
import type { KeyAlgorithm } from '../../../shared/types/domain-types.js'
import type { IKeyGenerationService, KeyPair } from '../application/ports/IKeyGenerationService.js'

export class NodeCryptoKeyGenerationService implements IKeyGenerationService {
  generateKeyPair(algorithm: KeyAlgorithm): Result<KeyPair, InternalError> {
    try {
      if (algorithm.startsWith('RS')) return this.generateRSA(algorithm)
      if (algorithm.startsWith('ES')) return this.generateEC(algorithm)
      return err(new InternalError(`Unsupported algorithm: ${algorithm}`))
    } catch (error) {
      return err(new InternalError('Key generation failed', error))
    }
  }

  private generateRSA(algorithm: string): Result<KeyPair, InternalError> {
    const modulusLength = algorithm === 'RS512' ? 4096 : 2048
    const { publicKey, privateKey } = generateKeyPairSync('rsa', {
      modulusLength,
      publicKeyEncoding: { type: 'spki', format: 'pem' },
      privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
    })
    return ok({ publicKeyPem: publicKey, privateKeyPem: privateKey })
  }

  private generateEC(algorithm: string): Result<KeyPair, InternalError> {
    const curveMap: Record<string, string> = {
      ES256: 'prime256v1', ES384: 'secp384r1', ES512: 'secp521r1',
    }
    const curve = curveMap[algorithm]
    if (!curve) return err(new InternalError(`Unknown EC algorithm: ${algorithm}`))

    const { publicKey, privateKey } = generateKeyPairSync('ec', {
      namedCurve: curve,
      publicKeyEncoding: { type: 'spki', format: 'pem' },
      privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
    })
    return ok({ publicKeyPem: publicKey, privateKeyPem: privateKey })
  }
}