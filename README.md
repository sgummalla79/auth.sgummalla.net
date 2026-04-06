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

# Supabase — port 6543 for queries, port 5432 for migrations
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

> No quotes around values. No spaces. Never commit `.env`.

---

## Running the Project

```bash
pnpm dev         # development with hot reload
pnpm build       # production build
pnpm start       # run built output
pnpm test        # run all tests
```

On startup the server auto-generates an RSA-2048 signing key if none exists:

```
No active signing key — generating initial RS256 key
Initial signing key generated  kid=key_a1b2c3d4
```

---

## Testing with cURL

### Health check

```bash
curl http://localhost:3000/health | jq
```

### JWKS — public signing key

```bash
curl http://localhost:3000/.well-known/jwks.json | jq
```

### Register a user

```bash
curl -s -X POST http://localhost:3000/auth/register \
  -H "Content-Type: application/json" \
  -d '{"email":"alice@example.com","password":"Password1","givenName":"Alice","familyName":"Smith"}' | jq
```

Expected `201`:
```json
{
  "id": "uuid",
  "email": "alice@example.com",
  "status": "pending_verification",
  "message": "Account created. Please verify your email."
}
```

### Login

```bash
curl -s -X POST http://localhost:3000/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"alice@example.com","password":"Password1"}' | jq
```

Expected `200`:
```json
{
  "sessionToken": "abc123...",
  "userId": "uuid",
  "email": "alice@example.com",
  "expiresAt": "2026-04-07T..."
}
```

### Get profile (replace TOKEN with sessionToken from login)

```bash
curl -s http://localhost:3000/auth/me \
  -H "Authorization: Bearer TOKEN" | jq
```

### Update profile

```bash
curl -s -X PATCH http://localhost:3000/auth/me \
  -H "Authorization: Bearer TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"displayName":"Alice S.","locale":"en-US"}' | jq
```

### Logout

```bash
curl -s -X POST http://localhost:3000/auth/logout \
  -H "Authorization: Bearer TOKEN" | jq
```

### Weak password — expect 422

```bash
curl -s -X POST http://localhost:3000/auth/register \
  -H "Content-Type: application/json" \
  -d '{"email":"bob@example.com","password":"weak"}' | jq
```

### Wrong password — expect 401

```bash
curl -s -X POST http://localhost:3000/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"alice@example.com","password":"WrongPassword1"}' | jq
```

### Admin — rotate signing key

```bash
curl -s -X POST http://localhost:3000/api/v1/admin/keys/rotate \
  -H "Authorization: Bearer YOUR_ADMIN_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{}' | jq
```

### Unauthorized admin — expect 401

```bash
curl -s -X POST http://localhost:3000/api/v1/admin/keys/rotate \
  -H "Authorization: Bearer wrongkey" | jq
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
- **Client secrets hashed** — Argon2id, plaintext returned once at registration only
- **Account lockout** — 5 failed attempts locks for 15 minutes
- **SLO tracking** — `sso_sessions.participating_app_ids` for Single Logout
- **Key rotation lifecycle** — `active → rotating → retired → revoked`
- **`updated_at` auto-trigger** — Postgres trigger on all mutable tables
- **RLS enabled** — Deny-all for `anon` and `authenticated` roles

---

## Schema Change Workflow

> Apply via Supabase SQL Editor — not `drizzle-kit migrate` (Drizzle 0.30 array default bug).

```bash
pnpm db:generate          # generate SQL diff
# fix array defaults manually (see table below)
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
| `GET` | `/.well-known/jwks.json` | Public | Get public signing keys |
| `POST` | `/api/v1/admin/keys/generate` | Admin API key | Generate initial key |
| `POST` | `/api/v1/admin/keys/rotate` | Admin API key | Rotate to new key |

### Key lifecycle

```
generated → active → (rotate) → retired → [stays in JWKS until tokens expire]
```

### Rotation recommendations

