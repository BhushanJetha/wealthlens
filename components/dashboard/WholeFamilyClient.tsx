'use client'
import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { ArrowLeftRight, ArrowUpRight, ChevronRight } from 'lucide-react'
import { useViewStore } from '@/store/viewStore'
import { fmtCompact, fmtMoney } from '@/lib/format'
import { fmtDay, localToday } from '@/lib/insights'
import { labelOf } from '@/lib/money'
import { viewAmount } from '@/lib/netWorth'
import { familyMoves, personFigures, byPerson, familyRecent, familyDues, type FamilyPerson, type PersonFigures, type ByPerson } from '@/lib/familyView'
import { MobileControls } from '@/components/layout/MobileHeader'
import { switchView } from '@/components/layout/FamilyBar'

const TAG = ['#F0EDFF', '#FDECF2', '#E7F7EF', '#FFF2E2', '#E7F1FE'], TAG_INK = ['#5640D6', '#A02A57', '#14603F', '#8A5A12', '#1D5FA8']
const Card = ({ title, right, children, className = '' }: { title: string; right?: React.ReactNode; children: React.ReactNode; className?: string }) => (
  <section className={`wl-card px-4 md:px-5 py-3.5 md:py-[18px] min-w-0 ${className}`}>
    <div className="flex items-center justify-between gap-2"><h2 className="text-[14px] font-semibold" style={{ color: 'var(--text)' }}>{title}</h2>{right}</div>
    {children}
  </section>
)

