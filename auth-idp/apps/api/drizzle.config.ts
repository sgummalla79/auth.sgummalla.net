import { defineConfig } from 'drizzle-kit'

export default defineConfig({
  schema: './src/database/index.ts',
  out: './drizzle/migrations',
  dialect: 'postgresql',
  dbCredentials: {
    url: process.env['DATABASE_URL_DIRECT'] as string,
  },
  verbose: true,
  strict: true,
})