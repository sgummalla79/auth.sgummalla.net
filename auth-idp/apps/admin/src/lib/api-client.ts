import { cookies } from 'next/headers'
import { env } from './env'

export class ApiError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
  ) {
    super(message)
    this.name = 'ApiError'
  }
}

export async function apiFetch<T = unknown>(
  path: string,
  options: RequestInit = {},
): Promise<T> {
  const cookieStore = await cookies()
  const adminKey = cookieStore.get('admin_key')?.value

  const res = await fetch(`${env.API_BASE_URL}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(adminKey ? { Authorization: `Bearer ${adminKey}` } : {}),
      ...options.headers,
    },
    cache: 'no-store',
  })

  if (!res.ok) {
    const body = await res.json().catch(() => ({}))
    throw new ApiError(res.status, body.code ?? 'UNKNOWN', body.message ?? res.statusText)
  }

  const text = await res.text()
  return text ? JSON.parse(text) : ({} as T)
}