'use server'

import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import { env } from './env'

export async function login(_prevState: unknown, formData: FormData) {
  const key = formData.get('adminKey') as string
  if (!key) return { error: 'Admin key is required' }

  // Validate against the API
  const res = await fetch(`${env.API_BASE_URL}/api/v1/admin/audit?limit=1`, {
    headers: { Authorization: `Bearer ${key}` },
    cache: 'no-store',
  })

  if (!res.ok) return { error: 'Invalid admin key' }

  const cookieStore = await cookies()
  cookieStore.set('admin_key', key, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: 60 * 60 * 8, // 8 hours
  })

  redirect('/dashboard')
}

export async function logout() {
  const cookieStore = await cookies()
  cookieStore.delete('admin_key')
  redirect('/login')
}

export async function getAdminKey(): Promise<string | null> {
  const cookieStore = await cookies()
  return cookieStore.get('admin_key')?.value ?? null
}