'use client'
import { useEffect } from 'react'
import { usePathname } from 'next/navigation'
import { useViewStore } from '@/store/viewStore'
import { useUiStore } from '@/store/uiStore'
import { resolveNav } from '@/lib/nav'
import NotificationsPanel from './NotificationsPanel'
import HolderChips from './HolderChips'
import MonthPicker from './MonthPicker'
import ViewSwitch from './ViewSwitch'
import BankStatementUploadModal from '@/components/forms/BankStatementUploadModal'
import { AddButton } from './QuickAdd'

// Desktop app bar: breadcrumb · period · family chips · country view · bell ·
// Add · Ask AI. Phones have no app bar — see MobileHeader.
export default function Topbar({ user }: { user: any }) {
  const { setFxRate } = useViewStore()
  const { uploadOpen, setUploadOpen, advisorOpen, openAdvisor, closeAdvisor } = useUiStore()
  const pathname = usePathname()
  const { section, tab, sub } = resolveNav(pathname)
  const crumbs = [section?.label ?? 'WealthLens', tab && tab.label !== section?.label ? tab.label : null, sub && sub.label !== 'Overview' ? sub.label : null]
    .filter(Boolean) as string[]
  const firstName = (user?.full_name ?? '').split(' ')[0] || null

  // Fetch live AED→INR rate once on mount; store in viewStore so all pages share it
  useEffect(() => {
    fetch('/api/fx-rate')
      .then(r => r.json())
      .then(d => { if (d.rate && d.rate > 1) setFxRate(Number(d.rate)) })
      .catch(() => {})
  }, [])

  return (
    <>
    <header className="hidden md:flex items-center gap-3 flex-wrap px-6 py-3 min-h-[60px]"
      style={{ background: 'var(--card)', borderBottom: '1px solid var(--line)' }}>
      <nav aria-label="Breadcrumb" className="text-[13px] flex items-center gap-2 min-w-0" style={{ color: 'var(--text3)' }}>
        {crumbs.map((c, i) => (
          <span key={i} className="flex items-center gap-2 whitespace-nowrap">
            {i > 0 && <span aria-hidden>›</span>}
            <span style={i === crumbs.length - 1 ? { color: 'var(--text)', fontWeight: 500 } : undefined}>{c}</span>
          </span>
        ))}
      </nav>
      <MonthPicker />
      <div className="ml-auto flex items-center gap-2.5 flex-wrap justify-end">
        <div className="pr-2.5" style={{ borderRight: '1px solid var(--border)' }}>
          <HolderChips firstName={firstName} />
        </div>
        <ViewSwitch />
        <NotificationsPanel />
        <AddButton />
        <button onClick={() => advisorOpen ? closeAdvisor() : openAdvisor()} aria-pressed={advisorOpen}
          className="h-[34px] px-3.5 rounded-lg text-[12.5px] font-semibold flex items-center gap-1 flex-shrink-0 transition-colors"
          style={advisorOpen
            ? { background: 'var(--accent2)', color: '#fff' }
            : { background: 'var(--accent-bg)', color: 'var(--accent2)', border: '1px solid var(--accent-border)' }}>
          ✦ Ask AI
        </button>
      </div>
    </header>

    {uploadOpen && <BankStatementUploadModal onClose={() => setUploadOpen(false)} />}
  </>
  )
}
