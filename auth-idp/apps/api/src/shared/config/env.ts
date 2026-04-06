import { z } from 'zod'

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().min(1).max(65535).default(3000),
  HOST: z.string().default('0.0.0.0'),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace']).default('info'),
  DATABASE_URL: z.string().url(),
  DATABASE_URL_DIRECT: z.string().url(),
  REDIS_URL: z.string().url(),
  MONGODB_URI: z.string().min(1),
  MONGODB_DB_NAME: z.string().min(1).default('idp_audit'),
  IDP_ISSUER: z.string().url(),
  IDP_BASE_URL: z.string().url(),
  KEY_ENCRYPTION_SECRET: z.string().min(32),
  COOKIE_SECRET: z.string().min(32),
  ADMIN_API_KEY: z.string().min(32),   // ← add this line
})

export type Env = z.infer<typeof envSchema>

let _env: Env | null = null

export function loadConfig(): Env {
  if (_env) return _env
  const result = envSchema.safeParse(process.env)
  if (!result.success) {
    const issues = result.error.issues.map((i) => `  [${i.path.join('.')}] ${i.message}`)
    console.error(`\n❌ Invalid environment variables:\n${issues.join('\n')}\n`)
    process.exit(1)
  }
  _env = result.data
  return _env
}

export function getConfig(): Env {
  if (!_env) throw new Error('getConfig() called before loadConfig()')
  return _env
}