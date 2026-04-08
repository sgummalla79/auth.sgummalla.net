import { eq, and } from 'drizzle-orm'
import { ok, err } from '../../../shared/result/Result.js'
import type { Result } from '../../../shared/result/Result.js'
import { DatabaseError, NotFoundError } from '../../../shared/errors/AppError.js'
import type { DrizzleClient } from '../../../infrastructure/database/postgres.client.js'
import { roles, userRoles } from './organizations.schema.js'
import { Role } from '../domain/Role.js'
import type {
  IOrganizationUserRepository,
  CreateRoleInput,
  AssignRoleInput,
} from '../application/ports/IOrganizationUserRepository.js'

type RoleRow     = typeof roles.$inferSelect

interface Deps { db: DrizzleClient }

export class SupabaseOrganizationUserRepository implements IOrganizationUserRepository {
  private readonly db: DrizzleClient

  constructor({ db }: Deps) {
    this.db = db
  }

  async listRoles(organizationId: string): Promise<Result<Role[], DatabaseError>> {
    try {
      const rows = await this.db.select().from(roles)
        .where(eq(roles.organizationId, organizationId))
      return ok(rows.map(r => this.toDomain(r)))
    } catch (e) {
      return err(new DatabaseError('Failed to list roles', e))
    }
  }

  async findRoleById(roleId: string): Promise<Result<Role, NotFoundError | DatabaseError>> {
    try {
      const rows = await this.db.select().from(roles)
        .where(eq(roles.id, roleId)).limit(1)
      const row = rows[0]
      if (!row) return err(new NotFoundError(`Role not found: ${roleId}`))
      return ok(this.toDomain(row))
    } catch (e) {
      return err(new DatabaseError(`Failed to find role: ${roleId}`, e))
    }
  }

  async createRole(input: CreateRoleInput): Promise<Result<Role, DatabaseError>> {
    try {
      const rows = await this.db.insert(roles).values({
        id:             input.id,
        organizationId: input.organizationId,
        name:           input.name,
        description:    input.description ?? null,
        isSystem:       input.isSystem,
      }).returning()
      return ok(this.toDomain(rows[0]!))
    } catch (e) {
      return err(new DatabaseError('Failed to create role', e))
    }
  }

  async deleteRole(roleId: string, organizationId: string): Promise<Result<void, DatabaseError>> {
    try {
      await this.db.delete(roles)
        .where(and(eq(roles.id, roleId), eq(roles.organizationId, organizationId)))
      return ok(undefined)
    } catch (e) {
      return err(new DatabaseError('Failed to delete role', e))
    }
  }

  async assignRole(input: AssignRoleInput): Promise<Result<void, DatabaseError>> {
    try {
      await this.db.insert(userRoles).values({
        id:         input.id,
        userId:     input.userId,
        roleId:     input.roleId,
        assignedBy: input.assignedBy,
      })
      return ok(undefined)
    } catch (e) {
      return err(new DatabaseError('Failed to assign role', e))
    }
  }

  async revokeRole(userId: string, roleId: string): Promise<Result<void, DatabaseError>> {
    try {
      await this.db.delete(userRoles)
        .where(and(eq(userRoles.userId, userId), eq(userRoles.roleId, roleId)))
      return ok(undefined)
    } catch (e) {
      return err(new DatabaseError('Failed to revoke role', e))
    }
  }

  async getUserRoles(userId: string, organizationId: string): Promise<Result<Role[], DatabaseError>> {
    try {
      const rows = await this.db
        .select({ role: roles })
        .from(userRoles)
        .innerJoin(roles, eq(userRoles.roleId, roles.id))
        .where(and(
          eq(userRoles.userId, userId),
          eq(roles.organizationId, organizationId),
        ))
      return ok(rows.map(r => this.toDomain(r.role)))
    } catch (e) {
      return err(new DatabaseError('Failed to get user roles', e))
    }
  }

  async hasRole(userId: string, organizationId: string, roleName: string): Promise<Result<boolean, DatabaseError>> {
    try {
      const rows = await this.db
        .select({ id: userRoles.id })
        .from(userRoles)
        .innerJoin(roles, eq(userRoles.roleId, roles.id))
        .where(and(
          eq(userRoles.userId, userId),
          eq(roles.organizationId, organizationId),
          eq(roles.name, roleName),
        ))
        .limit(1)
      return ok(rows.length > 0)
    } catch (e) {
      return err(new DatabaseError('Failed to check role', e))
    }
  }

  private toDomain(row: RoleRow): Role {
    return new Role(
      row.id,
      row.organizationId,
      row.name,
      row.description,
      row.isSystem,
      row.createdAt,
    )
  }
}