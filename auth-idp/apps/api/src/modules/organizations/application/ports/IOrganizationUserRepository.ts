import type { Result } from '../../../../shared/result/Result.js'
import type { DatabaseError, NotFoundError } from '../../../../shared/errors/AppError.js'
import type { Role } from '../../domain/Role.js'

export interface IOrganizationUserRepository {
  listRoles(organizationId: string): Promise<Result<Role[], DatabaseError>>
  findRoleById(roleId: string): Promise<Result<Role, NotFoundError | DatabaseError>>
  createRole(input: CreateRoleInput): Promise<Result<Role, DatabaseError>>
  deleteRole(roleId: string, organizationId: string): Promise<Result<void, DatabaseError>>
  assignRole(input: AssignRoleInput): Promise<Result<void, DatabaseError>>
  revokeRole(userId: string, roleId: string): Promise<Result<void, DatabaseError>>
  getUserRoles(userId: string, organizationId: string): Promise<Result<Role[], DatabaseError>>
  hasRole(userId: string, organizationId: string, roleName: string): Promise<Result<boolean, DatabaseError>>
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