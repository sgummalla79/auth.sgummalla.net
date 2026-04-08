import { eq, and } from 'drizzle-orm'
import { ok, err, fromPromise } from '../../../shared/result/Result.js'
import type { Result } from '../../../shared/result/Result.js'
import { NotFoundError, InternalError } from '../../../shared/errors/AppError.js'
import type { AppError } from '../../../shared/errors/AppError.js'
import type { DrizzleClient } from '../../../infrastructure/database/postgres.client.js'
import type { Logger } from '../../../shared/logger/logger.js'
import { organizations, roles, userRoles } from './organizations.schema.js'

import { Organization } from '../domain/Organization.js'
import { Role } from '../domain/Role.js'

import type {
  IOrganizationRepository,
  CreateOrganizationInput,
  CreateRoleInput,
  AssignRoleInput,
  UpdateOrganizationInput,
} from '../application/ports/IOrganizationRepository.js'

export class SupabaseOrganizationRepository implements IOrganizationRepository {
  constructor(private readonly deps: { db: DrizzleClient; logger: Logger }) {}

  async save(input: CreateOrganizationInput): Promise<Result<Organization, AppError>> {
    const result = await fromPromise(
      this.deps.db
        .insert(organizations)
        .values({
          id: input.id,
          name: input.name,
          slug: input.slug,
          logoUrl: input.logoUrl ?? null,
          status: 'active',
        })
        .returning(),
      (e) => new InternalError('Failed to save organization', e),
    )
    if (result.isErr()) return err(result.error)
    const row = result.value[0]
    if (!row) return err(new InternalError('No row returned after insert'))
    return ok(this.toOrganization(row))
  }

  async findById(id: string): Promise<Result<Organization, AppError>> {
    const result = await fromPromise(
      this.deps.db.select().from(organizations).where(eq(organizations.id, id)).limit(1),
      (e) => new InternalError('Failed to query organization', e),
    )
    if (result.isErr()) return err(result.error)
    const row = result.value[0]
    if (!row) return err(new NotFoundError(`Organization ${id} not found`))
    return ok(this.toOrganization(row))
  }

  async findBySlug(slug: string): Promise<Result<Organization, AppError>> {
    const result = await fromPromise(
      this.deps.db.select().from(organizations).where(eq(organizations.slug, slug)).limit(1),
      (e) => new InternalError('Failed to query organization by slug', e),
    )
    if (result.isErr()) return err(result.error)
    const row = result.value[0]
    if (!row) return err(new NotFoundError(`Organization with slug "${slug}" not found`))
    return ok(this.toOrganization(row))
  }

  async list(): Promise<Result<Organization[], AppError>> {
    const result = await fromPromise(
      this.deps.db.select().from(organizations),
      (e) => new InternalError('Failed to list organizations', e),
    )
    if (result.isErr()) return err(result.error)
    return ok(result.value.map((r) => this.toOrganization(r)))
  }

  async update(id: string, input: UpdateOrganizationInput): Promise<Result<Organization, AppError>> {
    const result = await fromPromise(
      this.deps.db
        .update(organizations)
        .set({ ...input })
        .where(eq(organizations.id, id))
        .returning(),
      (e) => new InternalError('Failed to update organization', e),
    )
    if (result.isErr()) return err(result.error)
    const row = result.value[0]
    if (!row) return err(new NotFoundError(`Organization ${id} not found`))
    return ok(this.toOrganization(row))
  }

  async saveRole(input: CreateRoleInput): Promise<Result<Role, AppError>> {
    const result = await fromPromise(
      this.deps.db
        .insert(roles)
        .values({
          id: input.id,
          organizationId: input.organizationId,
          name: input.name,
          description: input.description ?? null,
          isSystem: input.isSystem,
        })
        .returning(),
      (e) => new InternalError('Failed to save role', e),
    )
    if (result.isErr()) return err(result.error)
    const row = result.value[0]
    if (!row) return err(new InternalError('No row returned after role insert'))
    return ok(this.toRole(row))
  }

  async findRoleByName(organizationId: string, name: string): Promise<Result<Role, AppError>> {
    const result = await fromPromise(
      this.deps.db
        .select()
        .from(roles)
        .where(and(eq(roles.organizationId, organizationId), eq(roles.name, name)))
        .limit(1),
      (e) => new InternalError('Failed to query role', e),
    )
    if (result.isErr()) return err(result.error)
    const row = result.value[0]
    if (!row) return err(new NotFoundError(`Role "${name}" not found in org ${organizationId}`))
    return ok(this.toRole(row))
  }

  async listRoles(organizationId: string): Promise<Result<Role[], AppError>> {
    const result = await fromPromise(
      this.deps.db.select().from(roles).where(eq(roles.organizationId, organizationId)),
      (e) => new InternalError('Failed to list roles', e),
    )
    if (result.isErr()) return err(result.error)
    return ok(result.value.map((r) => this.toRole(r)))
  }

  async assignRole(input: AssignRoleInput): Promise<Result<void, AppError>> {
    const result = await fromPromise(
      this.deps.db.insert(userRoles).values({
        id: input.id,
        userId: input.userId,
        roleId: input.roleId,
        assignedBy: input.assignedBy,
      }),
      (e) => new InternalError('Failed to assign role', e),
    )
    if (result.isErr()) return err(result.error)
    return ok(undefined)
  }

  // ─── Mappers ────────────────────────────────────────────────────────────────

private toOrganization(row: typeof organizations.$inferSelect): Organization {
  return new Organization(
    row.id, row.name, row.slug, row.status,
    row.logoUrl, row.createdAt, row.updatedAt,
  )
}

private toRole(row: typeof roles.$inferSelect): Role {
  return new Role(
    row.id, row.organizationId, row.name,
    row.description, row.isSystem, row.createdAt,
  )
}
}