# auth.sgummalla.net

A custom Identity Provider (IDP) supporting SAML 2.0, OIDC/OAuth 2.0, and JWT certificate-based authentication — built for SSO across multiple applications.

## Quick Start

```bash
git clone https://github.com/sgummalla79/auth.sgummalla.net.git
cd auth.sgummalla.net/auth-idp
pnpm install
cp apps/api/.env.example apps/api/.env   # fill in all values
cp apps/admin/.env.example apps/admin/.env
pnpm dev                                  # starts API on :3000
pnpm dev:admin                            # starts admin dashboard on :3001
```

## Architecture

```
auth-idp/
├── apps/
│   ├── api/                 # Fastify API — all IDP endpoints
│   │   ├── src/
│   │   │   ├── shared/      # Config, logger, DI container, Result type
│   │   │   ├── infrastructure/  # Postgres, Redis, MongoDB clients
│   │   │   └── modules/
│   │   │       ├── keys/          # M03 — RSA/EC generation, AES encryption, JWKS, rotation
│   │   │       ├── users/         # M04 — Registration, login, profiles, sessions
│   │   │       ├── applications/  # M05 — App registry (SAML/OIDC/JWT)
│   │   │       ├── oidc/          # M06 — oidc-provider, Redis adapter, PKCE
│   │   │       ├── saml/          # M07 — IDP metadata, SSO, SLO, signed assertions
│   │   │       ├── jwt-auth/      # M08 — RFC 7523 client assertions, mTLS
│   │   │       ├── mfa/           # M09 — TOTP, backup codes
│   │   │       ├── sessions/      # M10 — SSO session tracking, SLO fanout
│   │   │       └── audit/         # M11 — BullMQ queue, MongoDB event store
│   │   └── drizzle/migrations/
│   └── admin/               # M12 — Next.js 15 admin dashboard
│       ├── src/app/
│       │   ├── login/             # Admin key auth
│       │   ├── dashboard/         # Overview cards + recent events
│       │   ├── applications/      # App registry CRUD
│       │   ├── users/             # User search, detail, MFA status
│       │   ├── keys/              # Key status + rotation
│       │   └── audit/             # Filterable event log
│       └── src/lib/               # API client, auth helpers
├── packages/types/
├── tsconfig.base.json
└── pnpm-workspace.yaml
```

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
| **M12** | **Admin dashboard — Next.js 15** | **🔧 In Progress** |
| M12a | Project setup + layout, sidebar nav, admin key auth, health page | ✅ Complete |
| M12b | Key & application management — status card, rotate, register apps | ✅ Complete |
| M12c | User management — search, detail view, MFA status, force-logout | ✅ Complete |
| M12d | Audit log viewer — filterable, paginated table, event detail | 🔜 Next |
| M12e | Dashboard overview — summary cards, recent events feed | ⏳ Pending |
| M13 | Deployment — Fly.io config, secrets, health checks, SP integration | ⏳ Pending |

## API Endpoints

### Authentication

| Method | Path | Auth | Purpose |
|---|---|---|---|
| `POST` | `/auth/register` | Public | Create account |
| `POST` | `/auth/login` | Public | Login, get session token |
| `POST` | `/auth/logout` | Session | Logout |
| `GET` | `/auth/me` | Session | Get current user profile |
| `PATCH` | `/auth/me` | Session | Update profile |

### Key Management

| Method | Path | Auth | Purpose |
|---|---|---|---|
| `GET` | `/.well-known/jwks.json` | Public | JWKS public keys |
| `POST` | `/api/v1/admin/keys/generate` | Admin | Generate signing key |
| `POST` | `/api/v1/admin/keys/rotate` | Admin | Rotate signing key |

### Application Registry

| Method | Path | Auth | Purpose |
|---|---|---|---|
| `POST` | `/api/v1/admin/applications` | Admin | Register SAML/OIDC/JWT app |
| `GET` | `/api/v1/admin/applications` | Admin | List all apps |
| `GET` | `/api/v1/admin/applications/:id` | Admin | Get app with protocol config |
| `PATCH` | `/api/v1/admin/applications/:id` | Admin | Update app |

### User Management (Admin)

| Method | Path | Auth | Purpose |
|---|---|---|---|
| `GET` | `/api/v1/admin/users` | Admin | List/search users |
| `GET` | `/api/v1/admin/users/:id` | Admin | User detail with profile + MFA |

### OIDC / OAuth 2.0

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

### SAML 2.0

| Endpoint | Purpose |
|---|---|
| `GET /saml/:appId/metadata` | IDP metadata XML |
| `POST /saml/:appId/sso` | SSO entry point |
| `POST /saml/:appId/sso/login` | Credential submit during SSO |
| `POST /saml/:appId/slo` | Single Logout |

### JWT / Certificate Auth

| Endpoint | Purpose |
|---|---|
| `POST /auth/token/jwt-assertion` | RFC 7523 client assertion |
| `POST /auth/token/mtls` | mTLS certificate auth |

### MFA

| Endpoint | Auth | Purpose |
|---|---|---|
| `GET /auth/mfa/status` | Session | Check MFA enrollment |
| `POST /auth/mfa/totp/setup` | Session | Generate TOTP secret |
| `POST /auth/mfa/totp/verify` | Session | Verify and activate MFA |
| `POST /auth/mfa/totp/validate` | Session | Validate code during login |
| `POST /auth/mfa/backup-codes/generate` | Session | Generate backup codes |
| `POST /auth/mfa/backup-codes/use` | Session | Consume backup code |

### Session Management

| Endpoint | Auth | Purpose |
|---|---|---|
| `GET /auth/sessions` | Session | List active SSO sessions |
| `DELETE /auth/sessions/:id` | Session | Revoke specific session |
| `DELETE /auth/sessions` | Session | Revoke all (global logout) |
| `POST /api/v1/admin/sessions/revoke/:userId` | Admin | Force-logout user |

### Audit Logging

| Endpoint | Auth | Purpose |
|---|---|---|
| `GET /api/v1/admin/audit` | Admin | Query audit events |
| `GET /api/v1/admin/audit/:id` | Admin | Get event detail |

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
| SAML 2.0 | samlify + node-forge | IDP metadata, SSO, SLO |
| JWT signing | jose | JWK export, SPKI import, SignJWT |
| Key crypto | Node.js crypto (built-in) | RSA/EC generation, AES-256-GCM |
| TOTP | speakeasy | TOTP generation and verification |
| Admin UI | Next.js 15 + Tailwind CSS | Admin dashboard |
| Deployment | Fly.io | API + admin hosting |

## Admin Dashboard

The admin dashboard runs on `http://localhost:3001` and provides:

- **Login** — authenticates with `ADMIN_API_KEY` stored in httpOnly cookie
- **Keys** — view active signing key, rotate with confirmation
- **Applications** — list, register (SAML/OIDC/JWT), view detail
- **Users** — search by email/status, view profile + MFA factors, force-logout
- **Audit Log** — coming in M12d
- **Dashboard Overview** — coming in M12e
- **Dark/Light mode** — toggle in sidebar, respects system preference

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
| Session `DATABASE_ERROR` on admin revoke | `userId` must be a valid UUID |
| Audit events not appearing | BullMQ is async — wait 2s after action before querying |
| BullMQ eviction warning | Set Redis eviction policy to `noeviction` in Redis Cloud settings |
| Admin dashboard login fails | Ensure `API_BASE_URL` in `apps/admin/.env` matches running API |
| Health page shows unreachable | API must be running on port 3000 |

## License

MIT — see [LICENSE](./LICENSE)