// Read only: the family's money, each person worked out on their own and added up
export default function WholeFamilyClient({ today: serverToday, people: raw }: { today: string; people: FamilyPerson[] }) {
  const { view, toMonth, fxRate: FX } = useViewStore()
  const [today, setToday] = useState(serverToday)
  useEffect(() => setToday(localToday()), [])
  const cur = view === 'uae' ? 'AED' : 'INR'
  const short = (n: number) => fmtCompact(n, cur)
  const month = toMonth > today.slice(0, 7) ? today.slice(0, 7) : toMonth
  const monthName = new Date(`${month}-01T00:00:00`).toLocaleDateString('en-GB', { month: 'long', year: 'numeric' })

  const { people, moves } = useMemo(() => familyMoves(raw), [raw])
  const figures = useMemo(() => people.map(p => personFigures(p, { view, fx: FX, today, month })), [people, view, FX, today, month])
  const total = (k: keyof PersonFigures) => figures.reduce((s, f) => s + (f[k] as number), 0)
  const inMonth = moves.filter(m => m.date.slice(0, 7) === month && (view === 'consolidated' || (view === 'uae' ? m.currency === 'AED' : m.currency !== 'AED')))
  const dues = useMemo(() => familyDues(people, { view, today, days: 30 }), [people, view, today])
  const recent = useMemo(() => familyRecent(people, 5), [people])
  const categories = useMemo(() => byPerson(figures, f => f.categories.map(c => ({ key: c.cat, label: c.label, value: c.value }))), [figures])
  const assets = useMemo(() => byPerson(figures, f => f.assets), [figures])
  const dueTotal = dues.slice(0, 5).reduce((s, d) => s + viewAmount(d.amount, d.currency, view, FX), 0)
  const colorOf = (name: string) => Math.max(0, people.findIndex(p => p.name === name)) % TAG.length
  const Tag = ({ who }: { who: string }) => {
    const i = colorOf(who)
    return <span className="text-[11px] font-semibold px-[7px] py-[2px] rounded-full flex-shrink-0" style={{ background: TAG[i], color: TAG_INK[i] }}>{who}</span>
  }

  const summary: { key: keyof PersonFigures; label: string }[] = [
    { key: 'cash', label: 'Bank & cash' }, { key: 'cameIn', label: 'Came in' }, { key: 'spent', label: 'Spent' }, { key: 'saved', label: 'Saved' },
    { key: 'investments', label: 'Investments' }, { key: 'cards', label: 'Card bills' }, { key: 'loans', label: 'Loans' },
  ]

  const Table = ({ rows, first }: { rows: ByPerson[]; first: string }) => (
    <div className="overflow-x-auto mt-2">
      <table className="w-full text-[13px] tabular-nums" style={{ minWidth: 120 + people.length * 80 }}>
        <thead><tr>
          <th scope="col" className="text-left font-medium text-[11.5px] py-1.5" style={{ color: 'var(--text3)' }}>{first}</th>
          {people.map(p => <th key={p.id} scope="col" className="text-right font-medium text-[11.5px] py-1.5 pl-2" style={{ color: 'var(--text3)' }}>{p.name}</th>)}
          <th scope="col" className="text-right font-semibold text-[11.5px] py-1.5 pl-2" style={{ color: 'var(--text)' }}>Family</th>
        </tr></thead>
        <tbody>{rows.map(r => (
          <tr key={r.key} style={{ borderTop: '1px solid #F1F5F9' }}>
            <th scope="row" className="text-left font-normal py-2 pr-2" style={{ color: 'var(--text)' }}>{labelOf(r.label)}</th>
            {r.values.map((v, i) => <td key={i} className="text-right py-2 pl-2" style={{ color: 'var(--text2)' }}>{Math.abs(v) > 0.5 ? short(v) : '—'}</td>)}
            <td className="text-right py-2 pl-2 font-semibold" style={{ color: 'var(--text)' }}>{short(r.total)}</td>
          </tr>
        ))}</tbody>
      </table>
      {rows.length === 0 && <div className="text-[12.5px] py-3" style={{ color: 'var(--text3)' }}>Nothing here yet.</div>}
    </div>
  )

  return (
    <div className="max-w-[1280px] mx-auto flex flex-col gap-3.5 md:gap-4 animate-fade-up">
      <div>
        <h1 className="text-[22px] md:text-[24px] font-bold tracking-[-0.01em]" style={{ color: 'var(--text)' }}>Whole family</h1>
        <p className="text-[12.5px] md:text-[13px] mt-0.5" style={{ color: 'var(--text3)' }}>{monthName} · each person’s own numbers, added up · view only</p>
      </div>
      <div className="md:hidden"><MobileControls actions={false} /></div>

      <div className="grid grid-cols-1 lg:grid-cols-[1fr_1.5fr] gap-3.5 md:gap-4">
        <section className="rounded-[18px] md:rounded-[20px] bg-review text-white px-4 md:px-[22px] py-4 md:py-5 flex flex-col justify-center">
          <div className="text-[11px] font-semibold uppercase tracking-[0.06em]" style={{ color: '#DAD3FF' }}>Family net worth</div>
          <div className="text-[30px] md:text-[38px] font-bold tabular-nums tracking-[-0.02em] leading-tight mt-1 truncate">{short(total('netWorth'))}</div>
          <div className="text-[12.5px]" style={{ color: '#E6E0FF' }}>{short(total('owned'))} owned · {short(total('owed'))} owed</div>
          <div className="grid gap-2 mt-3" style={{ gridTemplateColumns: `repeat(${Math.min(figures.length, 3)}, minmax(0, 1fr))` }}>
            {figures.map(f => {
              const body = <><span className="block text-[11.5px] truncate" style={{ color: '#E6E0FF' }}>{f.person.name}</span><span className="block text-[14px] font-semibold tabular-nums truncate">{short(f.netWorth)}</span></>
              const cls = 'rounded-xl px-2.5 py-2 text-left min-w-0 block w-full'
              return f.person.isMe
                ? <Link key={f.person.id} href="/dashboard/net-worth" className={cls} style={{ background: 'rgba(255,255,255,.12)' }}>{body}</Link>
                : <button key={f.person.id} onClick={() => switchView(f.person.id)} aria-label={`Open ${f.person.name}’s money`} className={cls} style={{ background: 'rgba(255,255,255,.12)' }}>{body}</button>
            })}
          </div>
        </section>

        <Card title="By person" right={<span className="text-[12px]" style={{ color: 'var(--text3)' }}>Came in, spent, saved: {monthName}</span>}>
          <Table first="" rows={summary.map(s => ({ key: String(s.key), label: s.label, values: figures.map(f => f[s.key] as number), total: total(s.key) }))} />
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3.5 md:gap-4">
        <Card title="Spending by category" right={<span className="text-[12px]" style={{ color: 'var(--text3)' }}>{monthName}</span>}>
          <Table first="Category" rows={categories.slice(0, 8)} />
        </Card>
        <Card title="What you own">
          <Table first="Type" rows={assets} />
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3.5 md:gap-4">
        <Card title="Coming up" right={<span className="text-[13px] font-semibold tabular-nums" style={{ color: 'var(--text)' }}>{short(dueTotal)}</span>}>
          <ul className="mt-1.5">
            {dues.slice(0, 5).map(d => (
              <li key={`${d.who}-${d.id}`} className="flex items-center gap-2 py-2" style={{ borderTop: '1px solid #F1F5F9' }}>
                <Tag who={d.who} />
                <span className="min-w-0 flex-1"><span className="block text-[13px] font-medium truncate" style={{ color: 'var(--text)' }}>{d.label}</span><span className="block text-[11.5px]" style={{ color: 'var(--text3)' }}>{fmtDay(d.date)}</span></span>
                <span className="text-[13px] font-semibold tabular-nums flex-shrink-0" style={{ color: 'var(--text)' }}>{fmtCompact(d.amount, d.currency)}</span>
              </li>
            ))}
            {dues.length === 0 && <li className="text-[12.5px] py-3" style={{ color: 'var(--text3)' }}>Nothing due from anyone’s bank in the next 30 days.</li>}
          </ul>
        </Card>
        <Card title="Recent">
          <ul className="mt-1.5">
            {recent.map(({ t, who }) => (
              <li key={`${who}-${t.id}`} className="flex items-center gap-2 py-2" style={{ borderTop: '1px solid #F1F5F9' }}>
                <Tag who={who} />
                <span className="min-w-0 flex-1"><span className="block text-[13px] font-medium truncate" style={{ color: 'var(--text)' }}>{t.merchant || labelOf(t.category)}</span><span className="block text-[11.5px] truncate" style={{ color: 'var(--text3)' }}>{labelOf(t.category)} · {fmtDay(t.txn_date)}</span></span>
                <span className="text-[13px] font-semibold tabular-nums flex-shrink-0" style={{ color: 'var(--text)' }}>{fmtMoney(Number(t.amount) || 0, t.currency)}</span>
              </li>
            ))}
          </ul>
        </Card>
      </div>

      {inMonth.length > 0 && (
        <Card title="Moved between you">
          <p className="text-[12.5px] mt-1" style={{ color: 'var(--text3)' }}>Money from one of you to another isn’t spending or income here, so these aren’t in the totals above. On a person’s own screens it still shows as they recorded it.</p>
          <ul className="mt-1.5 grid md:grid-cols-2 gap-x-6">
            {inMonth.map((m, i) => (
              <li key={i} className="flex items-center gap-2.5 py-2" style={{ borderTop: '1px solid #F1F5F9' }}>
                <ArrowLeftRight size={14} className="flex-shrink-0" style={{ color: 'var(--text3)' }} />
                <span className="min-w-0 flex-1 text-[13px] truncate" style={{ color: 'var(--text2)' }}>{m.from} → {m.to} · {fmtDay(m.date)}</span>
                <span className="text-[13px] tabular-nums flex-shrink-0" style={{ color: 'var(--text2)' }}>{fmtMoney(m.amount, m.currency)}</span>
              </li>
            ))}
          </ul>
        </Card>
      )}

      <div className="grid gap-2.5" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))' }}>
        {people.filter(p => !p.isMe).map(p => (
          <button key={p.id} onClick={() => switchView(p.id)} className="wl-card px-4 py-3 flex items-center gap-2.5 text-left">
            <ArrowUpRight size={16} style={{ color: 'var(--accent)' }} />
            <span className="flex-1 min-w-0 text-[13.5px] font-semibold truncate" style={{ color: 'var(--text)' }}>Open {p.name}’s full detail</span>
            <ChevronRight size={16} style={{ color: 'var(--text4)' }} />
          </button>
        ))}
      </div>
    </div>
  )
}
