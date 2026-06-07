import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import Sidebar from '@/components/layout/Sidebar'
import Topbar from '@/components/layout/Topbar'
import ChatPanel from '@/components/layout/ChatPanel'

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/auth/login')

  // Guarantee profile row exists — handles cases where the DB trigger
  // failed silently on signup (e.g. after a full data reset)
  await supabase.from('profiles').upsert({
    id:         user.id,
    email:      user.email ?? '',
    full_name:  user.user_metadata?.full_name  ?? null,
    avatar_url: user.user_metadata?.avatar_url ?? null,
  }, { onConflict: 'id', ignoreDuplicates: true })

  const { data: profile } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', user.id)
    .single()

  return (
    <div className="flex h-screen overflow-hidden" style={{ background: 'var(--bg)' }}>
      <Sidebar />
      <div className="flex flex-col flex-1 min-w-0 overflow-hidden">
        <Topbar user={profile} />
        <main className="flex-1 overflow-y-auto p-3 sm:p-5 pb-8">
          {children}
        </main>
      </div>
      <ChatPanel userId={user.id} />
    </div>
  )
}
