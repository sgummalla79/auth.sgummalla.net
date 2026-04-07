'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { clsx } from 'clsx'
import {
  LayoutDashboard,
  KeyRound,
  AppWindow,
  Users,
  ScrollText,
  Heart,
  LogOut,
} from 'lucide-react'
import { ThemeToggle } from './ThemeToggle'

const NAV_ITEMS = [
  { href: '/dashboard', label: 'Overview', icon: LayoutDashboard },
  { href: '/keys', label: 'Keys', icon: KeyRound },
  { href: '/applications', label: 'Applications', icon: AppWindow },
  { href: '/users', label: 'Users', icon: Users },
  { href: '/audit', label: 'Audit Log', icon: ScrollText },
  { href: '/health', label: 'Health', icon: Heart },
]

export function Sidebar() {
  const pathname = usePathname()

  return (
    <aside
      style={{ width: 'var(--sidebar-width)' }}
      className="fixed top-0 left-0 h-screen flex flex-col"
    >
      <style>{`
        aside { background: var(--color-sidebar); }
        .nav-item { color: var(--color-sidebar-text); transition: background 0.15s; }
        .nav-item:hover { background: var(--color-sidebar-hover); }
        .nav-item.active { background: var(--color-sidebar-active); color: var(--color-sidebar-text-active); }
      `}</style>

      <div className="p-5 pb-3">
        <h1 className="text-base font-semibold text-white tracking-tight">IDP Admin</h1>
        <p className="text-xs mt-0.5" style={{ color: 'var(--color-sidebar-text)' }}>
          auth.sgummalla.net
        </p>
      </div>

      <nav className="flex-1 px-3 py-2 space-y-0.5">
        {NAV_ITEMS.map(({ href, label, icon: Icon }) => (
          <Link
            key={href}
            href={href}
            className={clsx(
              'nav-item flex items-center gap-3 px-3 py-2 rounded-md text-sm',
              pathname.startsWith(href) && 'active',
            )}
          >
            <Icon size={16} />
            {label}
          </Link>
        ))}

        <div className="my-2" style={{ borderTop: '1px solid var(--color-sidebar-hover)' }} />

        <ThemeToggle />

        <form action="/api/logout" method="POST">
          <button
            type="submit"
            className="nav-item flex items-center gap-3 px-3 py-2 rounded-md text-sm w-full text-left"
          >
            <LogOut size={16} />
            Logout
          </button>
        </form>
      </nav>
    </aside>
  )
}