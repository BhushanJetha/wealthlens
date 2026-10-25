'use client'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { LogOut, Search } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { useUiStore } from '@/store/uiStore'
import { useFamily } from '@/hooks/useFamily'
import { SECTIONS, resolveNav } from '@/lib/nav'

// Sections per the design spec: Home / Money / Wealth / Plan / Insights /
// Learn / Settings. The pages inside each section are tabs (SectionTabs).
export default function Sidebar({ user }: { user?: any }) {
  const pathname = usePathname()
  const router   = useRouter()
  const supabase = createClient()
  const { sidebarOpen, setSidebarOpen, setPaletteOpen } = useUiStore()
  const { members } = useFamily()
  const activeKey = resolveNav(pathname).section?.key

  async function signOut() {
    await supabase.auth.signOut()
    router.push('/auth/login')
  }

  const name = user?.full_name || user?.email?.split('@')[0] || 'You'
  const initials = name.split(/\s+/).filter(Boolean).slice(0, 2).map((w: string) => w[0]?.toUpperCase()).join('')
  const familyCount = members.filter(m => m.relationship !== 'self').length + 1

  return (
    <>
    {/* Mobile backdrop */}
    {sidebarOpen && (
      <div className="md:hidden fixed inset-0 z-40" style={{ background: 'rgba(15,23,42,0.45)' }}
        onClick={() => setSidebarOpen(false)} />
    )}
    <aside
      className={`fixed md:static inset-y-0 left-0 z-50 md:z-auto w-[220px] min-w-[220px] flex flex-col overflow-y-auto pb-3 transform transition-transform duration-200 ${sidebarOpen ? 'translate-x-0' : '-translate-x-full'} md:translate-x-0 safe-top`}
      style={{ background: '#fff', borderRight: '1px solid var(--border)' }}>

      {/* Logo */}
      <div className="h-[60px] flex items-center gap-2.5 px-[18px] flex-shrink-0">
        <div className="w-[30px] h-[30px] rounded-[9px] flex items-center justify-center font-bold text-[14px] text-white flex-shrink-0"
          style={{ background: 'linear-gradient(135deg, #4F46E5, #6366F1)' }}>◈</div>
        <div className="leading-tight">
          <div className="text-[15px] font-bold" style={{ color: 'var(--text)' }}>WealthLens</div>
          <div className="text-[10.5px]" style={{ color: 'var(--text3)' }}>UAE · India finance</div>
        </div>
      </div>

      {/* Search / jump anywhere */}
      <button onClick={() => { setSidebarOpen(false); setPaletteOpen(true) }}
        className="mx-3 mb-2.5 h-[34px] flex items-center gap-2 px-2.5 rounded-lg text-[12.5px] flex-shrink-0"
        style={{ background: 'var(--bg2)', border: '1px solid var(--border)', color: 'var(--text3)' }}>
        <Search size={14} className="flex-shrink-0" />
        <span className="flex-1 text-left whitespace-nowrap">Search…</span>
        <span className="wl-kbd hidden md:inline-flex" style={{ background: '#fff' }}>Ctrl K</span>
      </button>

      <nav className="flex flex-col" aria-label="Main">
        {SECTIONS.map(s => {
          const active = activeKey === s.key
          const Icon = s.icon
          return (
            <Link key={s.key} href={s.href} onClick={() => setSidebarOpen(false)}
              aria-current={active ? 'page' : undefined}
              className="flex items-center gap-3 mx-2 mb-0.5 px-3 h-10 rounded-lg text-[13.5px] transition-colors hover:bg-slate-50"
              style={active
                ? { background: 'var(--accent-bg)', color: 'var(--accent2)', fontWeight: 600 }
                : { color: 'var(--text2)', fontWeight: 500 }}>
              <Icon size={17} strokeWidth={1.9} className="flex-shrink-0" />
              {s.label}
            </Link>
          )
        })}
      </nav>

      <div className="flex-1" />

      {/* Profile card */}
      <div className="mx-3 p-3 pr-2 rounded-[10px] flex items-center gap-2" style={{ background: 'var(--bg2)' }}>
        <div className="w-8 h-8 rounded-full flex items-center justify-center text-[13px] font-semibold text-white flex-shrink-0"
          style={{ background: 'var(--accent)' }}>{initials || 'U'}</div>
        <div className="flex-1 min-w-0 text-[12.5px] leading-tight">
          <div className="font-semibold truncate" style={{ color: 'var(--text)' }}>{name}</div>
          <div className="truncate text-[11.5px]" style={{ color: 'var(--text3)' }}>Family · {familyCount} member{familyCount === 1 ? '' : 's'}</div>
        </div>
        <button onClick={signOut} title="Sign out" aria-label="Sign out"
          className="w-7 h-7 rounded-md flex items-center justify-center flex-shrink-0 hover:bg-white transition-colors"
          style={{ color: 'var(--text3)' }}>
          <LogOut size={14} />
        </button>
      </div>
    </aside>
    </>
  )
}
