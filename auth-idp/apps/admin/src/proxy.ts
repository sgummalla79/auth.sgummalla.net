import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

const PUBLIC_PATHS = ['/login']

export default function proxy(request: NextRequest)  {
  const { pathname } = request.nextUrl
  const adminKey = request.cookies.get('admin_key')?.value

  // Allow public paths
  if (PUBLIC_PATHS.some((p) => pathname.startsWith(p))) {
    // Redirect to dashboard if already logged in
    if (adminKey) return NextResponse.redirect(new URL('/dashboard', request.url))
    return NextResponse.next()
  }

  // Redirect to login if no admin key
  if (!adminKey) return NextResponse.redirect(new URL('/login', request.url))

  return NextResponse.next()
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
}