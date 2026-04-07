function required(key: string): string {
  const val = process.env[key]
  if (!val) throw new Error(`Missing env var: ${key}`)
  return val
}

export const env = {
  API_BASE_URL: required('API_BASE_URL'),
  COOKIE_SECRET: required('COOKIE_SECRET'),
}