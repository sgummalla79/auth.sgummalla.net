import { asClass } from 'awilix'
import type { AppContainer } from '../../shared/container/index.js'
import { SupabaseApplicationRepository } from './infrastructure/SupabaseApplicationRepository.js'
import { DefaultSlugGenerator, SecureCredentialGenerator } from './infrastructure/Generators.js'
import { RegisterApplicationUseCase } from './application/use-cases/RegisterApplication.js'
import { GetApplicationUseCase, ListApplicationsUseCase, UpdateApplicationUseCase } from './application/use-cases/ApplicationQueries.js'

export function registerApplicationModule(container: AppContainer): void {
  container.register({
    applicationRepository: asClass(SupabaseApplicationRepository).singleton(),
    slugGenerator: asClass(DefaultSlugGenerator).singleton(),
    credentialGenerator: asClass(SecureCredentialGenerator).singleton(),
    registerApplicationUseCase: asClass(RegisterApplicationUseCase).singleton(),
    getApplicationUseCase: asClass(GetApplicationUseCase).singleton(),
    listApplicationsUseCase: asClass(ListApplicationsUseCase).singleton(),
    updateApplicationUseCase: asClass(UpdateApplicationUseCase).singleton(),
  })
}

export { registerApplicationRoutes } from './interface/ApplicationRoutes.js'