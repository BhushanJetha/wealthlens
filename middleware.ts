import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

export async function middleware(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request })

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll: () => request.cookies.getAll(),
        setAll: (cs: { name: string; value: string; options?: Record<string, unknown> }[]) => {
          cs.forEach(({ name, value }) => request.cookies.set(name, value))
          supabaseResponse = NextResponse.next({ request })
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          cs.forEach(({ name, value, options }) => supabaseResponse.cookies.set(name, value, options as any))
        },
      },
    }
  )

  // getClaims refreshes an expired session and verifies the JWT locally
  // against the project's signing keys — no round trip on every click like
  // getUser(). API routes still check with getUser themselves.
  const { data } = await supabase.auth.getClaims()
  const user = data?.claims?.sub ? data.claims : null
  const { pathname } = request.nextUrl

  const authPaths = ['/auth/login', '/auth/signup', '/auth/forgot-password', '/auth/reset-password']
  const isAuthPage = authPaths.some(p => pathname.startsWith(p))

  if (!user && !isAuthPage && pathname !== '/') {
    return NextResponse.redirect(new URL('/auth/login', request.url))
  }

  if (user && isAuthPage) {
    return NextResponse.redirect(new URL('/dashboard', request.url))
  }

  return supabaseResponse
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|manifest.webmanifest|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)'],
}
