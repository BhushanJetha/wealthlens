'use client'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { LayoutGrid } from 'lucide-react'
import { SECTIONS, MOBILE_TABS, resolveNav } from '@/lib/nav'

// Native-app-style bottom navigation — phones only (md:hidden). Home / Money /
// Wealth / Plan, and "More" → the /dashboard/more hub (Insights, Learn,
// Settings and every other page).
const TABS = SECTIONS.filter(s => MOBILE_TABS.includes(s.key))

export default function MobileTabBar() {
  const pathname = usePathname()
  const activeKey = resolveNav(pathname).section?.key
  const moreActive = pathname === '/dashboard/more' || (!!activeKey && !MOBILE_TABS.includes(activeKey))

  const item = (key: string, href: string, label: string, Icon: any, active: boolean) => (
    <Link key={key} href={href} aria-current={active ? 'page' : undefined}
      className="flex-1 flex flex-col items-center justify-center gap-[3px] transition-colors"
      style={{ color: active ? 'var(--accent)' : 'var(--text4)', minHeight: 60 }}>
      <Icon size={21} strokeWidth={active ? 2.4 : 2} />
      <span className="text-[10.5px]" style={{ fontWeight: active ? 700 : 500 }}>{label}</span>
    </Link>
  )

  return (
    <nav aria-label="Main" className="md:hidden fixed bottom-0 inset-x-0 z-30 safe-bottom no-print"
      style={{ background: '#fff', borderTop: '1px solid var(--border)' }}>
      <div className="flex items-stretch">
        {TABS.map(t => item(t.key, t.href, t.label, t.icon, !moreActive && activeKey === t.key))}
        {item('more', '/dashboard/more', 'More', LayoutGrid, moreActive)}
      </div>
    </nav>
  )
}
