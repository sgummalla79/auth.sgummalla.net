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
- [Testing OIDC Flow](#testing-oidc-flow)
- [Database Schema](#database-schema)
- [Schema Change Workflow](#schema-change-workflow)
- [Key Management](#key-management)
- [Application Registry](#application-registry)
- [OIDC / OAuth 2.0](#oidc--oauth-20)
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
curl http://localhost:3000/health | jq
curl http://localhost:3000/ready
curl http://localhost:3000/.well-known/jwks.json | jq
curl http://localhost:3000/.well-known/openid-configuration | jq
```

### User auth

```bash
# Register
curl -s -X POST http://localhost:3000/auth/register \
  -H "Content-Type: application/json" \
  -d '{"email":"alice@example.com","password":"Password1","givenName":"Alice","familyName":"Smith"}' | jq

# Login — save sessionToken
curl -s -X POST http://localhost:3000/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"alice@example.com","password":"Password1"}' | jq

# Profile
curl -s http://localhost:3000/auth/me \
  -H "Authorization: Bearer SESSION_TOKEN" | jq

# Update profile
curl -s -X PATCH http://localhost:3000/auth/me \
  -H "Authorization: Bearer SESSION_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"displayName":"Alice S.","locale":"en-US"}' | jq

# Logout
curl -s -X POST http://localhost:3000/auth/logout \
  -H "Authorization: Bearer SESSION_TOKEN" | jq
```

### Application registry

```bash
# Register SAML app
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

# Register OIDC app — save clientSecret
curl -s -X POST http://localhost:3000/api/v1/admin/applications \
  -H "Authorization: Bearer ADMIN_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "protocol": "oidc",
    "name": "Internal Portal",
    "oidc": {
      "redirectUris": ["http://localhost:9999/callback"],
      "scopes": ["openid", "email", "profile"]
    }
  }' | jq

# List apps
curl -s http://localhost:3000/api/v1/admin/applications \
  -H "Authorization: Bearer ADMIN_KEY" | jq '.applications[] | {id,name,protocol}'

# Get one app
curl -s http://localhost:3000/api/v1/admin/applications/APP_ID \
  -H "Authorization: Bearer ADMIN_KEY" | jq
```

### Key management

```bash
# Rotate signing key
curl -s -X POST http://localhost:3000/api/v1/admin/keys/rotate \
  -H "Authorization: Bearer ADMIN_KEY" \
  -H "Content-Type: application/json" \
  -d '{}' | jq
```

---

## Testing OIDC Flow

Use the automated test script for the full authorization code flow:

```bash
# Full flow — registers a new OIDC app automatically
node apps/api/test-oidc-flow.mjs \
  --admin-key YOUR_ADMIN_KEY \
  --email alice@example.com \
  --password Password1

# Reuse an existing client
node apps/api/test-oidc-flow.mjs \
  --admin-key YOUR_ADMIN_KEY \
  --client-id client_your_existing_id \
  --email alice@example.com \
  --password Password1
```

The script runs all 9 steps automatically:
1. Health check
2. Register OIDC client (or use existing)
3. Start authorization flow (PKCE)
4. Get interaction prompt
5. Submit login credentials
6. Grant consent (auto)
7. Exchange code for tokens
8. Fetch user info
9. Introspect access token

### Manual OIDC endpoint tests

```bash
# Discovery document
curl http://localhost:3000/.well-known/openid-configuration | jq \
  '{issuer,authorization_endpoint,token_endpoint,userinfo_endpoint,jwks_uri}'

# JWKS
curl http://localhost:3000/oidc/jwks | jq '.keys[] | {kid,alg,kty,use}'

# UserInfo with access token
curl http://localhost:3000/oidc/userinfo \
  -H "Authorization: Bearer ACCESS_TOKEN" | jq

# Introspect token
curl -s -X POST http://localhost:3000/oidc/introspect \
  -H "Content-Type: application/x-www-form-urlencoded" \
  -u "CLIENT_ID:oidc_CLIENT_ID" \
  -d "token=ACCESS_TOKEN" | jq '{active,sub,client_id,exp}'
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
- **OIDC client secrets hashed** — Argon2id, plaintext shown once at registration only
- **Account lockout** — 5 failed attempts locks for 15 minutes
- **SLO tracking** — `sso_sessions.participating_app_ids` for Single Logout
- **Key rotation lifecycle** — `active → rotating → retired → revoked`
- **`updated_at` auto-trigger** — Postgres trigger on all mutable tables
- **RLS enabled** — Deny-all for `anon` and `authenticated` roles

---

## Schema Change Workflow

```bash
pnpm db:generate   # generate SQL diff
# fix array defaults if needed
# paste into Supabase SQL Editor → Run
rm drizzle/migrations/*.sql && rm -rf drizzle/migrations/meta
```

| Broken (Drizzle generates) | Correct |
|---|---|
| `text[] DEFAULT  NOT NULL` | `text[] DEFAULT '{}' NOT NULL` |
| `text[] DEFAULT some_value NOT NULL` | `text[] DEFAULT ARRAY['some_value'] NOT NULL` |

---

## Key Management

| Method | Path | Auth | Purpose |
|---|---|---|---|
| `GET` | `/.well-known/jwks.json` | Public | Public signing keys |
| `GET` | `/oidc/jwks` | Public | OIDC JWKS endpoint |
| `POST` | `/api/v1/admin/keys/generate` | Admin | Generate initial key |
| `POST` | `/api/v1/admin/keys/rotate` | Admin | Rotate to new key |

Rotate every 60–80 days. Retired keys stay in JWKS until all tokens signed with them expire.

---

## Application Registry

| Method | Path | Auth | Purpose |
|---|---|---|---|
| `POST` | `/api/v1/admin/applications` | Admin | Register SAML / OIDC / JWT app |
| `GET` | `/api/v1/admin/applications` | Admin | List all apps |
| `GET` | `/api/v1/admin/applications/:id` | Admin | Get app with protocol config |
| `PATCH` | `/api/v1/admin/applications/:id` | Admin | Update name, logo, status |

**OIDC client secret** — shown once at registration in `oidc.clientSecret`. Never retrievable again.

**Slug generation** — `"Salesforce CRM"` → `"salesforce-crm"`. Must be unique.

---

## OIDC / OAuth 2.0

Powered by `oidc-provider` v9. All endpoints are spec-compliant.

### Endpoints

| Method | Path | Purpose |
|---|---|---|
| `GET` | `/.well-known/openid-configuration` | Discovery document |
| `GET` | `/oidc/jwks` | JSON Web Key Set |
| `GET` | `/oidc/auth` | Authorization endpoint |
| `POST` | `/oidc/token` | Token endpoint |
| `GET` | `/oidc/userinfo` | User info endpoint |
| `POST` | `/oidc/introspect` | Token introspection |
| `POST` | `/oidc/revoke` | Token revocation |
| `GET` | `/oidc/end_session` | Logout |
| `GET` | `/oidc/interaction/:uid` | Login prompt details |
| `POST` | `/oidc/interaction/:uid/login` | Submit credentials |
| `POST` | `/oidc/interaction/:uid/confirm` | Grant consent |
| `POST` | `/oidc/interaction/:uid/abort` | Cancel login |

### Authorization code flow

```
SP → /oidc/auth?client_id=...&code_challenge=...
  → /oidc/interaction/:uid  (login prompt)
  → POST /oidc/interaction/:uid/login  (credentials)
  → POST /oidc/interaction/:uid/confirm  (consent — auto-granted)
  → SP callback?code=...
  → POST /oidc/token  (exchange code for tokens)
  → GET /oidc/userinfo  (get user claims)
```

### Client authentication

Clients use `client_secret_basic` (HTTP Basic Auth) at the token endpoint.
The secret format is `oidc_` + the `clientId`.

> This is a development-mode secret scheme. M08 will replace it with
> `private_key_jwt` client assertions for production security.

### Supported scopes and claims

| Scope | Claims returned |
|---|---|
| `openid` | `sub` |
| `email` | `email`, `email_verified` |
| `profile` | `name`, `given_name`, `family_name`, `picture`, `locale`, `zoneinfo` |

### PKCE

Required for all public clients. Use `S256` method:

```bash
# Generate verifier and challenge
node -e "
const crypto = require('crypto')
const v = crypto.randomBytes(32).toString('base64url')
const c = crypto.createHash('sha256').update(v).digest('base64url')
console.log('verifier:', v)
console.log('challenge:', c)
"
```

---

## Project Structure

```
auth-idp/apps/api/src/
├── shared/
│   ├── result/          # Result<T,E> monad
│   ├── errors/          # AppError hierarchy
│   ├── config/          # Zod env config
│   ├── logger/          # Pino logger
│   └── container/       # Awilix DI container
├── infrastructure/
│   ├── database/        # Drizzle + Supabase
│   ├── cache/           # ioredis
│   └── mongo/           # MongoDB Atlas
├── database/
│   └── index.ts         # Schema re-exports
└── modules/
    ├── keys/            # M03 — RSA keys, AES encryption, JWKS
    ├── users/           # M04 — Auth, profiles, sessions
    ├── applications/    # M05 — App registry, SAML/OIDC/JWT config
    └── oidc/            # M06 — oidc-provider, Redis adapter, interactions
        ├── adapter/     # OidcAdapter (Redis + DB client lookup)
        ├── config/      # OidcProvider.ts — full provider config
        └── interface/   # OidcInteractionRoutes.ts
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
| M06 | OIDC / OAuth 2.0 — oidc-provider, Redis adapter, full auth code flow | ✅ Complete |
| M07 | SAML 2.0 — IDP metadata, SSO flow, signed assertions | 🔜 Next |
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
| Cache | Redis Cloud + ioredis | Sessions, tokens, OIDC state |
| Documents | MongoDB Atlas | Audit logs |
| Validation | Zod | Env + request validation |
| Logging | Pino + pino-pretty | Structured JSON |
| Testing | Vitest | Unit tests with mocked ports |
| Crypto | Node.js `crypto` | RSA/EC key generation |
| Key encryption | AES-256-GCM + scrypt | Private keys at rest |
| Password hashing | Argon2id | User passwords |
| JWK conversion | jose | JWKS endpoint |
| OIDC / OAuth | oidc-provider v9 | Full OIDC spec implementation |
| SAML | samlify | M07 |

---

## Troubleshooting

| Error | Fix |
|---|---|
| `❌ Invalid environment variables` | All vars required — check `ADMIN_API_KEY` set, no quotes |
| `401` on admin routes | Exact value from `.env` — no quotes, no spaces |
| `401` on `/auth/me` | Pass `Authorization: Bearer TOKEN` from login |
| `409` on register | Email or app name already exists |
| `422` on register | Password: 8+ chars, uppercase, lowercase, number |
| `invalid_client` on OIDC | Client ID wrong or secret mismatch — secret is `oidc_` + clientId |
| `invalid_grant` on token | Code expired or already used — restart auth flow |
| `server_error` on token | Check server terminal for `OIDC SERVER ERROR` log |
| `INTERACTION_ERROR` | Cookie not sent — use cookie jar (`-c`/`-b` flags or the test script) |
| `isOk is not a function` | Stop server, `rm -rf node_modules/.cache`, restart |
| Drizzle array default error | Apply SQL via Supabase SQL Editor |

---

## License

MIT — see [LICENSE](./LICENSE)