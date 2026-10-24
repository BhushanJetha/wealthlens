'use client'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { LogOut, Search } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { useUiStore } from '@/store/uiStore'
import { SECTIONS, resolveNav } from '@/lib/nav'

// Five sections (Home / Money / Wealth / Plan / Insights) + Settings. The pages
// inside each section are tabs at the top of the page (SectionTabs).
export default function Sidebar() {
  const pathname = usePathname()
  const router   = useRouter()
  const supabase = createClient()
  const { sidebarOpen, setSidebarOpen, setPaletteOpen } = useUiStore()
  const activeKey = resolveNav(pathname).section?.key

  async function signOut() {
    await supabase.auth.signOut()
    router.push('/auth/login')
  }

  const main = SECTIONS.filter(s => s.key !== 'settings')
  const settings = SECTIONS.find(s => s.key === 'settings')!

  function Item({ s }: { s: typeof SECTIONS[number] }) {
    const active = activeKey === s.key
    const Icon = s.icon
    return (
      <Link href={s.href} onClick={() => setSidebarOpen(false)}
        aria-current={active ? 'page' : undefined}
        className="group flex items-center gap-3 mx-2 px-3 h-10 rounded-lg text-[13.5px] transition-colors"
        style={active
          ? { background: 'var(--accent-bg)', color: 'var(--accent2)', fontWeight: 600 }
          : { color: 'var(--text2)', fontWeight: 500 }}
        onMouseEnter={e => { if (!active) e.currentTarget.style.background = 'var(--bg2)' }}
        onMouseLeave={e => { if (!active) e.currentTarget.style.background = 'transparent' }}>
        <Icon size={17} strokeWidth={active ? 2.2 : 1.9} className="flex-shrink-0"
          style={{ color: active ? 'var(--accent)' : 'var(--text3)' }} />
        <span className="flex-1">{s.label}</span>
      </Link>
    )
  }

  return (
    <>
    {/* Mobile backdrop */}
    {sidebarOpen && (
      <div className="md:hidden fixed inset-0 z-40" style={{ background: 'rgba(15,23,42,0.45)' }}
        onClick={() => setSidebarOpen(false)} />
    )}
    <aside
      className={`fixed md:static inset-y-0 left-0 z-50 w-[232px] min-w-[232px] flex flex-col overflow-y-auto transform transition-transform duration-200 ${sidebarOpen ? 'translate-x-0' : '-translate-x-full'} md:translate-x-0 safe-top`}
      style={{ background: '#fff', borderRight: '1px solid var(--border)' }}>

      {/* Logo */}
      <div className="px-5 h-[60px] flex items-center gap-2.5 flex-shrink-0">
        <div className="w-8 h-8 rounded-[9px] flex items-center justify-center font-bold text-[15px] text-white flex-shrink-0"
          style={{ background: 'linear-gradient(135deg, var(--accent) 0%, #6366F1 100%)' }}>◈</div>
        <div className="leading-tight">
          <div className="text-[15px] font-bold tracking-tight" style={{ color: 'var(--text)' }}>WealthLens</div>
          <div className="text-[10.5px]" style={{ color: 'var(--text3)' }}>UAE · India finance</div>
        </div>
      </div>

      {/* Search / jump anywhere */}
      <div className="px-3 pb-3">
        <button onClick={() => { setSidebarOpen(false); setPaletteOpen(true) }}
          className="w-full flex items-center gap-2 h-9 px-3 rounded-lg text-[12.5px] transition-colors"
          style={{ background: 'var(--bg2)', border: '1px solid var(--border)', color: 'var(--text3)' }}>
          <Search size={14} className="flex-shrink-0" />
          <span className="flex-1 text-left whitespace-nowrap">Search…</span>
          <span className="wl-kbd hidden md:inline-flex">Ctrl K</span>
        </button>
      </div>

      <nav className="flex-1 space-y-0.5" aria-label="Main">
        {main.map(s => <Item key={s.key} s={s} />)}
      </nav>

      <div className="py-3 mt-3 space-y-0.5" style={{ borderTop: '1px solid var(--border)' }}>
        <Item s={settings} />
        <button onClick={signOut}
          className="flex items-center gap-3 mx-2 px-3 h-10 rounded-lg text-[13.5px] font-medium transition-colors"
          style={{ width: 'calc(100% - 16px)', color: 'var(--text2)' }}
          onMouseEnter={e => { e.currentTarget.style.background = 'var(--rose-bg)'; e.currentTarget.style.color = 'var(--rose)' }}
          onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = 'var(--text2)' }}>
          <LogOut size={17} strokeWidth={1.9} className="flex-shrink-0" style={{ color: 'inherit' }} />
          Sign out
        </button>
      </div>
    </aside>
    </>
  )
}
