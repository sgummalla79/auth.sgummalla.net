# auth.sgummalla.net — Identity Provider (IDP)

A production-grade Identity Provider supporting **SAML 2.0**, **OAuth 2.0 / OIDC**, and **JWT / Certificate-based auth** for Single Sign-On (SSO).

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
- [Testing with cURL](#testing-with-curl)
- [Database Schema](#database-schema)
- [Schema Change Workflow](#schema-change-workflow)
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

Every external system (Postgres, Redis, MongoDB) is behind an interface. Swap any adapter by changing one registration in the Awilix DI container.

---

## Prerequisites

### 1. Install Node.js (v20 or higher)

```bash
node --version   # must be >= 20
```

Install via [nvm](https://github.com/nvm-sh/nvm) (recommended):

```bash
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.7/install.sh | bash

# Restart terminal, then:
nvm install 20
nvm use 20
nvm alias default 20
```

### 2. Install pnpm (v9 or higher)

```bash
npm install -g pnpm
pnpm --version   # must be >= 9
```

### 3. Install jq (for readable curl output)

```bash
# macOS
brew install jq

# Ubuntu / Debian
sudo apt-get install jq
```

---

## External Services Setup

Three cloud services required. All have free tiers sufficient for development.

### Supabase (Postgres)

1. Go to [supabase.com](https://supabase.com) → New project
2. Choose a region, set a strong database password
3. Go to **Project Settings → Database → Connection string**
4. Copy **Transaction** mode URI (port **6543**) → `DATABASE_URL`
5. Copy **Session** mode URI (port **5432**) → `DATABASE_URL_DIRECT`

### Redis Cloud

1. Go to [redis.io/cloud](https://redis.io/cloud) → New database (free tier)
2. Once created → **Connect** → copy the `rediss://` URL → `REDIS_URL`

> Must use `rediss://` (double s = TLS). Redis Cloud requires TLS.

### MongoDB Atlas

1. Go to [mongodb.com/atlas](https://www.mongodb.com/atlas) → New cluster (free M0 tier)
2. **Database Access** → Add user with password
3. **Network Access** → Add your IP (or `0.0.0.0/0` for dev)
4. **Connect** → Drivers → Node.js → copy URI → `MONGODB_URI`

---

## Project Setup

### 1. Clone the repository

```bash
git clone https://github.com/sgummalla79/auth.sgummalla.net.git
cd auth.sgummalla.net/auth-idp
```

### 2. Install dependencies

```bash
pnpm install
```

### 3. Create the environment file

```bash
cp apps/api/.env.example apps/api/.env
```

---

## Environment Configuration

Open `apps/api/.env` and fill in every value:

```env
# ── Runtime ───────────────────────────────────────────────────────────────────
NODE_ENV=development
PORT=3000
HOST=0.0.0.0
LOG_LEVEL=debug

# ── Supabase / Postgres ───────────────────────────────────────────────────────
# Transaction mode — port 6543 — for all runtime queries
DATABASE_URL=postgresql://postgres.YOURREF:PASSWORD@aws-0-us-east-1.pooler.supabase.com:6543/postgres

# Session mode — port 5432 — used only by Drizzle Kit for schema inspection
DATABASE_URL_DIRECT=postgresql://postgres.YOURREF:PASSWORD@aws-0-us-east-1.pooler.supabase.com:5432/postgres

# ── Redis Cloud ───────────────────────────────────────────────────────────────
REDIS_URL=rediss://default:PASSWORD@redis-XXXXX.redis-cloud.com:PORT

# ── MongoDB Atlas ─────────────────────────────────────────────────────────────
MONGODB_URI=mongodb+srv://USER:PASSWORD@cluster0.XXXXX.mongodb.net/?retryWrites=true&w=majority
MONGODB_DB_NAME=idp_audit

# ── IDP Identity ──────────────────────────────────────────────────────────────
IDP_ISSUER=http://localhost:3000
IDP_BASE_URL=http://localhost:3000

# ── Secrets ───────────────────────────────────────────────────────────────────
KEY_ENCRYPTION_SECRET=GENERATE_THIS
COOKIE_SECRET=GENERATE_THIS
```

### Where to find each value

| Variable | Where |
|---|---|
| `DATABASE_URL` | Supabase → Project Settings → Database → **Transaction** (port 6543) |
| `DATABASE_URL_DIRECT` | Same page → **Session** (port 5432) |
| `REDIS_URL` | Redis Cloud → Database → Connect → copy `rediss://` URL |
| `MONGODB_URI` | Atlas → Database → Connect → Drivers → Node.js |

---

## Generate Secrets

Run this command **twice** — once for each secret:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

Copy each output into `.env`:

```env
KEY_ENCRYPTION_SECRET=a3f8c2d1...   # first run
COOKIE_SECRET=9f2e1d4c...           # second run
```

> Never reuse the same value for both. Never commit `.env` to git.

---

## Running the Project

### Development (with hot reload)

```bash
pnpm dev

# or from inside apps/api:
cd apps/api && pnpm dev
```

### Production build

```bash
pnpm build
pnpm start
```

### Run tests

```bash
pnpm test
```

---

## Testing with cURL

### Health check — verifies all three data stores

```bash
curl http://localhost:3000/health | jq
```

Expected:
```json
{
  "status": "ok",
  "timestamp": "2026-04-05T12:00:00.000Z",
  "services": {
    "postgres": "ok",
    "redis": "ok",
    "mongodb": "ok"
  }
}
```

### Readiness probe

```bash
curl http://localhost:3000/ready
```

### 404 handler

```bash
curl http://localhost:3000/does-not-exist | jq
```

### Rate limiting — confirm limiter fires after 100 requests

```bash
for i in {1..110}; do curl -s http://localhost:3000/ready; done | tail -3 | jq
```

### Security headers — confirm Helmet is active

```bash
curl -I http://localhost:3000/health
```

Look for `x-frame-options`, `x-content-type-options`, and `strict-transport-security`.

---

## Database Schema

All schema is managed via **Drizzle ORM**. Each table lives in its module's
`infrastructure/` folder. The single import point for all schemas is
`src/database/index.ts`.

### Tables

| Table | Module | Purpose |
|---|---|---|
| `applications` | applications | Every SP registered in the IDP |
| `saml_configs` | applications | SAML 2.0 config per app |
| `oidc_clients` | applications | OIDC / OAuth 2.0 client config |
| `jwt_configs` | applications | JWT / cert auth config |
| `users` | users | User accounts |
| `user_profiles` | users | OIDC claims (name, picture, locale) |
| `user_mfa` | users | TOTP / WebAuthn MFA factors |
| `signing_keys` | keys | IDP RSA/EC signing key pairs |
| `sso_sessions` | sessions | Active SSO sessions + SLO tracking |

### Key design decisions

- **Private keys encrypted at rest** — `signing_keys.encrypted_private_key` is AES-256-GCM encrypted using `KEY_ENCRYPTION_SECRET`. IV stored separately in `encryption_iv`.
- **Client secrets hashed** — `oidc_clients.client_secret_hash` uses Argon2id. Plaintext returned once at registration only.
- **Account lockout** — `users.failed_login_attempts` + `users.locked_until` support brute-force protection.
- **SLO tracking** — `sso_sessions.participating_app_ids` lists every SP the user visited. Used to notify all SPs on logout.
- **Key rotation lifecycle** — `signing_keys.status` progresses: `active → rotating → retired → revoked`.
- **`updated_at` auto-trigger** — Postgres trigger keeps `updated_at` accurate without relying on the application layer.
- **RLS enabled** — All tables deny direct access from `anon` and `authenticated` roles. The IDP API uses the service role key which bypasses RLS.

---

## Schema Change Workflow

> Drizzle Kit is used to **generate** SQL diffs only. Migrations are applied
> directly via the Supabase SQL Editor — this is more reliable than
> `drizzle-kit migrate` due to Drizzle 0.30 bugs with array defaults.

### For every future schema change:

**1.** Edit the relevant schema file in `src/modules/*/infrastructure/*.schema.ts`

**2.** Generate the diff:
```bash
cd apps/api
pnpm db:generate
```

**3.** Review the generated file in `drizzle/migrations/` — fix these known Drizzle 0.30 issues manually if present:

| Broken (Drizzle generates) | Correct |
|---|---|
| `text[] DEFAULT  NOT NULL` | `text[] DEFAULT '{}' NOT NULL` |
| `text[] DEFAULT some_value NOT NULL` | `text[] DEFAULT ARRAY['some_value'] NOT NULL` |
| `"inet"` column type (quoted) | `text` |

**4.** Paste the corrected SQL into **Supabase → SQL Editor → New query** → Run

**5.** Clean up after applying:
```bash
rm drizzle/migrations/*.sql
rm -rf drizzle/migrations/meta
```

---

## Project Structure

```
auth-idp/
├── apps/
│   └── api/                              # Core IDP API (Fastify)
│       ├── src/
│       │   ├── shared/                   # Shared kernel — no external deps
│       │   │   ├── result/               # Result<T,E> monad
│       │   │   ├── errors/               # Typed AppError hierarchy
│       │   │   ├── config/               # Zod-validated env config
│       │   │   ├── logger/               # Pino structured logger
│       │   │   └── container/            # Awilix DI container + Cradle type
│       │   ├── infrastructure/           # External adapters (swappable)
│       │   │   ├── database/             # Postgres via Drizzle ORM
│       │   │   ├── cache/                # Redis Cloud via ioredis
│       │   │   └── mongo/                # MongoDB Atlas
│       │   ├── database/
│       │   │   └── index.ts              # Single re-export for all schemas
│       │   ├── modules/                  # Feature modules
│       │   │   ├── applications/
│       │   │   │   └── infrastructure/
│       │   │   │       └── applications.schema.ts
│       │   │   ├── users/
│       │   │   │   └── infrastructure/
│       │   │   │       └── users.schema.ts
│       │   │   ├── keys/
│       │   │   │   └── infrastructure/
│       │   │   │       └── keys.schema.ts
│       │   │   └── sessions/
│       │   │       └── infrastructure/
│       │   │           └── sessions.schema.ts
│       │   ├── app.ts                    # Fastify app factory
│       │   └── server.ts                 # Process entry point
│       ├── drizzle/
│       │   └── migrations/               # Generated SQL diffs (applied via Supabase)
│       ├── drizzle.config.ts
│       ├── vitest.config.ts
│       └── package.json
├── packages/
│   └── types/                            # Shared TypeScript types
├── tsconfig.base.json
├── pnpm-workspace.yaml
└── package.json
```

---

## Module Status

| Module | Description | Status |
|---|---|---|
| M01 | Project foundation — monorepo, shared kernel, DB connections | ✅ Complete |
| M02 | Database schema — 9 tables, indexes, RLS, triggers | ✅ Complete |
| M03 | Key management — RSA key generation, JWKS endpoint, rotation | 🔜 Next |
| M04 | User management — registration, login, Argon2, profiles | ⏳ Pending |
| M05 | Application registry — register SAML / OIDC / JWT apps | ⏳ Pending |
| M06 | OIDC / OAuth 2.0 — oidc-provider, all discovery endpoints | ⏳ Pending |
| M07 | SAML 2.0 — IDP metadata, SSO flow, signed assertions | ⏳ Pending |
| M08 | JWT / cert auth — client assertions RFC 7523, mTLS | ⏳ Pending |
| M09 | MFA — TOTP, WebAuthn, backup codes | ⏳ Pending |
| M10 | Session management — SSO sessions, single logout | ⏳ Pending |
| M11 | Audit logging — MongoDB event store, BullMQ | ⏳ Pending |
| M12 | Admin dashboard — Next.js UI | ⏳ Pending |

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
| Validation | Zod | Env config + request validation |
| Logging | Pino + pino-pretty | Structured JSON logs |
| Testing | Vitest | Unit + integration tests |
| OIDC / OAuth | oidc-provider | OIDC spec implementation |
| SAML | samlify | SAML 2.0 implementation |
| JWT / Crypto | jose + node-forge | Key management, JWT signing |

---

## Troubleshooting

| Error | Cause | Fix |
|---|---|---|
| `❌ Invalid environment variables` | `.env` missing or wrong path | Ensure `apps/api/.env` exists with all values filled |
| `getConfig() called before loadConfig()` | Logger imported before config | Fixed — logger reads `process.env` directly |
| `Redis max retries reached` | Wrong `REDIS_URL` | Use `rediss://` (double s) from Redis Cloud dashboard |
| `MongoDB not connected` | Wrong URI or IP not whitelisted | Check Atlas Network Access → add your IP |
| `prepare: false` error | Supabase pooler incompatibility | Already set in `postgres.client.ts` |
| Port already in use | Another process on 3000 | Set `PORT=3001` in `.env` |
| Drizzle array default syntax error | Drizzle 0.30 bug | Apply SQL via Supabase SQL Editor — see Schema Change Workflow |

---

## License

MIT — see [LICENSE](./LICENSE)