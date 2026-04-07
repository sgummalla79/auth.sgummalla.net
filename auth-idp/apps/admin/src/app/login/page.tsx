'use client'

import { useActionState } from 'react'
import { login } from '@/lib/auth'

export default function LoginPage() {
  const [state, formAction, pending] = useActionState(login, null)

  return (
    <div className="min-h-screen flex items-center justify-center">
      <div className="w-full max-w-sm">
        <h1 className="text-xl font-semibold mb-1">IDP Admin</h1>
        <p className="text-sm mb-6" style={{ color: 'var(--color-text-secondary)' }}>
          Enter your admin API key to continue.
        </p>

        {state?.error && (
          <div className="mb-4 px-3 py-2 rounded-md text-sm border"
style={{ background: 'var(--color-error-bg)', color: 'var(--color-error-text)', borderColor: 'var(--color-error-border)' }}>
            {state.error}
          </div>
        )}

        <form action={formAction} className="space-y-4">
          <div>
            <label htmlFor="adminKey" className="block text-sm font-medium mb-1.5">
              Admin Key
            </label>
            <input
              id="adminKey"
              name="adminKey"
              type="password"
              required
              autoFocus
              className="w-full px-3 py-2 border rounded-md text-sm outline-none focus:ring-2 focus:ring-blue-500"
              style={{ borderColor: 'var(--color-border)' }}
              placeholder="Enter ADMIN_API_KEY"
            />
          </div>
          <button
            type="submit"
            disabled={pending}
            className="w-full py-2 rounded-md text-sm font-medium text-white disabled:opacity-50"
            style={{ background: 'var(--color-accent)' }}
          >
            {pending ? 'Signing in...' : 'Sign In'}
          </button>
        </form>
      </div>
    </div>
  )
}