'use client'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { LayoutDashboard, Receipt, TrendingUp, LayoutGrid } from 'lucide-react'
import { useUiStore } from '@/store/uiStore'

// Native-app-style bottom navigation — phones only (md:hidden). Desktop keeps
// the full sidebar. "More" opens the existing slide-in drawer (all sections).
const TABS = [
  { href: '/dashboard',             icon: LayoutDashboard, label: 'Home',
    match: (p: string) => p === '/dashboard' },
  { href: '/dashboard/expenses',    icon: Receipt,         label: 'Spending',
    match: (p: string) => p.startsWith('/dashboard/expenses') || p.startsWith('/dashboard/income') || p.startsWith('/dashboard/reports') || p.startsWith('/dashboard/transfers') },
  { href: '/dashboard/investments', icon: TrendingUp,      label: 'Invest',
    match: (p: string) => p.startsWith('/dashboard/investments') || p.startsWith('/dashboard/stocks') },
]

export default function MobileTabBar() {
  const pathname = usePathname()
  const { setSidebarOpen } = useUiStore()

  return (
    <nav className="md:hidden fixed bottom-0 inset-x-0 z-30 safe-bottom no-print"
      style={{ background: '#fff', borderTop: '1px solid var(--border)', boxShadow: '0 -1px 10px rgba(0,0,0,0.05)' }}>
      <div className="flex items-stretch">
        {TABS.map(t => {
          const active = t.match(pathname)
          const Icon = t.icon
          return (
            <Link key={t.href} href={t.href}
              className="flex-1 flex flex-col items-center justify-center gap-0.5 py-2 transition-colors"
              style={{ color: active ? 'var(--sage)' : '#9CA3AF', minHeight: 56 }}>
              <Icon size={21} strokeWidth={active ? 2.4 : 2} />
              <span className="text-[10px]" style={{ fontWeight: active ? 700 : 500 }}>{t.label}</span>
            </Link>
          )
        })}
        <button onClick={() => setSidebarOpen(true)}
          className="flex-1 flex flex-col items-center justify-center gap-0.5 py-2"
          style={{ color: '#9CA3AF', minHeight: 56 }}
          aria-label="More sections">
          <LayoutGrid size={21} strokeWidth={2} />
          <span className="text-[10px] font-medium">More</span>
        </button>
      </div>
    </nav>
  )
}
