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
- [Key Management](#key-management)
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

# ── Secrets — generate each with: ────────────────────────────────────────────
# node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
KEY_ENCRYPTION_SECRET=GENERATE_THIS
COOKIE_SECRET=GENERATE_THIS
ADMIN_API_KEY=GENERATE_THIS
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

Run this command **three times** — once for each secret:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

```env
KEY_ENCRYPTION_SECRET=first_output_here
COOKIE_SECRET=second_output_here
ADMIN_API_KEY=third_output_here
```

> Never reuse the same value for multiple secrets. Never commit `.env` to git.
> Do not wrap values in quotes — `--env-file` includes them literally.

---

## Running the Project

### Development (with hot reload)

```bash
pnpm dev

# or from inside apps/api:
cd apps/api && pnpm dev
```

On startup the server automatically checks for a signing key and generates
one if none exists. You should see in the logs:

```
No active signing key — generating initial RS256 key
Initial signing key generated  kid=key_a1b2c3d4e5f6g7h8
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

Expected output:
```
✓ src/__tests__/Result.test.ts            (8 tests)
✓ src/__tests__/schema.test.ts            (14 tests)
✓ src/__tests__/keys/AesKeyEncryptionService.test.ts     (5 tests)
✓ src/__tests__/keys/NodeCryptoKeyGenerationService.test.ts  (4 tests)
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
  "services": { "postgres": "ok", "redis": "ok", "mongodb": "ok" }
}
```

### Readiness probe

```bash
curl http://localhost:3000/ready
```

### JWKS endpoint — public key used by all service providers

```bash
curl http://localhost:3000/.well-known/jwks.json | jq
```

Expected:
```json
{
  "keys": [
    {
      "kty": "RSA",
      "use": "sig",
      "alg": "RS256",
      "kid": "key_a1b2c3d4",
      "n": "...",
      "e": "AQAB"
    }
  ]
}
```

### Generate a signing key (admin)

Returns `409 Conflict` if a key already exists — use rotate instead.

```bash
curl -s -X POST http://localhost:3000/api/v1/admin/keys/generate \
  -H "Authorization: Bearer YOUR_ADMIN_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"algorithm": "RS256", "expiresInDays": 90}' | jq
```

### Rotate the signing key (admin)

Retires the current key and creates a new active key. The retired key stays
in JWKS so existing tokens remain verifiable until they expire.

```bash
curl -s -X POST http://localhost:3000/api/v1/admin/keys/rotate \
  -H "Authorization: Bearer YOUR_ADMIN_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{}' | jq
```

Expected:
```json
{
  "kid": "key_newkidhere",
  "algorithm": "RS256",
  "status": "active",
  "message": "Key rotated. Previous key is now retired."
}
```

### Unauthorized access — verify auth is enforced

```bash
curl -s -X POST http://localhost:3000/api/v1/admin/keys/rotate \
  -H "Authorization: Bearer wrongkey" | jq
