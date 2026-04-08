# auth.sgummalla.net

A production-grade, multi-tenant Identity Provider (IDP) supporting **SAML 2.0**, **OAuth 2.0 / OIDC**, and **JWT / Certificate-based auth** for Single Sign-On (SSO).

Built with Node.js, TypeScript, Fastify, Supabase (Postgres), Redis Cloud, and MongoDB Atlas.

---

## Table of Contents

- [Architecture](#architecture)
- [Prerequisites](#prerequisites)
- [External Services Setup](#external-services-setup)
- [Project Setup](#project-setup)
- [Environment Configuration](#environment-configuration)
- [Generate Secrets](#generate-secrets)
- [Running the Project](#running-the-project)
- [Database Schema](#database-schema)
- [Multi-Tenancy Model](#multi-tenancy-model)
- [API Reference](#api-reference)
- [Project Structure](#project-structure)
- [Module Status](#module-status)
- [Tech Stack](#tech-stack)
- [Troubleshooting](#troubleshooting)

---

## Architecture

Hexagonal architecture (Ports & Adapters) with strict layer separation:

```
Domain → Application → Infrastructure → Interface
```

- **Domain** — pure business logic, zero dependencies
- **Application** — use cases and port interfaces
- **Infrastructure** — Postgres, Redis, MongoDB adapters (swappable)
- **Interface** — Fastify routes and request/response DTOs
- **Shared kernel** — Result monad, typed errors, config, logger

Every external system is behind an interface. Swap any adapter by changing one registration in the Awilix DI container.

---

## Prerequisites

### 1. Install Node.js (v20 or higher)

```bash
node --version   # must be >= 20
```

Install via [nvm](https://github.com/nvm-sh/nvm):

```bash
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.7/install.sh | bash
nvm install 20 && nvm use 20 && nvm alias default 20
```

### 2. Install pnpm (v9 or higher)

```bash
npm install -g pnpm
pnpm --version   # must be >= 9
```

### 3. Install jq

```bash
brew install jq          # macOS
sudo apt-get install jq  # Ubuntu
```

---

## External Services Setup

### Supabase (Postgres)

1. [supabase.com](https://supabase.com) → New project
2. **Project Settings → Database → Connection string**
3. **Transaction** mode URI (port 6543) → `DATABASE_URL`
4. **Session** mode URI (port 5432) → `DATABASE_URL_DIRECT`

### Redis Cloud

1. [redis.io/cloud](https://redis.io/cloud) → New database (free tier)
2. Copy the `rediss://` connection string → `REDIS_URL`

### MongoDB Atlas

1. [mongodb.com/atlas](https://mongodb.com/atlas) → Free cluster
2. **Database Access** → new user with read/write
3. **Network Access** → add your IP
4. **Connect → Drivers** → copy URI → `MONGODB_URI`

---

## Project Setup

```bash
git clone <repo>
cd auth-idp
pnpm install
cp apps/api/.env.example apps/api/.env
# fill in .env
```

---

## Environment Configuration

```env
NODE_ENV=development
PORT=3000
LOG_LEVEL=info
IDP_BASE_URL=http://localhost:3000

DATABASE_URL=postgresql://postgres.<project>.supabase.co:6543/postgres
DATABASE_URL_DIRECT=postgresql://postgres.<project>.supabase.co:5432/postgres

REDIS_URL=rediss://:password@host:port

MONGODB_URI=mongodb+srv://user:pass@cluster.mongodb.net/auth-idp

JWT_SECRET=<64-char hex>
SESSION_SECRET=<64-char hex>
KEY_ENCRYPTION_SECRET=<64-char hex>
ADMIN_API_KEY=<random string>
```

### Generate Secrets

```bash
node -e "console.log(require('crypto').randomBytes(64).toString('hex'))"
```

Run three times — once each for `JWT_SECRET`, `SESSION_SECRET`, and `KEY_ENCRYPTION_SECRET`.

---

## Running the Project

```bash
# API server
cd apps/api && pnpm dev

# Admin dashboard
cd apps/admin && pnpm dev

# Health check
curl http://localhost:3000/health | jq
```

---

## Database Schema

13 tables across 5 modules — all org-scoped:

| Table | Module | Purpose |
|---|---|---|
| `organizations` | organizations | Master tenant entity |
| `roles` | organizations | Org-scoped roles (e.g. org_admin) |
| `user_roles` | organizations | User ↔ role junction |
| `applications` | applications | App registry — SAML / OIDC / JWT apps per org |
| `scopes` | applications | API authorization scopes per application |
| `saml_configs` | applications | SAML 2.0 config per app |
| `oidc_clients` | applications | OIDC / OAuth 2.0 client config per app |
| `jwt_configs` | applications | JWT / cert auth config per app |
| `users` | users | User accounts — org-scoped |
| `user_profiles` | users | OIDC claims (name, picture, locale etc.) |
| `user_mfa` | users | TOTP / WebAuthn factors per user |
| `signing_keys` | keys | Per-org RSA/EC signing keypairs |
| `sso_sessions` | sessions | Active SSO sessions + SLO tracking |

### Schema Change Workflow

```bash
pnpm db:generate   # generates SQL migration from schema changes
pnpm db:migrate    # applies migration to Supabase
```

---

## Multi-Tenancy Model

Every organization is a fully isolated tenant:

```
organizations  ← master entity
  ├── signing_keys   (org's own RSA/EC keypair — rotated independently)
  ├── applications   (SAML / OIDC / JWT apps scoped to the org)
  │     └── scopes   (API authorization scopes per app)
  ├── users          (global to org, shared across all apps)
  │     └── user_roles
  ├── roles          (org-scoped, global across all apps in the org)
  ├── sessions       (org_id stored directly for fast tenant queries)
  └── audit_logs     (org-scoped, isolated per tenant — stored in MongoDB)
```

**Key isolation:** Each org gets its own RSA keypair. SAML assertions and OIDC tokens are signed with the org's key only. Rotating one org's key has zero effect on other orgs.

**Roles:** Global to the org — a user's roles apply across all applications in that org. `org_admin` is a system role seeded on org creation and cannot be deleted. One user can be org_admin for multiple orgs.

---

## API Reference

### Super-admin routes (require `x-admin-key: $ADMIN_API_KEY` header)

```
POST   /admin/orgs              → create org + generate keypair + seed org_admin role
GET    /admin/orgs              → list all orgs
GET    /admin/orgs/:orgId       → get org detail
PATCH  /admin/orgs/:orgId       → suspend / reactivate org
```

---

## Project Structure

```
auth-idp/
├── apps/
│   ├── api/                          # Fastify API — hexagonal architecture
│   │   ├── src/
│   │   │   ├── modules/
│   │   │   │   ├── organizations/    # Orgs, roles, user_roles
│   │   │   │   ├── applications/     # Apps, scopes, SAML/OIDC/JWT configs
│   │   │   │   ├── users/            # Users, profiles, MFA
│   │   │   │   ├── keys/             # Per-org signing keys, JWKS
│   │   │   │   ├── sessions/         # SSO sessions, SLO
│   │   │   │   └── audit/            # BullMQ + MongoDB audit events
│   │   │   ├── database/             # Drizzle schema re-exports
│   │   │   ├── shared/               # Result monad, errors, config, logger
│   │   │   └── server.ts
│   │   └── drizzle/migrations/
│   └── admin/                        # Next.js 15 admin dashboard
│       └── src/app/
│           ├── [orgId]/              # Org-scoped pages
│           │   ├── dashboard/
│           │   ├── applications/
│           │   ├── users/
│           │   ├── roles/
│           │   ├── keys/
│           │   ├── sessions/
│           │   └── audit-logs/
│           ├── admin/orgs/           # Super-admin pages
│           ├── login/
│           └── org-select/
├── packages/types/
├── tsconfig.base.json
└── pnpm-workspace.yaml
```

---

## Module Status

| Module | Description | Status |
|---|---|---|
| M01 | Project foundation — monorepo, shared kernel, DB connections | ✅ Complete |
| M02 | Database schema — 9 tables, indexes, RLS, triggers | ✅ Complete |
| M03 | Key management — RSA/EC generation, AES-256-GCM, JWKS, rotation | ✅ Complete |
| M04 | User management — registration, login, Argon2id, sessions, profiles | ✅ Complete |
| M05 | Application registry — SAML/OIDC/JWT config, slug, credentials | ✅ Complete |
| M06 | OIDC / OAuth 2.0 — oidc-provider, Redis adapter, PKCE, interactions | ✅ Complete |
| M07 | SAML 2.0 — IDP metadata, SSO flow, signed assertions, SLO | ✅ Complete |
| M08 | JWT / cert auth — RFC 7523 client assertions, mTLS, token issuance | ✅ Complete |
| M09 | MFA — TOTP (speakeasy), Argon2id backup codes, enrollment flow | ✅ Complete |
| M10 | Session management — SSO session tracking, SLO fanout, admin revocation | ✅ Complete |
| M11 | Audit logging — BullMQ queue, MongoDB event store, admin query API | ✅ Complete |
| M12a | Admin dashboard — Next.js 15 project setup, layout, sidebar, health | ✅ Complete |
| M12b | Admin dashboard — Key & application management | ✅ Complete |
| M12c | Admin dashboard — User management, MFA status, force-logout | ✅ Complete |
| M12d | Admin dashboard — Audit log viewer, filters, pagination | ✅ Complete |
| M12e | Admin dashboard — Dashboard overview, summary cards | ✅ Complete |
| M13 | Schema redesign — organizations as master entity, 13 tables | ✅ Complete |
| M14 | Organizations API — CRUD, keypair bootstrap, org_admin seed | ✅ Complete |
| **M15** | **Per-org Keys — org-scoped ISigningKeyRepository, JWKS, rotation** | **🔜 Next** |
| M16 | Users & Roles — org-scoped users, role CRUD, requireOrgAdmin middleware | ⏳ Pending |
| M17 | Applications & Scopes — org-namespaced apps, scope management | ⏳ Pending |
| M18 | Protocol routes restructure — SAML/OIDC/JWT under /orgs/:orgId/... | ⏳ Pending |
| M19 | Sessions & Audit Logs — org-scoped, tenant-filtered queries | ⏳ Pending |
| M20 | UI routing restructure — /[orgId]/... dynamic routes, login flow, org switcher | ⏳ Pending |
| M21 | Super-admin UI — /admin/orgs list, create, suspend | ⏳ Pending |
| M22 | Org dashboard + Keys UI — /[orgId]/dashboard, /[orgId]/keys | ⏳ Pending |
| M23 | Applications & Scopes UI — /[orgId]/applications, app detail + scopes | ⏳ Pending |
| M24 | Users & Roles UI — /[orgId]/users, /[orgId]/roles, role assignment | ⏳ Pending |
| M25 | Sessions & Audit Logs UI — /[orgId]/sessions, /[orgId]/audit-logs | ⏳ Pending |
| M26 | Deployment — Fly.io for api + admin, secrets, health checks | ⏳ Pending |

---

## Tech Stack

| Layer | Technology | Purpose |
|---|---|---|
| Runtime | Node.js 20 + TypeScript 5 (strict) | Core language |
| HTTP framework | Fastify 4 | API server |
| DI container | Awilix (PROXY mode) | Dependency injection |
| Database | Supabase (Postgres) via Drizzle ORM | Application data |
| Cache | Redis Cloud via ioredis | Sessions, tokens, rate limiting |
| Document store | MongoDB Atlas | Audit logs |
| Job queue | BullMQ | Async audit event processing |
| Validation | Zod | Env config + request schemas |
| Logging | Pino + pino-pretty | Structured JSON logging |
| Password hashing | Argon2id | OWASP-recommended parameters |
| OIDC / OAuth 2.0 | oidc-provider | Full spec compliance |
| SAML 2.0 | samlify + node-forge | IDP metadata, SSO, SLO, signed assertions |
| JWT signing | jose | JWK export, SPKI import, SignJWT |
| Key crypto | Node.js crypto (built-in) | RSA/EC generation, AES-256-GCM |
| Cert handling | node-forge | X.509 cert generation, thumbprint extraction |
| TOTP | speakeasy | TOTP generation and verification |
| Admin UI | Next.js 15 + Tailwind | Admin dashboard |

---

## Troubleshooting

| Error | Fix |
|---|---|
| `Invalid environment variables` | All vars in `.env` must be set |
| `Redis max retries reached` | Use `rediss://` (double s) from Redis Cloud |
| `MongoDB not connected` | Check Atlas Network Access — add your IP |
| `401` on admin routes | Exact `ADMIN_API_KEY` in `x-admin-key` header — no quotes, no spaces |
| `signing_keys organization_id NOT NULL` | Remove `bootstrapSigningKeys` call from `server.ts` — keys are now per-org |
| `Type 'Boolean' has no call signatures` | Use `isErr(result)` / `isOk(result)` functions, never `result.isErr()` as a method |
| `generateRSAKeyPair does not exist` | Use `generateKeyPair` — existing port name |
| `privateKey does not exist on KeyPair` | Use `privateKeyPem` and `publicKeyPem` — existing domain property names |
| `id does not exist in CreateSigningKeyInput` | Use `kid` at top level, no `id` or `organizationId` — M15 adds org-scoping to keys |
| SP rejects SAML assertion | Import IDP cert from `/orgs/:orgId/saml/:appId/metadata` into SP trusted certs |
| `invalid_client` on OIDC token | Wrong `client_secret` or PKCE verifier mismatch |
| Array default syntax error in migration | Use `sql\`'{}'::text[]\`` for all array defaults in Drizzle schema |
| Audit events not appearing | BullMQ is async — wait 2s after action before querying |
| BullMQ eviction warning | Set Redis eviction policy to `noeviction` in Redis Cloud settings |

---

## License

MIT — see [LICENSE](./LICENSE)