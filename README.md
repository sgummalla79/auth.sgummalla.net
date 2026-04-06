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
- [OIDC / OAuth 2.0](#oidc--oauth-20)
- [SAML 2.0](#saml-20)
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

Install via [nvm](https://github.com/nvm-sh/nvm) (recommended):

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
brew install jq        # macOS
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
# fill in .env — see Environment Configuration below
```

---

## Environment Configuration

```env
# Server
NODE_ENV=development
PORT=3000
LOG_LEVEL=info
IDP_BASE_URL=http://localhost:3000

# Database
DATABASE_URL=postgresql://postgres.[ref]:[password]@aws-0-[region].pooler.supabase.com:6543/postgres
DATABASE_URL_DIRECT=postgresql://postgres.[ref]:[password]@aws-0-[region].pooler.supabase.com:5432/postgres

# Redis
REDIS_URL=rediss://:[password]@[host]:[port]

# MongoDB
MONGODB_URI=mongodb+srv://[user]:[password]@[cluster].mongodb.net/auth_idp

# Secrets
ADMIN_API_KEY=        # generate below
COOKIE_SECRET=        # generate below
KEY_ENCRYPTION_SECRET=  # generate below
```

## Generate Secrets

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

Run three times — one value each for `ADMIN_API_KEY`, `COOKIE_SECRET`, `KEY_ENCRYPTION_SECRET`.

---

## Running the Project

```bash
cd apps/api
pnpm dev
```

Expected startup output:
```
INFO: Postgres client initialized
INFO: Redis connected
INFO: MongoDB connected
INFO: Signing key bootstrapped
INFO: OIDC provider mounted
INFO: SAML 2.0 module registered
INFO: Server listening on port 3000
```

---

## Testing with cURL

### Health check

```bash
curl -s http://localhost:3000/health | jq
```

### Register a user

```bash
curl -s -X POST http://localhost:3000/auth/register \
  -H "Content-Type: application/json" \
  -d '{"email":"alice@example.com","password":"Password1"}' | jq
```

### Login

```bash
export SESSION=$(curl -s -X POST http://localhost:3000/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"alice@example.com","password":"Password1"}' | jq -r '.sessionToken')
```

### Get profile

```bash
curl -s http://localhost:3000/auth/me \
  -H "Authorization: Bearer $SESSION" | jq
```

### Logout

```bash
curl -s -X POST http://localhost:3000/auth/logout \
  -H "Authorization: Bearer $SESSION" | jq
```

---

## Database Schema

9 tables — applied via Supabase SQL Editor:

| Table | Purpose |
|---|---|
| `signing_keys` | RSA/EC key pairs (private key AES-256-GCM encrypted) |
| `users` | Accounts — email, Argon2id hash, status, lockout |
| `user_profiles` | OIDC claims — name, picture, locale, custom attributes |
| `applications` | Registered SPs — SAML, OIDC, JWT |
| `saml_configs` | Per-app SAML config — entityId, ACS URL, attributeMappings |
| `oidc_clients` | Per-app OIDC config — clientId, redirect URIs, grant types |
| `jwt_configs` | Per-app JWT config — public key, audience, token lifetime |
| `sso_sessions` | Active SSO sessions (M10) |
| `audit_logs` | Immutable audit trail (M11) |

### Schema Change Workflow

Drizzle Kit generates SQL diffs — apply manually via Supabase SQL Editor:

```bash
cd apps/api
pnpm drizzle-kit generate
# Copy generated SQL from drizzle/migrations/
# Paste into Supabase → SQL Editor → Run
```

---

## Key Management

### Endpoints

| Method | Path | Auth | Purpose |
|---|---|---|---|
| `POST` | `/api/v1/admin/keys/generate` | Admin | Generate new RSA key pair |
| `POST` | `/api/v1/admin/keys/rotate` | Admin | Rotate active key (old key → retired) |
| `GET` | `/.well-known/jwks.json` | Public | JWKS — public keys for token verification |

Keys are auto-bootstrapped at startup — no manual generation needed for development.

Retired keys stay in JWKS until all tokens signed with them expire. Never delete a key while tokens signed by it exist in the wild.

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

### Register a SAML app

```bash
curl -s -X POST http://localhost:3000/api/v1/admin/applications \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $ADMIN_KEY" \
  -d '{
    "name": "My SAML App",
    "protocol": "saml",
    "saml": {
      "entityId": "https://sp.example.com",
      "acsUrl": "https://sp.example.com/acs",
      "sloUrl": "https://sp.example.com/slo",
      "nameIdFormat": "urn:oasis:names:tc:SAML:1.1:nameid-format:emailAddress",
      "signAssertions": true,
      "attributeMappings": {
        "email": "http://schemas.xmlsoap.org/ws/2005/05/identity/claims/emailaddress",
        "given_name": "http://schemas.xmlsoap.org/ws/2005/05/identity/claims/givenname",
        "family_name": "http://schemas.xmlsoap.org/ws/2005/05/identity/claims/surname"
      }
    }
  }' | jq
```

### Register an OIDC app

```bash
curl -s -X POST http://localhost:3000/api/v1/admin/applications \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $ADMIN_KEY" \
  -d '{
    "name": "My OIDC App",
    "protocol": "oidc",
    "oidc": {
      "redirectUris": ["https://oauthdebugger.com/debug"],
      "grantTypes": ["authorization_code"],
      "scopes": ["openid","email","profile"]
    }
  }' | jq
```

**Store `clientSecret` immediately — it is never shown again.**

---

## OIDC / OAuth 2.0

### Discovery

```bash
curl http://localhost:3000/.well-known/openid-configuration | jq
```

### JWKS

```bash
curl http://localhost:3000/oidc/jwks | jq
```

### Authorization flow

Start with `GET /oidc/auth?client_id=...&redirect_uri=...&response_type=code&scope=openid email profile&code_challenge=...&code_challenge_method=S256`

Use [oauthdebugger.com](https://oauthdebugger.com) to generate a PKCE code challenge and run the full flow interactively.

### Token exchange

```bash
curl -s -X POST http://localhost:3000/oidc/token \
  -H "Content-Type: application/x-www-form-urlencoded" \
  -u "CLIENT_ID:CLIENT_SECRET" \
  -d "grant_type=authorization_code&code=AUTH_CODE&redirect_uri=REDIRECT_URI&code_verifier=PKCE_VERIFIER" | jq
```

---

## SAML 2.0

### IDP Metadata

```bash
curl -s http://localhost:3000/saml/$APP_ID/metadata
```

Give this URL to the SP so it can import the IDP configuration. The metadata includes the signing certificate, SSO endpoint, and SLO endpoint.

### SP-initiated SSO flow

1. SP generates an `AuthnRequest` and POSTs it to `POST /saml/:appId/sso`
2. If no IDP session exists, the user sees an inline login page
3. After successful login, the IDP POSTs a signed SAML Response to the SP's ACS URL
4. The SP validates the response and logs the user in

### Single Logout

SP sends a `LogoutRequest` to `POST /saml/:appId/slo`. The IDP terminates the session and POSTs a `LogoutResponse` back to the SP's SLO URL.

### Attribute mappings

Configured per-app in `samlConfig.attributeMappings`. Keys are internal claim names (`email`, `given_name`, `family_name`, `name`, `locale`); values are the SP-specific attribute name URIs.

---

## Project Structure

```
auth-idp/apps/api/src/
├── shared/
│   ├── result/          # Result<T,E> monad
│   ├── errors/          # AppError hierarchy
│   ├── config/          # Zod env schema
│   ├── logger/          # Pino structured logging
│   └── container/       # Awilix DI container
├── infrastructure/
│   ├── database/        # Drizzle + postgres
│   ├── cache/           # ioredis
│   └── mongo/           # MongoDB Atlas
├── database/
│   └── index.ts         # All Drizzle schema re-exports
└── modules/
    ├── keys/            # M03 — RSA/EC generation, AES-256-GCM, JWKS, rotation
    ├── users/           # M04 — Registration, login, Argon2id, sessions, profiles
    ├── applications/    # M05 — App registry, SAML/OIDC/JWT config, credentials
    ├── oidc/            # M06 — oidc-provider, Redis adapter, interactions
    └── saml/            # M07 — IDP metadata, SSO, SLO, samlify, assertions
        ├── domain/      # SamlAssertion value object
        ├── application/ # GetIdpMetadata, HandleSsoRequest, HandleSloRequest
        ├── infrastructure/ # SamlifyIdpService, ForgeSamlCertificateService, RedisSamlStateStore
        └── interface/   # SamlRoutes — metadata, sso, sso/login, slo
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
| M08 | JWT / cert auth — client assertions RFC 7523, mTLS | 🔜 Next |
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
| Document store | MongoDB Atlas | Audit logs (M11) |
| Validation | Zod | Env config + request schemas |
| Logging | Pino + pino-pretty | Structured JSON logging |
| Password hashing | Argon2id | OWASP-recommended parameters |
| OIDC / OAuth 2.0 | oidc-provider | Full spec compliance |
| SAML 2.0 | samlify + node-forge | IDP metadata, SSO, SLO, signed assertions |
| JWT signing | jose | JWK export, SPKI import |
| Key crypto | Node.js crypto (built-in) | RSA/EC generation, AES-256-GCM |

---

## Troubleshooting

| Error | Fix |
|---|---|
| `❌ Invalid environment variables` | All vars in `.env` must be set — no empty values |
| `Redis max retries reached` | Use `rediss://` (double s) from Redis Cloud |
| `MongoDB not connected` | Check Atlas Network Access — add your IP |
| `401` on admin routes | Exact `ADMIN_API_KEY` value — no quotes, no spaces |
| `409` on key generate | Key already exists — use `/rotate` |
| `Startup failed: isOk is not a function` | `rm -rf node_modules/.cache` and restart |
| SP rejects SAML assertion | Import IDP cert from `/saml/:id/metadata` into SP trusted certs |
| SAML login session expired | 30-minute nonce TTL — restart the flow from the SP |
| `invalid_client` on OIDC token | Wrong `client_secret` or PKCE verifier mismatch |
| `redirect_uri_mismatch` | Redirect URI must exactly match what was registered in M05 |

---

## License

MIT — see [LICENSE](./LICENSE)