/**
 * Role — org-scoped role entity.
 * System roles (is_system = true) cannot be deleted.
 * org_admin is always a system role, seeded on org creation.
 */
export class Role {
  constructor(
    public readonly id: string,
    public readonly organizationId: string,
    public readonly name: string,
    public readonly description: string | null,
    public readonly isSystem: boolean,
    public readonly createdAt: Date,
  ) {}

  canBeDeleted(): boolean {
    return !this.isSystem
  }
}

export const SYSTEM_ROLES = {
  ORG_ADMIN: 'org_admin',
} as const