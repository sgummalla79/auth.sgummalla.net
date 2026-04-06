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
- [Application Registry](#application-registry)
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

Every external system is behind an interface. Swap any adapter by changing one line in the Awilix DI container.

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
sudo apt-get install jq  # Ubuntu / Debian
```

---

## External Services Setup

### Supabase (Postgres)

1. [supabase.com](https://supabase.com) → New project
2. **Project Settings → Database → Connection string**
3. **Transaction** mode URI (port **6543**) → `DATABASE_URL`
4. **Session** mode URI (port **5432**) → `DATABASE_URL_DIRECT`

### Redis Cloud

1. [redis.io/cloud](https://redis.io/cloud) → New database (free tier)
2. **Connect** → copy `rediss://` URL → `REDIS_URL`

> Must use `rediss://` (double s = TLS).

### MongoDB Atlas

1. [mongodb.com/atlas](https://www.mongodb.com/atlas) → New cluster (free M0)
2. **Database Access** → Add user
3. **Network Access** → Add IP
4. **Connect** → Drivers → Node.js → `MONGODB_URI`

---

## Project Setup

```bash
git clone https://github.com/sgummalla79/auth.sgummalla.net.git
cd auth.sgummalla.net/auth-idp
pnpm install
cp apps/api/.env.example apps/api/.env
```

---

## Environment Configuration

`apps/api/.env`:

```env
# Runtime
NODE_ENV=development
PORT=3000
HOST=0.0.0.0
LOG_LEVEL=debug

# Supabase — port 6543 for queries, port 5432 for schema inspection
DATABASE_URL=postgresql://postgres.YOURREF:PASSWORD@aws-0-us-east-1.pooler.supabase.com:6543/postgres
DATABASE_URL_DIRECT=postgresql://postgres.YOURREF:PASSWORD@aws-0-us-east-1.pooler.supabase.com:5432/postgres

# Redis Cloud — must use rediss:// (TLS)
REDIS_URL=rediss://default:PASSWORD@redis-XXXXX.redis-cloud.com:PORT

# MongoDB Atlas
MONGODB_URI=mongodb+srv://USER:PASSWORD@cluster0.XXXXX.mongodb.net/?retryWrites=true&w=majority
MONGODB_DB_NAME=idp_audit

# IDP Identity
IDP_ISSUER=http://localhost:3000
IDP_BASE_URL=http://localhost:3000

# Secrets — generate each with the command below
KEY_ENCRYPTION_SECRET=GENERATE_THIS
COOKIE_SECRET=GENERATE_THIS
ADMIN_API_KEY=GENERATE_THIS
```

---

## Generate Secrets

Run **three times** — one value per secret:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

> No quotes. No spaces around `=`. Never commit `.env`.

---

## Running the Project

```bash
pnpm dev         # development with hot reload
pnpm build       # production build
pnpm start       # run built output
pnpm test        # run all tests
```

On startup the server auto-generates an RSA-2048 signing key if none exists.

---

## Testing with cURL

### Health & infrastructure

```bash
# All three data stores
curl http://localhost:3000/health | jq

# Readiness probe
curl http://localhost:3000/ready

# JWKS — public signing key for SPs
curl http://localhost:3000/.well-known/jwks.json | jq
```

### User auth flow

```bash
# Register
curl -s -X POST http://localhost:3000/auth/register \
  -H "Content-Type: application/json" \
  -d '{"email":"alice@example.com","password":"Password1","givenName":"Alice","familyName":"Smith"}' | jq

# Login — save the sessionToken
curl -s -X POST http://localhost:3000/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"alice@example.com","password":"Password1"}' | jq

# Get profile (replace TOKEN)
curl -s http://localhost:3000/auth/me \
  -H "Authorization: Bearer TOKEN" | jq

# Update profile
curl -s -X PATCH http://localhost:3000/auth/me \
  -H "Authorization: Bearer TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"displayName":"Alice S.","locale":"en-US"}' | jq

# Logout
curl -s -X POST http://localhost:3000/auth/logout \
  -H "Authorization: Bearer TOKEN" | jq
```

### Application registry (replace ADMIN_KEY)

```bash
# Register a SAML app
curl -s -X POST http://localhost:3000/api/v1/admin/applications \
  -H "Authorization: Bearer ADMIN_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "protocol": "saml",
    "name": "Salesforce CRM",
    "saml": {
      "entityId": "https://salesforce.example.com/saml/metadata",
      "acsUrl": "https://salesforce.example.com/saml/acs"
    }
  }' | jq

# Register an OIDC app — save clientSecret from response
curl -s -X POST http://localhost:3000/api/v1/admin/applications \
  -H "Authorization: Bearer ADMIN_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "protocol": "oidc",
    "name": "Internal Portal",
    "oidc": {
      "redirectUris": ["https://portal.example.com/callback"],
      "scopes": ["openid", "profile", "email"]
    }
  }' | jq

# Register a JWT app
curl -s -X POST http://localhost:3000/api/v1/admin/applications \
  -H "Authorization: Bearer ADMIN_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "protocol": "jwt",
    "name": "Data Pipeline API",
    "jwt": { "audience": ["https://api.example.com"], "tokenLifetime": 3600 }
  }' | jq

# List all apps
curl -s http://localhost:3000/api/v1/admin/applications \
  -H "Authorization: Bearer ADMIN_KEY" | jq

# Get one app (replace APP_ID)
curl -s http://localhost:3000/api/v1/admin/applications/APP_ID \
  -H "Authorization: Bearer ADMIN_KEY" | jq

# Update app status
curl -s -X PATCH http://localhost:3000/api/v1/admin/applications/APP_ID \
  -H "Authorization: Bearer ADMIN_KEY" \
  -H "Content-Type: application/json" \
  -d '{"status": "inactive"}' | jq
```

### Key management

```bash
# Rotate signing key
curl -s -X POST http://localhost:3000/api/v1/admin/keys/rotate \
  -H "Authorization: Bearer ADMIN_KEY" \
  -H "Content-Type: application/json" \
  -d '{}' | jq
```

### Error cases

```bash
# Weak password — 422
curl -s -X POST http://localhost:3000/auth/register \
  -H "Content-Type: application/json" \
  -d '{"email":"bob@example.com","password":"weak"}' | jq

# Duplicate app name — 409
curl -s -X POST http://localhost:3000/api/v1/admin/applications \
  -H "Authorization: Bearer ADMIN_KEY" \
  -H "Content-Type: application/json" \
  -d '{"protocol":"saml","name":"Salesforce CRM","saml":{"entityId":"https://other.com","acsUrl":"https://other.com/acs"}}' | jq

# Missing auth — 401
curl -s http://localhost:3000/auth/me | jq
```

---

## Database Schema

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

- **Private keys encrypted at rest** — AES-256-GCM, key derived from `KEY_ENCRYPTION_SECRET` via scrypt
- **Passwords hashed with Argon2id** — 64MB memory, 3 iterations, 4 parallelism (OWASP 2024)
- **OIDC client secrets hashed** — Argon2id, plaintext shown once at registration, never stored
- **Account lockout** — 5 failed attempts locks for 15 minutes
- **SLO tracking** — `sso_sessions.participating_app_ids` for Single Logout propagation
- **Key rotation lifecycle** — `active → rotating → retired → revoked`
- **`updated_at` auto-trigger** — Postgres trigger on all mutable tables
- **RLS enabled** — Deny-all for `anon` and `authenticated` roles

---

## Schema Change Workflow

> Apply via Supabase SQL Editor — not `drizzle-kit migrate` (Drizzle 0.30 array default bug).

```bash
pnpm db:generate   # generate SQL diff
# fix array defaults manually if needed (see table below)
# paste into Supabase SQL Editor → Run
rm drizzle/migrations/*.sql && rm -rf drizzle/migrations/meta
```

| Broken (Drizzle generates) | Correct |
|---|---|
| `text[] DEFAULT  NOT NULL` | `text[] DEFAULT '{}' NOT NULL` |
| `text[] DEFAULT some_value NOT NULL` | `text[] DEFAULT ARRAY['some_value'] NOT NULL` |
| `"inet"` column type | `text` |

---

## Key Management

### Endpoints

| Method | Path | Auth | Purpose |
|---|---|---|---|
| `GET` | `/.well-known/jwks.json` | Public | Public signing keys for SPs |
| `POST` | `/api/v1/admin/keys/generate` | Admin | Generate initial key |
| `POST` | `/api/v1/admin/keys/rotate` | Admin | Rotate to new key |

### Key lifecycle

```
generated → active → (rotate) → retired → [stays in JWKS until tokens expire]
```

Rotate every 60–80 days. Retired keys stay in JWKS — never delete while tokens signed with them exist.

Supported algorithms: `RS256` (default), `RS384`, `RS512`, `ES256`, `ES384`, `ES512`

---

## Application Registry

### Endpoints

| Method | Path | Auth | Purpose |
|---|---|---|---|
| `POST` | `/api/v1/admin/applications` | Admin | Register SAML / OIDC / JWT app |
| `GET` | `/api/v1/admin/applications` | Admin | List all apps |
| `GET` | `/api/v1/admin/applications/:id` | Admin | Get app with protocol config |
| `PATCH` | `/api/v1/admin/applications/:id` | Admin | Update name, logo, status |

### Protocol-specific registration

**SAML** — provide `entityId`, `acsUrl`, optional `sloUrl` and `attributeMappings`. Response includes `idpMetadataUrl` to give to the SP.

**OIDC** — provide `redirectUris` (required). Response includes `clientId` and `clientSecret`. **Store `clientSecret` immediately — it is never shown again.**

**JWT** — provide `publicKey` (PEM) or `certThumbprint` for mTLS, plus `audience`. No secret needed — authentication is via signed client assertions.

### Slug generation

App names are converted to URL-safe slugs automatically:
- `"Salesforce CRM"` → `"salesforce-crm"`
- `"My App v2.0!"` → `"my-app-v20"`

Slugs must be unique — registering a duplicate name returns `409 Conflict`.

---

## Project Structure

```
auth-idp/apps/api/src/
├── shared/
│   ├── result/          # Result<T,E> — isOk()/isErr() as methods
│   ├── errors/          # AppError hierarchy (ValidationError, ConflictError, etc.)
│   ├── config/          # Zod env schema — all vars validated at startup
│   ├── logger/          # Pino — reads process.env directly
│   └── container/       # Awilix PROXY — Cradle type, buildContainer()
├── infrastructure/
│   ├── database/        # Drizzle + postgres (prepare:false for Supavisor)
│   ├── cache/           # ioredis + exponential backoff
│   └── mongo/           # MongoDB Atlas + TTL indexes
├── database/
│   └── index.ts         # Single re-export for all Drizzle schemas
└── modules/
    ├── keys/            # M03 — RSA generation, AES encryption, JWKS, rotation
    ├── users/           # M04 — Registration, login, Argon2id, sessions, profiles
    └── applications/    # M05 — App registry, SAML/OIDC/JWT config, slug + credentials
        ├── domain/      # Application, SamlConfig, OidcClient, JwtConfig
        ├── application/ # RegisterApplication, GetApplication, List, Update
        ├── infrastructure/ # SupabaseRepo, SlugGenerator, CredentialGenerator
        └── interface/   # ApplicationRoutes
```

---

## Module Status

| Module | Description | Status |
|---|---|---|
| M01 | Project foundation — monorepo, shared kernel, DB connections | ✅ Complete |
| M02 | Database schema — 9 tables, indexes, RLS, triggers | ✅ Complete |
| M03 | Key management — RSA/EC generation, AES-256-GCM, JWKS, rotation | ✅ Complete |
| M04 | User management — registration, login, Argon2id, profiles, sessions | ✅ Complete |
| M05 | Application registry — SAML / OIDC / JWT app registration | ✅ Complete |
| M06 | OIDC / OAuth 2.0 — oidc-provider, all discovery endpoints | 🔜 Next |
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
| HTTP | Fastify 4 | API server |
| DI | Awilix (PROXY mode) | Dependency injection |
| Database | Supabase (Postgres) + Drizzle ORM | Application data |
| Cache | Redis Cloud + ioredis | Sessions, tokens, key cache |
| Documents | MongoDB Atlas | Audit logs |
| Validation | Zod | Env + request validation |
| Logging | Pino + pino-pretty | Structured JSON |
| Testing | Vitest | Unit tests with mocked ports |
| Crypto | Node.js `crypto` | RSA/EC key generation |
| Key encryption | AES-256-GCM + scrypt | Private keys at rest |
| Password hashing | Argon2id | User passwords + OIDC secrets |
| JWK conversion | jose | JWKS endpoint |
| OIDC / OAuth | oidc-provider | M06 |
| SAML | samlify | M07 |

---

## Troubleshooting

| Error | Fix |
|---|---|
| `❌ Invalid environment variables` | All vars required — check `ADMIN_API_KEY` is set, no quotes |
| `401` on admin routes | Exact value from `.env` — no quotes, no spaces around `=` |
| `401` on `/auth/me` | Pass `Authorization: Bearer TOKEN` from login response |
| `409` on register | Email or app name already exists |
| `422` on register | Password: 8+ chars, uppercase, lowercase, number |
| `422` on app register | Check `entityId`/`acsUrl` are valid URLs for SAML; `redirectUris` non-empty array for OIDC |
| `409` on key generate | Use `/rotate` — key already exists from bootstrap |
| `isOk is not a function` | Stop server, `rm -rf node_modules/.cache`, restart |
| Drizzle array default error | Apply SQL via Supabase SQL Editor |
| `Redis max retries` | Wrong `REDIS_URL` — use `rediss://` from Redis Cloud |
| `MongoDB not connected` | Check Atlas Network Access — add your IP |

---

## License

MIT — see [LICENSE](./LICENSE)