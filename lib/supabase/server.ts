import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { VIEW_AS_COOKIE, VIEW_AS_HEADER, UUID } from './viewAs'

// Family sharing: while an owner views a member (cookie), every query goes out
// with that member's id and asks the database for their rows (the database only
// agrees if there's an active link, migration 038), and the code's "current
// user" is that member, so each page reads their data as written. Writes are
// refused by the database. `__viewAs` says it's happening.
export const createClient = () => {
  const cookieStore = cookies()
  const viewAs = cookieStore.get(VIEW_AS_COOKIE)?.value
  const valid = viewAs && UUID.test(viewAs) ? viewAs : null
  const client = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      ...(valid ? { global: { headers: { [VIEW_AS_HEADER]: valid } } } : {}),
      cookies: {
        getAll: () => cookieStore.getAll(),
        setAll: (cs: { name: string; value: string; options?: Record<string, unknown> }[]) => { try { cs.forEach(({ name, value, options }) => cookieStore.set(name, value, options as any)) } catch {} },
      },
    }
  )
  if (valid) {
    const getUser = client.auth.getUser.bind(client.auth)
    client.auth.getUser = (async (...a: any[]) => {
      const r: any = await (getUser as any)(...a)
      if (r?.data?.user) r.data.user = { ...r.data.user, id: valid }
      return r
    }) as any
    ;(client as any).__viewAs = valid
  }
  return client
}

// The signed-in user for a page, checked locally: getClaims verifies the
// session JWT against the project's published signing keys (cached), so there
// is no round trip to Supabase like getUser() makes (~450 ms from UAE/India).
// Middleware has already refreshed the session and every query runs under RLS.
// Metadata is as of the last token refresh — use auth.getUser() where freshly
// saved user_metadata matters.
export async function getSessionUser(supabase: ReturnType<typeof createClient>) {
  const u = await getRealSessionUser(supabase)
  const viewAs = (supabase as any).__viewAs as string | undefined
  return u && viewAs ? { ...u, id: viewAs } : u
}

// The person actually signed in, even while viewing a member
export async function getRealSessionUser(supabase: ReturnType<typeof createClient>) {
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
