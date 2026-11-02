'use client'
import { createBrowserClient } from '@supabase/ssr'
import { VIEW_AS_COOKIE, VIEW_AS_HEADER, UUID } from './viewAs'
import { toast } from '@/components/ui/toaster'

const viewAsCookie = () => {
  if (typeof document === 'undefined') return null
  const v = document.cookie.split('; ').find(c => c.startsWith(`${VIEW_AS_COOKIE}=`))?.slice(VIEW_AS_COOKIE.length + 1)
  return v && UUID.test(v) ? v : null
}

// A write while viewing a member: refused here with a clear message (the
// database would refuse it anyway). Quietly for background work; a toast when
// it came from a tap.
const VIEW_ONLY = 'View only: switch back to Me to change anything.'
function refusedWrite() {
  if ((navigator as any).userActivation?.isActive) toast(VIEW_ONLY, 'error')
  const result = { data: null, error: { message: VIEW_ONLY, code: 'view-only' }, count: null, status: 403, statusText: 'View only' }
  const chain: any = new Proxy(function () {}, {
    get: (_t, k) => k === 'then' ? (res: any) => Promise.resolve(result).then(res) : () => chain,
  })
  return chain
}

let viewing: any = null
export const createClient = () => {
  const viewAs = viewAsCookie()
  if (!viewAs) return createBrowserClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!)
  if (viewing) return viewing as ReturnType<typeof createBrowserClient>
  // Switching people reloads the page, so this client lasts for one person
  const client: any = createBrowserClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
    global: { headers: { [VIEW_AS_HEADER]: viewAs } },
    isSingleton: false,
  })
  const getUser = client.auth.getUser.bind(client.auth)
  client.auth.getUser = async (...a: any[]) => {
    const r = await getUser(...a)
    if (r?.data?.user) r.data.user = { ...r.data.user, id: viewAs }
    return r
  }
  const from = client.from.bind(client)
  client.from = (table: string) => {
    const q = from(table)
    return new Proxy(q, {
      get: (t, k) => {
        if (['insert', 'update', 'upsert', 'delete'].includes(String(k))) return () => refusedWrite()
        const v = (t as any)[k]
        return typeof v === 'function' ? v.bind(t) : v
      },
    })
  }
  viewing = client
  return client as ReturnType<typeof createBrowserClient>
}
