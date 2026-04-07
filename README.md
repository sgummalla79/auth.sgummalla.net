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
- [JWT / Certificate Auth](#jwt--certificate-auth)
- [MFA](#mfa)
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

DATABASE_URL=postgresql://postgres.[ref]:[password]@aws-0-[region].pooler.supabase.com:6543/postgres
DATABASE_URL_DIRECT=postgresql://postgres.[ref]:[password]@aws-0-[region].pooler.supabase.com:5432/postgres

REDIS_URL=rediss://:[password]@[host]:[port]
MONGODB_URI=mongodb+srv://[user]:[password]@[cluster].mongodb.net/auth_idp

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
INFO: JWT / cert auth module registered
INFO: MFA module registered
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
| `users` | Accounts — email, Argon2id hash, status, lockout, MFA fields |
| `user_profiles` | OIDC claims — name, picture, locale, custom attributes |
| `applications` | Registered SPs — SAML, OIDC, JWT |
| `saml_configs` | Per-app SAML config — entityId, ACS URL, attributeMappings |
| `oidc_clients` | Per-app OIDC config — clientId, redirect URIs, grant types |
| `jwt_configs` | Per-app JWT config — public key, certThumbprint, audience |
| `sso_sessions` | Active SSO sessions (M10) |
| `audit_logs` | Immutable audit trail (M11) |

### Schema Change Workflow

```bash
cd apps/api
pnpm drizzle-kit generate
# Copy generated SQL → Supabase SQL Editor → Run
```

---

## Key Management

| Method | Path | Auth | Purpose |
|---|---|---|---|
| `POST` | `/api/v1/admin/keys/generate` | Admin | Generate new RSA key pair |
| `POST` | `/api/v1/admin/keys/rotate` | Admin | Rotate active key |
| `GET` | `/.well-known/jwks.json` | Public | JWKS public keys |

Keys are auto-bootstrapped at startup. Retired keys stay in JWKS until all tokens signed with them expire.

---

## Application Registry

| Method | Path | Auth | Purpose |
|---|---|---|---|
| `POST` | `/api/v1/admin/applications` | Admin | Register SAML / OIDC / JWT app |
| `GET` | `/api/v1/admin/applications` | Admin | List all apps |
| `GET` | `/api/v1/admin/applications/:id` | Admin | Get app with protocol config |
| `PATCH` | `/api/v1/admin/applications/:id` | Admin | Update app |

---

## OIDC / OAuth 2.0

| Endpoint | Purpose |
|---|---|
| `GET /.well-known/openid-configuration` | Discovery document |
| `GET /oidc/jwks` | JWKS |
| `GET /oidc/auth` | Authorization endpoint |
| `POST /oidc/token` | Token endpoint |
| `GET /oidc/userinfo` | User info |
| `POST /oidc/introspect` | Token introspection |
| `POST /oidc/revoke` | Token revocation |
| `GET /oidc/end_session` | Logout |

---

## SAML 2.0

| Endpoint | Purpose |
|---|---|
| `GET /saml/:appId/metadata` | IDP metadata XML |
| `POST /saml/:appId/sso` | SSO entry point |
| `POST /saml/:appId/sso/login` | Credential submit during SSO |
| `POST /saml/:appId/slo` | Single Logout |

---

## JWT / Certificate Auth

### RFC 7523 — Client Assertion

```bash
curl -s -X POST http://localhost:3000/auth/token/jwt-assertion \
  -H "Content-Type: application/x-www-form-urlencoded" \
  --data-urlencode "client_id=APP_ID" \
  --data-urlencode "client_assertion_type=urn:ietf:params:oauth:client-assertion-type:jwt-bearer" \
  --data-urlencode "client_assertion=SIGNED_JWT" | jq
```

### mTLS

```bash
curl -s -X POST http://localhost:3000/auth/token/mtls \
  -H "Content-Type: application/json" \
  -d '{"client_cert_pem": "-----BEGIN CERTIFICATE-----\n..."}' | jq
```

---

## MFA

| Endpoint | Auth | Purpose |
|---|---|---|
| `GET /auth/mfa/status` | Session | Check MFA enrollment status |
| `POST /auth/mfa/totp/setup` | Session | Generate TOTP secret + otpauth URI |
| `POST /auth/mfa/totp/verify` | Session | Verify first code and activate MFA |
| `POST /auth/mfa/totp/validate` | Session | Validate a code during login |
| `POST /auth/mfa/backup-codes/generate` | Session | Generate 10 single-use backup codes |
| `POST /auth/mfa/backup-codes/use` | Session | Consume a backup code during login |

TOTP secrets are encrypted at rest using the same AES-256-GCM key encryption service as signing keys. Backup codes are hashed with Argon2id — plaintext shown once only.

Generate TOTP codes for testing (run from `apps/api`):

```bash
node -e "const s=require('speakeasy'); console.log(s.totp({secret:'YOUR_SECRET',encoding:'base32'}))"
```

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
    ├── saml/            # M07 — IDP metadata, SSO, SLO, samlify, assertions
    ├── jwt/             # M08 — RFC 7523 client assertions, mTLS, token issuance
    └── mfa/             # M09 — TOTP (speakeasy), backup codes (Argon2id)
        ├── domain/      # MfaStatus, TotpSecret
        ├── application/ # SetupTotp, VerifyTotpSetup, ValidateTotp, BackupCodes, GetMfaStatus
        ├── infrastructure/ # OtplibTotpService (speakeasy), Argon2BackupCodeService, SupabaseMfaRepository
        └── interface/   # MfaRoutes
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
| M10 | Session management — SSO sessions, cross-app single logout | 🔜 Next |
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
| JWT signing | jose | JWK export, SPKI import, SignJWT |
| Key crypto | Node.js crypto (built-in) | RSA/EC generation, AES-256-GCM |
| Cert handling | node-forge | X.509 cert generation, thumbprint extraction |
| TOTP | speakeasy | TOTP generation and verification |

---

## Troubleshooting

| Error | Fix |
|---|---|
| `Invalid environment variables` | All vars in `.env` must be set |
| `Redis max retries reached` | Use `rediss://` (double s) from Redis Cloud |
| `MongoDB not connected` | Check Atlas Network Access — add your IP |
| `401` on admin routes | Exact `ADMIN_API_KEY` — no quotes, no spaces |
| `409` on key generate | Key exists — use `/rotate` |
| SP rejects SAML assertion | Import IDP cert from `/saml/:id/metadata` into SP trusted certs |
| `invalid_client` on OIDC token | Wrong `client_secret` or PKCE verifier mismatch |
| JWT assertion `UNAUTHORIZED` | `client_id` must be the app UUID, not the slug |
| mTLS thumbprint mismatch | Strip with `sed 's/.*Fingerprint=//;s/://g'` — no prefix, lowercase |
| TOTP always invalid | Clock skew — generate and submit within the same 30s window |
| MFA backup codes column error | Run the ALTER TABLE migration in Supabase SQL Editor first |

---

## License

MIT — see [LICENSE](./LICENSE)