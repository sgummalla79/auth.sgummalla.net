import type { Result } from '../../../../shared/result/Result.js'
import type { AppError } from '../../../../shared/errors/AppError.js'
import type { Organization } from '../../domain/Organization.js'
import type { Role } from '../../domain/Role.js'

export interface CreateOrganizationInput {
  id: string
  name: string
  slug: string
  logoUrl?: string
}

export interface CreateRoleInput {
  id: string
  organizationId: string
  name: string
  description?: string
  isSystem: boolean
}

export interface AssignRoleInput {
  id: string
  userId: string
  roleId: string
  assignedBy: string
}

export interface UpdateOrganizationInput {
  status?: 'active' | 'suspended'
  name?: string
  logoUrl?: string
}

export interface IOrganizationRepository {
  save(input: CreateOrganizationInput): Promise<Result<Organization, AppError>>
  findById(id: string): Promise<Result<Organization, AppError>>
  findBySlug(slug: string): Promise<Result<Organization, AppError>>
  list(): Promise<Result<Organization[], AppError>>
  update(id: string, input: UpdateOrganizationInput): Promise<Result<Organization, AppError>>

  saveRole(input: CreateRoleInput): Promise<Result<Role, AppError>>
  findRoleByName(organizationId: string, name: string): Promise<Result<Role, AppError>>
  listRoles(organizationId: string): Promise<Result<Role[], AppError>>

  assignRole(input: AssignRoleInput): Promise<Result<void, AppError>>
}