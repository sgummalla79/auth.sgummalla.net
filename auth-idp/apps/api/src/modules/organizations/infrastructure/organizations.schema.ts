import {
  pgTable,
  pgEnum,
  uuid,
  text,
  boolean,
  timestamp,
  index,
  uniqueIndex,
} from 'drizzle-orm/pg-core'

// ─── Enums ────────────────────────────────────────────────────────────────────

export const organizationStatusEnum = pgEnum('organization_status', [
  'active',
  'suspended',
])

// ─── Organizations ────────────────────────────────────────────────────────────

export const organizations = pgTable(
  'organizations',
  {
    id:          uuid('id').primaryKey().defaultRandom(),
    name:        text('name').notNull(),
    slug:        text('slug').notNull(),               // URL-safe unique identifier
    logoUrl:     text('logo_url'),
    status:      organizationStatusEnum('status').notNull().default('active'),
    createdAt:   timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt:   timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => ({
    slugIdx: uniqueIndex('organizations_slug_idx').on(t.slug),
    statusIdx: index('organizations_status_idx').on(t.status),
  }),
)

// ─── Roles ────────────────────────────────────────────────────────────────────
// Global to org — same role applies across all applications in the org

export const roles = pgTable(
  'roles',
  {
    id:             uuid('id').primaryKey().defaultRandom(),
    organizationId: uuid('organization_id')
                      .notNull()
                      .references(() => organizations.id, { onDelete: 'cascade' }),
    name:           text('name').notNull(),           // e.g. "org_admin", "viewer"
    description:    text('description'),
    isSystem:       boolean('is_system').notNull().default(false), // system roles cannot be deleted
    createdAt:      timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => ({
    orgIdx:         index('roles_organization_id_idx').on(t.organizationId),
    orgNameIdx:     uniqueIndex('roles_org_name_idx').on(t.organizationId, t.name),
  }),
)

// ─── User Roles ───────────────────────────────────────────────────────────────
// A user has one set of roles per org — same roles apply across all apps in that org

export const userRoles = pgTable(
  'user_roles',
  {
    id:             uuid('id').primaryKey().defaultRandom(),
    userId:         uuid('user_id').notNull(),         // FK set in users.schema.ts via relations
    roleId:         uuid('role_id')
                      .notNull()
                      .references(() => roles.id, { onDelete: 'cascade' }),
    assignedBy:     uuid('assigned_by').notNull(),     // user_id of who granted this role
    assignedAt:     timestamp('assigned_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => ({
    userIdx:        index('user_roles_user_id_idx').on(t.userId),
    roleIdx:        index('user_roles_role_id_idx').on(t.roleId),
    userRoleIdx:    uniqueIndex('user_roles_user_role_idx').on(t.userId, t.roleId),
  }),
)