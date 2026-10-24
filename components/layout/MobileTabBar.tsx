'use client'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { LayoutGrid } from 'lucide-react'
import { useUiStore } from '@/store/uiStore'
import { SECTIONS, resolveNav } from '@/lib/nav'

// Native-app-style bottom navigation — phones only (md:hidden). Desktop keeps
// the sidebar. Home / Money / Wealth / Plan; "More" opens the drawer (Insights,
// Settings, search).
const TABS = SECTIONS.filter(s => ['home', 'money', 'wealth', 'plan'].includes(s.key))

export default function MobileTabBar() {
  const pathname = usePathname()
  const { setSidebarOpen } = useUiStore()
  const activeKey = resolveNav(pathname).section?.key
  const moreActive = !!activeKey && !TABS.some(t => t.key === activeKey)

  return (
    <nav className="md:hidden fixed bottom-0 inset-x-0 z-30 safe-bottom no-print"
      style={{ background: '#fff', borderTop: '1px solid var(--border)', boxShadow: '0 -1px 10px rgba(15,23,42,0.05)' }}>
      <div className="flex items-stretch">
        {TABS.map(t => {
          const active = activeKey === t.key
          const Icon = t.icon
          return (
            <Link key={t.key} href={t.href} aria-current={active ? 'page' : undefined}
              className="flex-1 flex flex-col items-center justify-center gap-0.5 py-2 transition-colors"
              style={{ color: active ? 'var(--accent)' : 'var(--text4)', minHeight: 56 }}>
              <Icon size={21} strokeWidth={active ? 2.4 : 2} />
              <span className="text-[10.5px]" style={{ fontWeight: active ? 700 : 500 }}>{t.label}</span>
            </Link>
          )
        })}
        <button onClick={() => setSidebarOpen(true)}
          className="flex-1 flex flex-col items-center justify-center gap-0.5 py-2"
          style={{ color: moreActive ? 'var(--accent)' : 'var(--text4)', minHeight: 56 }}
          aria-label="More sections">
          <LayoutGrid size={21} strokeWidth={moreActive ? 2.4 : 2} />
          <span className="text-[10.5px]" style={{ fontWeight: moreActive ? 700 : 500 }}>More</span>
        </button>
      </div>
    </nav>
  )
}
