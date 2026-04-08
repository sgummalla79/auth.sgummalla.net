import { err } from '../../../../shared/result/Result.js'
import type { Result } from '../../../../shared/result/Result.js'
import type { AppError } from '../../../../shared/errors/AppError.js'
import { ValidationError } from '../../../../shared/errors/AppError.js'
import { z } from 'zod'
import type { Logger } from '../../../../shared/logger/logger.js'
import type { IOrganizationRepository } from '../ports/IOrganizationRepository.js'
import type { Organization } from '../../domain/Organization.js'

type Deps = {
  organizationRepository: IOrganizationRepository
  logger: Logger
}

export class GetOrganizationUseCase {
  constructor(private readonly deps: Deps) {}

  async execute(orgId: string): Promise<Result<Organization, AppError>> {
    if (!z.string().uuid().safeParse(orgId).success) {
      return err(new ValidationError('Invalid organization ID'))
    }
    return this.deps.organizationRepository.findById(orgId)
  }
}

export class ListOrganizationsUseCase {
  constructor(private readonly deps: Deps) {}

  async execute(): Promise<Result<Organization[], AppError>> {
    return this.deps.organizationRepository.list()
  }
}

export class UpdateOrganizationUseCase {
  constructor(private readonly deps: Deps) {}

  async execute(orgId: string, input: { status?: 'active' | 'suspended' }): Promise<Result<Organization, AppError>> {
    if (!z.string().uuid().safeParse(orgId).success) {
      return err(new ValidationError('Invalid organization ID'))
    }
    return this.deps.organizationRepository.update(orgId, input)
  }
}