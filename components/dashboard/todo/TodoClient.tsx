'use client'
import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { useUiStore } from '@/store/uiStore'
import { GROUP_LABEL, AREA_LABEL, type TodoItem, type TodoArea, type TodoGroup } from '@/lib/todo'
import type { Bill } from '@/lib/bigBills'
import type { IncomePlan } from '@/lib/incomePlans'
import { foundRegular, pendingCharges } from '@/lib/regular'
import PendingConfirms, { pendingCount, type Pending } from '../PendingConfirms'
import IncomeChecks, { incomeCheckCount } from '../IncomeChecks'
import BillReminders, { billReminderCount } from '../BillReminders'
import LandedChecks, { landedCheckCount } from '../LandedChecks'
import { useTodo } from './useTodo'
import HelpButton from '@/components/ui/HelpButton'

const GROUP_DOT: Record<TodoGroup, string> = { today: '#DC2626', week: '#F59E0B', later: '#B9BDCB' }
const GROUP_INK: Record<TodoGroup, string> = { today: '#B4231A', week: '#B45309', later: '#5F657A' }
const ICON_BG: Record<TodoGroup, React.CSSProperties> = { today: { background: '#FDECEA', color: '#B4231A' }, week: { background: '#FFF4DE', color: '#B45309' }, later: { background: '#F1F2F6', color: '#5F657A' } }
const addDays = (d: string, n: number) => { const x = new Date(`${d}T12:00:00Z`); x.setUTCDate(x.getUTCDate() + n); return x.toISOString().slice(0, 10) }