- Rotate every 60–80 days (default expiry is 90 days)
- Retired keys stay in JWKS — never delete while tokens signed with them exist

### Supported algorithms

`RS256` (default), `RS384`, `RS512`, `ES256`, `ES384`, `ES512`

---

## Project Structure

```
auth-idp/
├── apps/api/src/
│   ├── shared/
│   │   ├── result/          # Result<T,E> — isOk()/isErr() as methods
│   │   ├── errors/          # AppError hierarchy
│   │   ├── config/          # Zod env schema — all vars validated at startup
│   │   ├── logger/          # Pino — reads process.env directly
│   │   └── container/       # Awilix PROXY — Cradle type, buildContainer()
│   ├── infrastructure/
│   │   ├── database/        # Drizzle + postgres (prepare:false for Supavisor)
│   │   ├── cache/           # ioredis + exponential backoff retry
│   │   └── mongo/           # MongoDB Atlas + TTL indexes
│   ├── database/
│   │   └── index.ts         # Single re-export for all Drizzle schemas
│   └── modules/
│       ├── keys/            # M03 — RSA generation, AES encryption, JWKS, rotation
│       │   ├── domain/SigningKey.ts
│       │   ├── application/{ports,use-cases}
│       │   ├── infrastructure/{NodeCrypto,Aes,Supabase,Redis}
│       │   └── interface/{KeyRoutes,KeyDTOs}
│       └── users/           # M04 — Registration, login, profile, sessions
│           ├── domain/{User,UserProfile}
│           ├── application/{ports,use-cases}
│           ├── infrastructure/{Argon2,RedisSession,SupabaseUser}
│           └── interface/{UserRoutes,AuthMiddleware}
```

---

## Module Status

| Module | Description | Status |
|---|---|---|
| M01 | Project foundation — monorepo, shared kernel, DB connections | ✅ Complete |
| M02 | Database schema — 9 tables, indexes, RLS, triggers | ✅ Complete |
| M03 | Key management — RSA/EC generation, AES-256-GCM, JWKS, rotation | ✅ Complete |
| M04 | User management — registration, login, Argon2id, profiles, sessions | ✅ Complete |
| M05 | Application registry — register SAML / OIDC / JWT apps | 🔜 Next |
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
| HTTP | Fastify 4 | API server |
| DI | Awilix (PROXY mode) | Dependency injection |
| Database | Supabase (Postgres) + Drizzle ORM | Application data |
| Cache | Redis Cloud + ioredis | Sessions, tokens, key cache |
| Documents | MongoDB Atlas | Audit logs |
| Validation | Zod | Env + request validation |
| Logging | Pino + pino-pretty | Structured JSON |
| Testing | Vitest | Unit tests (mocked ports) |
| Crypto | Node.js `crypto` | RSA/EC key generation |
| Key encryption | AES-256-GCM + scrypt | Private keys at rest |
| Password hashing | Argon2id | User passwords |
| JWK conversion | jose | JWKS endpoint |
| OIDC / OAuth | oidc-provider | M06 |
| SAML | samlify | M07 |

---

## Troubleshooting

| Error | Fix |
|---|---|
| `❌ Invalid environment variables` | All vars required — check `ADMIN_API_KEY` is set |
| `401` on admin routes | Exact value from `.env` — no quotes, no spaces around `=` |
| `401` on `/auth/me` | Pass `Authorization: Bearer TOKEN` from login response |
| `409` on register | Email already exists — use different email |
| `422` on register | Password needs 8+ chars, uppercase, lowercase, number |
| `409` on key generate | Use `/rotate` — key already exists from bootstrap |
| `isOk is not a function` | Stop server, `rm -rf node_modules/.cache`, restart |
| Drizzle array default error | Apply SQL via Supabase SQL Editor |
| `Redis max retries` | Wrong `REDIS_URL` — use `rediss://` from Redis Cloud |
| `MongoDB not connected` | Check Atlas Network Access — add your IP |

---

## License

MIT — see [LICENSE](./LICENSE)