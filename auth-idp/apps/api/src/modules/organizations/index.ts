import { asClass } from 'awilix'
import type { AppContainer } from '../../shared/container/index.js'
import { SupabaseOrganizationRepository } from './infrastructure/SupabaseOrganizationRepository.js'
import { CreateOrganizationUseCase } from './application/use-cases/CreateOrganization.js'
import {
  GetOrganizationUseCase,
  ListOrganizationsUseCase,
  UpdateOrganizationUseCase,
} from './application/use-cases/GetOrganization.js'
import { SupabaseOrganizationUserRepository } from './infrastructure/SupabaseOrganizationUserRepository.js'

export function registerOrganizationModule(container: AppContainer): void {
  container.register({
    // Infrastructure
    organizationRepository: asClass(SupabaseOrganizationRepository).singleton(),

    // Use cases
    createOrganizationUseCase: asClass(CreateOrganizationUseCase).singleton(),
    getOrganizationUseCase: asClass(GetOrganizationUseCase).singleton(),
    listOrganizationsUseCase: asClass(ListOrganizationsUseCase).singleton(),
    updateOrganizationUseCase: asClass(UpdateOrganizationUseCase).singleton(),
    orgUserRepository: asClass(SupabaseOrganizationUserRepository).singleton(),
  })
}

export { registerOrganizationRoutes } from './interface/OrganizationRoutes.js'