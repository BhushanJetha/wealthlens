import { createServerClient } from '@supabase/ssr'
import { type NextRequest, NextResponse } from 'next/server'

type CookieEntry = { name: string; value: string; options?: Record<string, unknown> }

export async function updateSession(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request })

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() { return request.cookies.getAll() },
        setAll(cookiesToSet: CookieEntry[]) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value))
          supabaseResponse = NextResponse.next({ request })
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          cookiesToSet.forEach(({ name, value, options }) => supabaseResponse.cookies.set(name, value, options as any))
        },
      },
    }
  )

  // Refresh session
  const { data: { user } } = await supabase.auth.getUser()
  return { supabaseResponse, user }
}
