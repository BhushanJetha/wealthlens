import { redirect } from 'next/navigation'
import { createClient, getSessionUser } from '@/lib/supabase/server'
import Sidebar from '@/components/layout/Sidebar'
import Topbar from '@/components/layout/Topbar'
import ChatPanel from '@/components/layout/ChatPanel'
import MobileTabBar from '@/components/layout/MobileTabBar'
import SectionTabs from '@/components/layout/SectionTabs'
import MobileHeader from '@/components/layout/MobileHeader'
import CommandPalette from '@/components/layout/CommandPalette'
import QuickAdd from '@/components/layout/QuickAdd'

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const supabase = createClient()
  const user = await getSessionUser(supabase)
  if (!user) redirect('/auth/login')

  let { data: profile } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', user.id)
    .maybeSingle()

  // Guarantee profile row exists — handles cases where the DB trigger
  // failed silently on signup (e.g. after a full data reset). Only then:
  // each extra read is a round trip (~450 ms from UAE/India).
  if (!profile) {
    await supabase.from('profiles').upsert({
      id:         user.id,
      email:      user.email ?? '',
      full_name:  user.user_metadata?.full_name  ?? null,
      avatar_url: user.user_metadata?.avatar_url ?? null,
    }, { onConflict: 'id', ignoreDuplicates: true })
    ;({ data: profile } = await supabase.from('profiles').select('*').eq('id', user.id).single())
  }

  return (
    <div className="flex h-screen overflow-hidden bg-canvas">
      <Sidebar user={profile} />
      <div className="flex flex-col flex-1 min-w-0 overflow-hidden">
        <Topbar user={profile} />
        {/* Content + docked AI advisor (design: advisor sits right of the page) */}
        <div className="flex flex-1 min-h-0">
          {/* Lavender canvas (v2). Phones: no app bar, content starts under the status bar */}
          <main className="flex-1 min-w-0 overflow-y-auto px-4 md:px-7 pt-[calc(10px+env(safe-area-inset-top))] md:pt-6 pb-24 md:pb-8 bg-canvas-m md:bg-canvas">
            <MobileHeader firstName={(profile?.full_name ?? '').split(' ')[0] || null} />
            <SectionTabs />
            {children}
          </main>
          <ChatPanel />
        </div>
      </div>
      <MobileTabBar />
      <CommandPalette />
      <QuickAdd />
    </div>
  )
}
