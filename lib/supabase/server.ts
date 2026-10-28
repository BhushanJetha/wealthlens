import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'

export const createClient = () => {
  const cookieStore = cookies()
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll: () => cookieStore.getAll(),
        setAll: (cs: { name: string; value: string; options?: Record<string, unknown> }[]) => { try { cs.forEach(({ name, value, options }) => cookieStore.set(name, value, options as any)) } catch {} },
      },
    }
  )
}

// The signed-in user for a page, checked locally: getClaims verifies the
// session JWT against the project's published signing keys (cached), so there
// is no round trip to Supabase like getUser() makes (~450 ms from UAE/India).
// Middleware has already refreshed the session and every query runs under RLS.
// Metadata is as of the last token refresh — use auth.getUser() where freshly
// saved user_metadata matters.
export async function getSessionUser(supabase: ReturnType<typeof createClient>) {
  const { data } = await supabase.auth.getClaims()
  const c = data?.claims
  return c?.sub ? { id: c.sub as string, email: (c.email as string | undefined) ?? null, user_metadata: (c.user_metadata ?? {}) as Record<string, any> } : null
}

export const createServiceClient = () =>
  createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { cookies: { getAll: () => [], setAll: () => {} } }
  )
