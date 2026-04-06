import { asClass } from 'awilix'
import type { AppContainer } from '../../shared/container/index.js'
import { Argon2HashService } from './infrastructure/Argon2HashService.js'
import { RedisSessionStore } from './infrastructure/RedisSessionStore.js'
import { SupabaseUserRepository } from './infrastructure/SupabaseUserRepository.js'
import { RegisterUserUseCase } from './application/use-cases/RegisterUser.js'
import { LoginUserUseCase } from './application/use-cases/LoginUser.js'
import { GetUserProfileUseCase, UpdateUserProfileUseCase } from './application/use-cases/UserProfile.js'

export function registerUserModule(container: AppContainer): void {
  container.register({
    hashService: asClass(Argon2HashService).singleton(),
    sessionStore: asClass(RedisSessionStore).singleton(),
    userRepository: asClass(SupabaseUserRepository).singleton(),
    registerUserUseCase: asClass(RegisterUserUseCase).singleton(),
    loginUserUseCase: asClass(LoginUserUseCase).singleton(),
    getUserProfileUseCase: asClass(GetUserProfileUseCase).singleton(),
    updateUserProfileUseCase: asClass(UpdateUserProfileUseCase).singleton(),
  })
}

export { registerUserRoutes } from './interface/UserRoutes.js'