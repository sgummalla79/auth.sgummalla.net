import { asClass } from 'awilix'
import type { AppContainer } from '../../shared/container/index.js'
import { NodeCryptoKeyGenerationService } from './infrastructure/NodeCryptoKeyGenerationService.js'
import { AesKeyEncryptionService } from './infrastructure/AesKeyEncryptionService.js'
import { SupabaseSigningKeyRepository } from './infrastructure/SupabaseSigningKeyRepository.js'
import { RedisKeyCache } from './infrastructure/RedisKeyCache.js'
import { GenerateSigningKeyUseCase } from './application/use-cases/GenerateSigningKey.js'
import { RotateSigningKeyUseCase } from './application/use-cases/RotateSigningKey.js'
import { GetJwksUseCase } from './application/use-cases/GetJwks.js'

export function registerKeyModule(container: AppContainer): void {
  container.register({
    keyGenerationService: asClass(NodeCryptoKeyGenerationService).singleton(),
    keyEncryptionService: asClass(AesKeyEncryptionService).singleton(),
    keyCache: asClass(RedisKeyCache).singleton(),
    signingKeyRepository: asClass(SupabaseSigningKeyRepository).singleton(),
    generateSigningKeyUseCase: asClass(GenerateSigningKeyUseCase).singleton(),
    rotateSigningKeyUseCase: asClass(RotateSigningKeyUseCase).singleton(),
    getJwksUseCase: asClass(GetJwksUseCase).singleton(),
  })
}

export { registerKeyRoutes } from './interface/KeyRoutes.js'