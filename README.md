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
- [Project Structure](#project-structure)
- [Module Status](#module-status)
- [Tech Stack](#tech-stack)

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

---

## Prerequisites

### 1. Install Node.js (v20 or higher)

Check if already installed:
```bash
node --version
```

If missing, install via [nvm](https://github.com/nvm-sh/nvm) (recommended):
```bash
# Install nvm
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.7/install.sh | bash

# Restart terminal, then:
nvm install 20
nvm use 20
nvm alias default 20

# Verify
node --version   # should print v20.x.x
```

Or download directly from [nodejs.org](https://nodejs.org).

### 2. Install pnpm (v9 or higher)

```bash
npm install -g pnpm

# Verify
pnpm --version   # should print 9.x.x
```

### 3. Install curl and jq (for testing)

**macOS:**
```bash
# curl is pre-installed on macOS
brew install jq
```

**Ubuntu / Debian:**
```bash
sudo apt-get install curl jq
```

---

## External Services Setup

You need three cloud services. All have free tiers sufficient for development.

### Supabase (Postgres)

1. Go to [supabase.com](https://supabase.com) → New project
2. Choose a region close to you, set a strong database password
3. Once created, go to **Project Settings → Database**
4. Under **Connection string**, select **Transaction** mode — copy the URI (port **6543**)
   - This is your `DATABASE_URL`
5. Switch to **Session** mode — copy the URI (port **5432**)
   - This is your `DATABASE_URL_DIRECT`

> The password is the one you set at project creation. Replace `[YOUR-PASSWORD]` in the URI.

### Redis Cloud

1. Go to [redis.io/cloud](https://redis.io/cloud) → New database (free tier)
2. Select provider and region
3. Once created, click the database → **Connect** → **Redis Client**
4. Copy the `rediss://` connection string (note the double `s` — that's TLS)
   - This is your `REDIS_URL`

> Make sure to use `rediss://` (with TLS), not `redis://`.

### MongoDB Atlas

1. Go to [mongodb.com/atlas](https://www.mongodb.com/atlas) → New project → Build a cluster (free M0 tier)
2. Create a database user: **Database Access → Add new user** → username + password
3. Allow your IP: **Network Access → Add IP Address** → Add Current IP (or `0.0.0.0/0` for dev)
4. Connect: **Database → Connect → Drivers → Node.js**
5. Copy the connection string, replace `<password>` with your DB user's password
   - This is your `MONGODB_URI`

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
# ── Runtime ──────────────────────────────────────────────────────────────────
NODE_ENV=development
PORT=3000
HOST=0.0.0.0
LOG_LEVEL=debug

# ── Supabase / Postgres ───────────────────────────────────────────────────────
# Transaction mode — port 6543 — for all runtime queries
DATABASE_URL=postgresql://postgres.YOURREF:YOURPASSWORD@aws-0-us-east-1.pooler.supabase.com:6543/postgres

# Session mode — port 5432 — used only by Drizzle Kit for migrations
DATABASE_URL_DIRECT=postgresql://postgres.YOURREF:YOURPASSWORD@aws-0-us-east-1.pooler.supabase.com:5432/postgres

# ── Redis Cloud ───────────────────────────────────────────────────────────────
# Must use rediss:// (double s = TLS) — required for Redis Cloud
REDIS_URL=rediss://default:YOURPASSWORD@redis-XXXXX.redis-cloud.com:PORT

# ── MongoDB Atlas ─────────────────────────────────────────────────────────────
MONGODB_URI=mongodb+srv://YOURUSER:YOURPASSWORD@cluster0.XXXXX.mongodb.net/?retryWrites=true&w=majority
MONGODB_DB_NAME=idp_audit

# ── IDP Identity ──────────────────────────────────────────────────────────────
IDP_ISSUER=http://localhost:3000
IDP_BASE_URL=http://localhost:3000

# ── Secrets (see "Generate Secrets" section below) ───────────────────────────
KEY_ENCRYPTION_SECRET=GENERATE_THIS
COOKIE_SECRET=GENERATE_THIS
```

### Where to find each value

| Variable | Where to find it |
|---|---|
| `DATABASE_URL` | Supabase → Project Settings → Database → Connection string → **Transaction** (port 6543) |
| `DATABASE_URL_DIRECT` | Same page → **Session** (port 5432) |
| `REDIS_URL` | Redis Cloud → Database → Connect → copy the `rediss://` URL |
| `MONGODB_URI` | Atlas → Database → Connect → Drivers → Node.js → copy and replace `<password>` |

---

## Generate Secrets

`KEY_ENCRYPTION_SECRET` and `COOKIE_SECRET` must each be a random 64-character hex string.

Run this command **twice** — once for each secret:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

Example output:
```
a3f8c2d1e4b7a6f9c8d3e2f1a4b5c6d7e8f9a0b1c2d3e4f5a6b7c8d9e0f1a2b3
```

Copy each output into your `.env`:
```env
KEY_ENCRYPTION_SECRET=a3f8c2d1e4b7...  # first run
COOKIE_SECRET=9f2e1d4c7b6a5f8e...      # second run
```

> Never reuse the same value for both. Never commit these to git.

---

## Running the Project

### Development (with hot reload)

```bash
# From the repo root
pnpm dev

# Or from inside apps/api
cd apps/api
pnpm dev
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

### Type checking

```bash
pnpm typecheck
```

---

## Testing with cURL

### Health check — verifies all three data stores

```bash
curl http://localhost:3000/health | jq
```

Expected response (all services healthy):
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

If any service shows `"error"`, check that service's credentials in `.env`.

### Readiness probe — used by load balancers / Kubernetes

```bash
curl http://localhost:3000/ready
```

Expected:
```json
{ "status": "ready" }
```

### 404 handler — verifies error handling is working

```bash
curl http://localhost:3000/does-not-exist | jq
```

Expected:
```json
{
  "code": "NOT_FOUND",
  "message": "Route GET /does-not-exist not found."
}
```

### Rate limiting — verifies the rate limiter fires

```bash
# Hit the same endpoint 110 times rapidly
for i in {1..110}; do curl -s http://localhost:3000/ready; done | tail -5 | jq
```

Expected after ~100 requests:
```json
{
  "code": "RATE_LIMITED",
  "message": "Too many requests. Try again in 1 minute."
}
```

### Security headers — verify helmet is active

```bash
curl -I http://localhost:3000/health
```

You should see headers like:
```
x-frame-options: SAMEORIGIN
x-content-type-options: nosniff
strict-transport-security: max-age=31536000; includeSubDomains; preload
```

---

## Project Structure

```
auth-idp/
├── apps/
│   └── api/                          # Core IDP API (Fastify)
│       ├── src/
│       │   ├── shared/               # Shared kernel — no external deps
│       │   │   ├── result/           # Result<T,E> monad
│       │   │   ├── errors/           # Typed AppError hierarchy
│       │   │   ├── config/           # Zod-validated env config
│       │   │   ├── logger/           # Pino structured logger
│       │   │   └── container/        # Awilix DI container
│       │   ├── infrastructure/       # External adapters (swappable)
│       │   │   ├── database/         # Postgres via Drizzle ORM
│       │   │   ├── cache/            # Redis Cloud via ioredis
│       │   │   └── mongo/            # MongoDB Atlas
│       │   ├── modules/              # Feature modules (added per module)
│       │   │   └── {module}/
│       │   │       ├── domain/       # Entities, value objects
│       │   │       ├── application/  # Use cases, port interfaces
│       │   │       ├── infrastructure/ # Repository implementations
│       │   │       └── interface/    # Routes, DTOs, mappers
│       │   ├── app.ts                # Fastify app factory
│       │   └── server.ts             # Process entry point
│       ├── drizzle/                  # SQL migrations (generated)
│       ├── drizzle.config.ts         # Drizzle Kit config
│       ├── vitest.config.ts          # Test config
│       ├── tsconfig.json
│       └── package.json
├── packages/
│   └── types/                        # Shared TypeScript types
│       └── src/index.ts
├── tsconfig.base.json                # Strict TS config inherited by all
├── pnpm-workspace.yaml
├── package.json
└── .env.example
```

---

## Module Status

| Module | Description | Status |
|---|---|---|
| M01 | Project foundation — monorepo, shared kernel, DB connections | ✅ Complete |
| M02 | Database schema — Drizzle tables, migrations, RLS | 🔜 Next |
| M03 | Key management — RSA keys, JWKS endpoint, rotation | ⏳ Pending |
| M04 | User management — registration, login, profiles | ⏳ Pending |
| M05 | Application registry — register SAML/OIDC/JWT apps | ⏳ Pending |
| M06 | OIDC / OAuth 2.0 — oidc-provider, all discovery endpoints | ⏳ Pending |
| M07 | SAML 2.0 — IDP metadata, SSO flow, signed assertions | ⏳ Pending |
| M08 | JWT / cert auth — client assertions, mTLS | ⏳ Pending |
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
| JWT / Crypto | jose + node-forge | Key management, JWT |

---

## Troubleshooting

| Error | Cause | Fix |
|---|---|---|
| `❌ Invalid environment variables` | `.env` missing or wrong path | Ensure `apps/api/.env` exists and all values are filled |
| `getConfig() called before loadConfig()` | Logger imported before config loads | Fixed — logger reads `process.env` directly |
| `Redis max retries reached` | Wrong `REDIS_URL` | Use `rediss://` (double s) from Redis Cloud dashboard |
| `MongoDB not connected` | Wrong `MONGODB_URI` or IP not whitelisted | Check Atlas Network Access → add your IP |
| `prepare: false required` | Supabase pooler compatibility | Already set in `postgres.client.ts` |
| Port already in use | Another process on port 3000 | Set `PORT=3001` in `.env` |

---

## License

MIT — see [LICENSE](./LICENSE)