import { redirect } from 'next/navigation'
import { cookies } from 'next/headers'
import { FAMILY_MODE_COOKIE } from '@/lib/supabase/viewAs'
import { createClient, getRealSessionUser } from '@/lib/supabase/server'
import Sidebar from '@/components/layout/Sidebar'
import Topbar from '@/components/layout/Topbar'
import ChatPanel from '@/components/layout/ChatPanel'
import MobileTabBar from '@/components/layout/MobileTabBar'
import SectionTabs from '@/components/layout/SectionTabs'
import MobileHeader from '@/components/layout/MobileHeader'
import CommandPalette from '@/components/layout/CommandPalette'
import QuickAdd from '@/components/layout/QuickAdd'
import FamilyBar from '@/components/layout/FamilyBar'

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const supabase = createClient()
  // The signed-in person (the menu is theirs even while viewing a family member)
  const user = await getRealSessionUser(supabase)
  if (!user) redirect('/auth/login')

  const [{ data: found }, { data: links }] = await Promise.all([
    supabase.from('profiles').select('*').eq('id', user.id).maybeSingle(),
    supabase.from('family_links').select('id,owner_id,member_id,name,status,left_at'),   // none until migration 038
  ])
  let profile = found
  const viewAs = (supabase as any).__viewAs as string | undefined
  const mine = (links ?? []).filter((l: any) => l.owner_id === user.id)
  const members = mine.filter((l: any) => l.status === 'active' && l.member_id).map((l: any) => ({ id: l.member_id as string, name: l.name as string }))
  // Family view is off unless you turn it on (Settings › Family): no switcher, no space taken
  const familyOn = cookies().get(FAMILY_MODE_COOKIE)?.value === 'on'
  const viewing = familyOn && viewAs && members.some(m => m.id === viewAs) ? viewAs : null

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
    <div className={`flex h-screen overflow-hidden bg-canvas ${viewing ? 'wl-viewing' : ''}`}>
      <Sidebar user={profile} />
      <div className="flex flex-col flex-1 min-w-0 overflow-hidden">
        <Topbar user={profile} />
        {/* Content + docked AI advisor (design: advisor sits right of the page) */}
        <div className="flex flex-1 min-h-0">
          {/* Lavender canvas (v2). Phones: no app bar, content starts under the status bar */}
          <main className="flex-1 min-w-0 overflow-y-auto px-4 md:px-7 pt-[calc(10px+env(safe-area-inset-top))] md:pt-6 pb-24 md:pb-8 bg-canvas-m md:bg-canvas">
            <MobileHeader firstName={(profile?.full_name ?? '').split(' ')[0] || null} />
            <FamilyBar members={familyOn ? members : []} viewing={viewing} stale={!!viewAs && !viewing} left={mine.filter((l: any) => l.status === 'left').map((l: any) => ({ id: l.id, name: l.name }))} />
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