// To do: one list for everything that needs you, sorted by how soon it
// matters. Each item has one tap to fix it; "Later" hides it to a day you
// pick and "Not for me" for good (kept on this device).
export default function TodoClient(p: {
  items: TodoItem[]; today: string; fx: number; pending: Pending; recurring: any[]; txns: any[]; accounts: any[]; plans: IncomePlan[]; bills: Bill[]; billSkips: string[]
}) {
  const { setUploadOpen } = useUiStore()
  const t = useTodo({ items: p.items, today: p.today })
  const [area, setArea] = useState<TodoArea | 'all'>('all')
  const [menu, setMenu] = useState<string | null>(null)
  useEffect(() => { const a = new URLSearchParams(location.search).get('area'); if (a === 'money' || a === 'wealth' || a === 'plan') setArea(a) }, [])
  const accName = (id: string | null) => p.accounts.find(a => a.id === id)?.name ?? null
  const foundCount = useMemo(() => pendingCharges(foundRegular(p.txns, p.recurring, p.today, p.billSkips, p.bills), p.billSkips).length, [p.txns, p.recurring, p.today, p.billSkips, p.bills])
  const confirms = pendingCount(p.pending) + incomeCheckCount(p.plans, p.txns, p.today, p.fx) + billReminderCount(p.bills, p.txns, p.today, p.billSkips) + (foundCount > 0 ? 1 : 0) + landedCheckCount(p.txns, p.today, p.fx)

  // The confirmations are answered in the box at the top, not listed twice
  const list = t.items.filter(i => i.id !== 'confirm')
  const shown = list.filter(i => area === 'all' || i.area === area)
  const count = (a: TodoArea | 'all') => list.filter(i => a === 'all' || i.area === a).length
  const groups = (['today', 'week', 'later'] as TodoGroup[]).map(g => ({ g, items: shown.filter(i => i.group === g) })).filter(x => x.items.length)
  const later = (id: string, days: number | null) => { t.hide(id, days == null ? '9999-12-31' : addDays(p.today, days)); setMenu(null) }

  return (
    <div className="flex flex-col gap-3.5 md:gap-[18px] animate-fade-up max-w-[920px]">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <div className="text-[13px]" style={{ color: 'var(--text3)' }}>Everything that needs you</div>
          <h1 className="text-[22px] md:text-[26px] font-bold tracking-[-0.02em]" style={{ color: 'var(--text)' }}>To do <span style={{ color: 'var(--text3)', fontWeight: 500 }}>· {list.length + (confirms ? 1 : 0)}</span><HelpButton /></h1>
          <p className="text-[12.5px]" style={{ color: 'var(--text3)' }}>
            {(['today', 'week', 'later'] as TodoGroup[]).map(g => `${list.filter(i => i.group === g).length + (g === 'today' && confirms ? 1 : 0)} ${GROUP_LABEL[g].toLowerCase()}`).join(' · ')}
          </p>
        </div>
        <div role="group" aria-label="Show" className="flex gap-1 p-1 rounded-xl" style={{ background: '#F1F2F6' }}>
          {(['all', 'money', 'wealth', 'plan'] as const).map(a => (
            <button key={a} onClick={() => setArea(a)} aria-pressed={area === a} className="h-8 px-3 rounded-lg text-[13px]"
              style={area === a ? { background: '#fff', fontWeight: 600, color: 'var(--text)', boxShadow: '0 1px 2px rgba(20,23,43,.08)' } : { color: 'var(--text2)' }}>
              {a === 'all' ? 'All' : AREA_LABEL[a]} {count(a)}
            </button>
          ))}
        </div>
      </div>

      {confirms > 0 && (area === 'all' || area === 'money') && (
        <section id="confirm" className="wl-card px-4 md:px-5 py-3.5">
          <h2 className="text-[14px] font-bold flex items-center gap-2" style={{ color: 'var(--text)' }}><span className="w-2 h-2 rounded-full" style={{ background: GROUP_DOT.today }} />Answer these today</h2>
          <p className="text-[12px] mt-0.5" style={{ color: 'var(--text3)' }}>Entries whose day has come, money that should have landed, and bills to confirm. One tap each.</p>
          <ul className="mt-1.5">
            <BillReminders bills={p.bills} skips={p.billSkips} txns={p.txns} today={p.today} accounts={p.accounts} foundCount={foundCount} />
            <LandedChecks txns={p.txns} today={p.today} fx={p.fx} />
            <IncomeChecks plans={p.plans} txns={p.txns} today={p.today} fx={p.fx} />
            <PendingConfirms pending={p.pending} accName={accName} />
          </ul>
        </section>
      )}

      {groups.length === 0 && !confirms ? (
        <div className="wl-card px-6 py-12 flex flex-col items-center text-center gap-2">
          <div className="w-11 h-11 rounded-full flex items-center justify-center text-[20px]" style={{ background: 'var(--income-bg)', color: 'var(--income)' }}>✓</div>
          <div className="text-[15px] font-semibold" style={{ color: 'var(--text)' }}>Nothing needs you{area !== 'all' ? ` on ${AREA_LABEL[area]}` : ''}</div>
          <div className="text-[12.5px]" style={{ color: 'var(--text3)' }}>New things show up here, on the bell and on Home as they come up.</div>
        </div>
      ) : groups.map(({ g, items }) => (
        <section key={g} className="wl-card px-4 md:px-5 py-3">
          <h2 className="text-[11px] font-bold uppercase tracking-[.07em] flex items-center gap-2 py-1" style={{ color: GROUP_INK[g] }}><span className="w-2 h-2 rounded-full" style={{ background: GROUP_DOT[g] }} />{GROUP_LABEL[g]}</h2>
          <ul>
            {items.map(i => (
              <li key={i.id} className="grid grid-cols-[36px_minmax(0,1fr)] md:grid-cols-[36px_minmax(0,1fr)_auto] gap-x-3 gap-y-2 items-center py-3" style={{ borderTop: '1px solid #F0F1F5' }}>
                <span className="w-9 h-9 rounded-[11px] flex items-center justify-center text-[15px]" style={ICON_BG[g]} aria-hidden="true">{i.icon}</span>
                <span className="min-w-0">
                  <span className="block text-[13.5px] font-semibold" style={{ color: 'var(--text)' }}>{i.title}<span className="ml-1.5 text-[10.5px] font-semibold px-1.5 py-[1px] rounded-full align-[1px]" style={{ background: '#F1F2F6', color: '#5F657A' }}>{AREA_LABEL[i.area]}</span></span>
                  <span className="block text-[12px] mt-0.5" style={{ color: 'var(--text3)' }}>{i.detail}</span>
                </span>
                <span className="col-start-2 md:col-start-auto flex items-center gap-1.5 relative">
                  {i.upload ? <button onClick={() => setUploadOpen(true)} className="wl-btn wl-btn-primary" style={{ height: 36 }}>{i.action}</button>
                    : <Link href={i.href} className="wl-btn wl-btn-primary" style={{ height: 36 }}>{i.action}</Link>}
                  <button onClick={() => setMenu(m => (m === i.id ? null : i.id))} aria-expanded={menu === i.id} className="wl-btn" style={{ height: 36 }}>Later ▾</button>
                  {menu === i.id && (
                    <span role="menu" className="absolute right-0 top-[42px] z-20 w-[170px] rounded-xl p-1 bg-white flex flex-col" style={{ border: '1px solid var(--line)', boxShadow: '0 12px 30px rgba(20,23,43,.14)' }}>
                      {([['Tomorrow', 1], ['Next week', 7], ['Next month', 30], ['Not for me', null]] as const).map(([l, d]) => (
                        <button key={l} role="menuitem" onClick={() => later(i.id, d)} className="text-left h-9 px-3 rounded-lg text-[13px] hover:bg-[#F5F3FE]" style={{ color: d == null ? '#B4231A' : 'var(--text)' }}>{l}</button>
                      ))}
                    </span>
                  )}
                </span>
              </li>
            ))}
          </ul>
        </section>
      ))}

      {t.hiddenCount > 0 && (
        <button onClick={t.unhideAll} className="self-start text-[12.5px] font-semibold" style={{ color: 'var(--accent)' }}>Show {t.hiddenCount} hidden for later</button>
      )}
    </div>
  )
}