```

Expected: `401 Unauthorized`

### Rate limiting

```bash
for i in {1..110}; do curl -s http://localhost:3000/ready; done | tail -3 | jq
```

### Security headers

```bash
curl -I http://localhost:3000/health
```

---

## Database Schema

All schema managed via **Drizzle ORM**. Each table lives in its module's
`infrastructure/` folder. Single import point: `src/database/index.ts`.

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

- **Private keys encrypted at rest** — AES-256-GCM using `KEY_ENCRYPTION_SECRET`. IV stored separately in `encryption_iv`.
- **Client secrets hashed** — Argon2id. Plaintext returned once at registration only.
- **Account lockout** — `users.failed_login_attempts` + `users.locked_until`.
- **SLO tracking** — `sso_sessions.participating_app_ids` for Single Logout propagation.
- **Key rotation lifecycle** — `active → rotating → retired → revoked`.
- **`updated_at` auto-trigger** — Postgres trigger, not application layer.
- **RLS enabled** — Deny-all for `anon` and `authenticated` roles.

---

## Schema Change Workflow

> Apply migrations via Supabase SQL Editor — not `drizzle-kit migrate` (Drizzle 0.30 bug with array defaults).

**1.** Edit the schema file in `src/modules/*/infrastructure/*.schema.ts`

**2.** Generate the diff:
```bash
pnpm db:generate
```

**3.** Fix known Drizzle 0.30 issues in the generated file:

| Broken (Drizzle generates) | Correct |
|---|---|
| `text[] DEFAULT  NOT NULL` | `text[] DEFAULT '{}' NOT NULL` |
| `text[] DEFAULT some_value NOT NULL` | `text[] DEFAULT ARRAY['some_value'] NOT NULL` |
| `"inet"` column type (quoted) | `text` |

**4.** Paste corrected SQL into **Supabase → SQL Editor → New query → Run**

**5.** Clean up:
```bash
rm drizzle/migrations/*.sql
rm -rf drizzle/migrations/meta
```

---

## Key Management

The IDP uses RSA-2048 (RS256) keys to sign all tokens and SAML assertions.

### How it works

- On startup, the server auto-generates an RS256 key if none exists
- Private key is encrypted with AES-256-GCM before being stored in Postgres
- scrypt derives the encryption key from `KEY_ENCRYPTION_SECRET`
- Public key is exposed at `/.well-known/jwks.json` for SP verification
- Active key is cached in Redis (5-minute TTL) to avoid DB reads per token

### Key lifecycle

```
generated → active → (rotate) → retired → (expire) → [stop publishing in JWKS]
```

- `active` — current primary key, signs all new tokens
- `retired` — kept in JWKS for verifying tokens issued before rotation
- `revoked` — compromised key, removed from JWKS immediately

### Rotation recommendations

- Rotate every 60–80 days (before the 90-day expiry)
- After rotation the retired key stays in JWKS until all its tokens expire
- Never delete a retired key while tokens signed with it may still be valid

### Supported algorithms

| Algorithm | Key type | Notes |
|---|---|---|
| `RS256` | RSA-2048 | Default — broadest SP compatibility |
| `RS384` | RSA-2048 | Higher security |
| `RS512` | RSA-4096 | Maximum RSA security |
| `ES256` | EC P-256 | Smaller keys, modern SPs |
| `ES384` | EC P-384 | Higher EC security |
| `ES512` | EC P-521 | Maximum EC security |

---

## Project Structure

```
auth-idp/
├── apps/
│   └── api/
│       ├── src/
│       │   ├── shared/
│       │   │   ├── result/               # Result<T,E> monad (isOk/isErr as methods)
│       │   │   ├── errors/               # AppError hierarchy (ValidationError, etc.)
│       │   │   ├── config/               # Zod-validated env — all vars here
│       │   │   ├── logger/               # Pino — reads process.env directly
│       │   │   └── container/            # Awilix DI — Cradle type, buildContainer()
│       │   ├── infrastructure/
│       │   │   ├── database/             # postgres.client.ts — Drizzle + schema
│       │   │   ├── cache/                # redis.client.ts — ioredis + reconnect
│       │   │   └── mongo/                # mongo.client.ts — Atlas + TTL indexes
│       │   ├── database/
│       │   │   └── index.ts              # Single re-export for all Drizzle schemas
│       │   ├── modules/
│       │   │   ├── applications/infrastructure/applications.schema.ts
│       │   │   ├── users/infrastructure/users.schema.ts
│       │   │   ├── sessions/infrastructure/sessions.schema.ts
│       │   │   └── keys/
│       │   │       ├── domain/SigningKey.ts
│       │   │       ├── application/
│       │   │       │   ├── ports/        # ISigningKeyRepository, IKeyEncryptionService
│       │   │       │   │                 # IKeyGenerationService, IKeyCache
│       │   │       │   └── use-cases/    # GenerateSigningKey, RotateSigningKey, GetJwks
│       │   │       ├── infrastructure/
│       │   │       │   ├── NodeCryptoKeyGenerationService.ts
│       │   │       │   ├── AesKeyEncryptionService.ts
│       │   │       │   ├── SupabaseSigningKeyRepository.ts
│       │   │       │   └── RedisKeyCache.ts
│       │   │       ├── interface/
│       │   │       │   ├── KeyRoutes.ts
│       │   │       │   └── KeyDTOs.ts
│       │   │       └── index.ts
│       │   ├── app.ts
│       │   └── server.ts
│       ├── drizzle/migrations/
│       ├── drizzle.config.ts
│       └── package.json
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
| M03 | Key management — RSA/EC generation, AES-256-GCM encryption, JWKS, rotation | ✅ Complete |
| M04 | User management — registration, login, Argon2, profiles | 🔜 Next |
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
| Cache | Redis Cloud via ioredis | Sessions, tokens, key cache |
| Document store | MongoDB Atlas | Audit logs |
| Validation | Zod | Env config + request validation |
| Logging | Pino + pino-pretty | Structured JSON logs |
| Testing | Vitest | Unit + integration tests |
| Crypto | Node.js built-in `crypto` | RSA/EC key generation |
| Key encryption | AES-256-GCM + scrypt | Private key encryption at rest |
| JWK conversion | jose | Public key → JWK format for JWKS |
| OIDC / OAuth | oidc-provider | OIDC spec (M06) |
| SAML | samlify | SAML 2.0 (M07) |

---

## Troubleshooting

| Error | Cause | Fix |
|---|---|---|
| `❌ Invalid environment variables` | `.env` missing or incomplete | Ensure all vars set including `ADMIN_API_KEY` |
| `getConfig() called before loadConfig()` | Import order issue | Logger reads `process.env` directly — ensure server.ts calls `loadConfig()` first |
| `Redis max retries reached` | Wrong `REDIS_URL` | Use `rediss://` (double s) from Redis Cloud |
| `MongoDB not connected` | Wrong URI or IP not whitelisted | Check Atlas Network Access |
| `401` on admin routes | Wrong `ADMIN_API_KEY` | Use exact value from `.env` — no quotes, no spaces around `=` |
| `409 Conflict` on key generate | Key already exists | Use `/rotate` to replace |
| `isOk is not a function` | Stale tsx module cache | Stop server, `rm -rf node_modules/.cache`, restart |
| Drizzle array default error | Drizzle 0.30 bug | Apply SQL via Supabase SQL Editor |

---

## License

MIT — see [LICENSE](./LICENSE)