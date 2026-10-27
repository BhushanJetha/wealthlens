'use client'
import Link from 'next/link'
import { useUiStore } from '@/store/uiStore'

// Phone "More" hub, grouped as in the mobile design. Expenses, Investments and
// Goals aren't listed — they're the Money / Wealth / Plan tabs in the bottom bar.
type Item = { label: string; href?: string; advisor?: true }
const GROUPS: { label: string; items: Item[] }[] = [
  { label: 'Learn', items: [{ label: 'Courses', href: '/dashboard/learn' }, { label: 'Calculators', href: '/dashboard/learn/calculators' }] },
  { label: 'Insights', items: [{ label: 'Market news', href: '/dashboard/news' }, { label: '✦ AI advisor', advisor: true }] },
  { label: 'Money', items: [
    { label: 'Spending analysis', href: '/dashboard/analysis' },
    { label: 'Bills & subscriptions', href: '/dashboard/bills' },
    { label: 'Income', href: '/dashboard/income' },
    { label: 'Money flow', href: '/dashboard/transfers' },
    { label: 'Reports', href: '/dashboard/reports' },
    { label: 'FX optimizer', href: '/dashboard/fx' },
    { label: 'Import history', href: '/dashboard/ingest' },
  ] },
  { label: 'Plan', items: [
    { label: 'Budgets', href: '/dashboard/budgets' },
    { label: 'Cash-flow forecast', href: '/dashboard/cashflow' },
    { label: 'Tax planner', href: '/dashboard/tax' },
  ] },
  { label: 'Wealth', items: [
    { label: 'Net worth', href: '/dashboard/net-worth' },
    { label: 'Debt vs equity', href: '/dashboard/debt-equity' },
    { label: 'Loans', href: '/dashboard/loans' },
    { label: 'Credit cards', href: '/dashboard/cards' },
    { label: 'Bank accounts', href: '/dashboard/accounts' },
    { label: 'Insurance', href: '/dashboard/insurance' },
  ] },
  { label: 'Insights & account', items: [
    { label: 'Financial health', href: '/dashboard/financial-health' },
    { label: 'NRI toolkit', href: '/dashboard/nri-toolkit' },
    { label: 'Money mindset', href: '/dashboard/inspire' },
    { label: 'Settings & family', href: '/dashboard/settings' },
  ] },
]

export default function MorePage() {
  const { openAdvisor } = useUiStore()
  const cls = 'w-full flex items-center justify-between px-4 py-3.5 text-[14px] font-medium text-left active:bg-slate-50'
  const style = { borderTop: '1px solid #F1F5F9', color: 'var(--text)' }
  const chevron = <span aria-hidden style={{ color: 'var(--text4)' }}>›</span>

  return (
    <div className="max-w-xl mx-auto flex flex-col gap-3.5 animate-fade-up">
      <h1 className="text-[22px] font-bold" style={{ color: 'var(--text)' }}>More</h1>
      {GROUPS.map(g => (
        <section key={g.label} aria-label={g.label}>
          <div className="text-[10.5px] font-semibold uppercase tracking-[0.06em] mx-1 mb-1.5" style={{ color: 'var(--text4)' }}>{g.label}</div>
          <div className="wl-card overflow-hidden">
            <div className="-mt-px">
              {g.items.map(it => it.advisor
                ? <button key={it.label} onClick={() => openAdvisor()} className={cls} style={style}>{it.label}{chevron}</button>
                : <Link key={it.label} href={it.href!} className={cls} style={style}>{it.label}{chevron}</Link>)}
            </div>
          </div>
        </section>
      ))}
    </div>
  )
}
