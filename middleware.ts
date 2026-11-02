import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'
import { VIEW_AS_COOKIE, UUID } from '@/lib/supabase/viewAs'

// What a view-only owner may still post: questions to the AI, nothing saved
const VIEW_ONLY_ALLOWED = ['/api/ai-advisor', '/api/portfolio/market-view']

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

  // Viewing a family member is read only (the database refuses too; this gives a
  // clear answer, and a delete that matched nothing can't report success)
  if (UUID.test(request.cookies.get(VIEW_AS_COOKIE)?.value ?? '') && pathname.startsWith('/api/') && !['GET', 'HEAD'].includes(request.method)
    && !VIEW_ONLY_ALLOWED.some(p => pathname.startsWith(p))) {
    return NextResponse.json({ error: 'View only: switch back to Me to change anything.' }, { status: 403 })
  }

  // An invite opened while signed out: remember it through login or signup
  // (including an email confirmation on the same device), then come back to it
  const joinCode = pathname.match(/^\/join\/([a-z0-9-]{8,40})$/i)?.[1]
  if (!user && joinCode) {
    const res = NextResponse.redirect(new URL('/auth/signup', request.url))
    res.cookies.set('wl-join', joinCode, { path: '/', maxAge: 60 * 60 * 24 * 7, sameSite: 'lax' })
    return res
  }
  const pendingJoin = request.cookies.get('wl-join')?.value
  if (user && pendingJoin && !pathname.startsWith('/api/')) {
    const res = pathname.startsWith('/join/') ? supabaseResponse : NextResponse.redirect(new URL(`/join/${encodeURIComponent(pendingJoin)}`, request.url))
    res.cookies.delete('wl-join')
    return res
  }

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
