'use client'
import { useState } from 'react'
import { ChevronDown, ChevronRight } from 'lucide-react'
import type { AccountGroups, GroupAccount, GroupLine } from '@/lib/accountFlows'
import { isNre, isNro } from '@/lib/ledger'

const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

// How each kind of line looks: sign, colour, and a small tag
function style(l: GroupLine, card: boolean, colorOf: (c?: string) => string) {
  if (card) {
    if (l.dir === 'out') return l.kind === 'spend' ? { sign: '', dot: colorOf(l.category), ink: 'var(--text)' } : { sign: '', dot: '#F29A2E', ink: 'var(--text)', tag: 'EMI', tagBg: '#FFF2E2', tagInk: '#9A5A08' }
    if (l.kind === 'payment') return { sign: '', dot: '#3B8EF0', ink: 'var(--text2)', tag: 'payment', tagBg: '#E7F1FE', tagInk: '#1D5FA8' }
    if (l.kind === 'refund') return { sign: '', dot: '#10B981', ink: 'var(--text2)', tag: 'refund', tagBg: '#E7F7EF', tagInk: '#1E7A50' }
    return { sign: '', dot: '#94A3B8', ink: 'var(--text3)' }
  }
  if (l.dir === 'in') return l.kind === 'income' ? { sign: '+', dot: '#1E8F5F', ink: 'var(--text)' }
    : l.external ? { sign: '+', dot: '#1E8F5F', ink: 'var(--text2)', tag: 'money in', tagBg: '#E7F7EF', tagInk: '#1E7A50' }
    : { sign: '+', dot: '#8A89A3', ink: 'var(--text3)', tag: 'from your account', tagBg: '#F1F0F7', tagInk: '#5B5A75' }
  switch (l.kind) {
    case 'spend': return l.category === 'Transfer'
      ? { sign: '−', dot: '#D97706', ink: 'var(--text)', tag: 'to sort', tagBg: '#FFF2E2', tagInk: '#9A5A08' }
      : { sign: '−', dot: colorOf(l.category), ink: 'var(--text)' }
    case 'emi': return { sign: '−', dot: '#F29A2E', ink: 'var(--text)', tag: 'EMI', tagBg: '#FFF2E2', tagInk: '#9A5A08' }
    case 'invest': return { sign: '−', dot: '#2FB67C', ink: 'var(--text)', tag: 'investing', tagBg: '#E7F7EF', tagInk: '#1E7A50' }
    case 'card': return { sign: '−', dot: '#9333EA', ink: 'var(--text)', tag: 'card bill', tagBg: '#F3E8FF', tagInk: '#7E22CE' }
    default: return l.external
      ? { sign: '−', dot: '#F29A2E', ink: 'var(--text)', tag: 'money out', tagBg: '#FFF2E2', tagInk: '#9A5A08' }
      : { sign: '−', dot: '#8A89A3', ink: 'var(--text3)', tag: 'to your account', tagBg: '#F1F0F7', tagInk: '#5B5A75' }
  }
}

const badgeOf = (a: any) => a._unlinked ? { t: '?', bg: '#F1F5F9', ink: '#64748B' }
  : a.account_type === 'credit_card' ? { t: 'CC', bg: '#F3E8FF', ink: '#7E22CE' }
  : a.account_type === 'wallet' ? { t: '₵', bg: '#E7F7EF', ink: '#1E7A50' }
  : isNre(a) ? { t: 'NRE', bg: '#E7F1FE', ink: '#1D5FA8' }
  : isNro(a) ? { t: 'NRO', bg: '#E7F1FE', ink: '#1D5FA8' }
  : a.currency === 'AED' ? { t: 'AE', bg: '#FFF2E2', ink: '#9A5A08' } : { t: 'IN', bg: '#E7F1FE', ink: '#1D5FA8' }

// The Expense report's table, grouped: bank accounts (what came in, every
// rupee or dirham that left) and credit cards (what was bought on each), then
// came in − money out of your bank accounts = left in your accounts. Groups
// and accounts fold away. Phones get the focus month as cards.
export default function AccountGroupTable({ groups, months, focus, cell, money, colorOf, isHighlighted, viewNote, onDrill, sentLabel = 'Sent outside these accounts', byYear = false }: {
  groups: AccountGroups; months: string[]; focus: number; sentLabel?: string
  byYear?: boolean                   // columns are years, not months
  cell: (n: number) => string; money: (n: number) => string; colorOf: (c?: string) => string
  isHighlighted: (m: string) => boolean; viewNote: (a: any) => string
  onDrill: (title: string, subtitle: string, items: any[]) => void
}) {
  const [closed, setClosed] = useState<Set<string>>(new Set())
  // Phones: the first account in each group open, the rest folded
  const [pClosed, setPClosed] = useState<Set<string>>(() => new Set([...groups.banks.slice(1), ...groups.cards.slice(1)].map(g => g.id)))
  const flip = (set: typeof setClosed) => (id: string) => set(s => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n })
  const toggle = flip(setClosed), pToggle = flip(setPClosed)
  const allIds = [...groups.banks, ...groups.cards].map(g => g.id)
  const sum = (v: number[]) => v.reduce((a, b) => a + b, 0)
  const mLabel = (m: string) => byYear ? m : `${MON[Number(m.slice(5)) - 1]} ${m.slice(0, 4)}`
  const unit = byYear ? 'year' : 'month'
  const cols = `minmax(360px, 2fr) repeat(${months.length}, minmax(78px, 1fr)) minmax(100px, 1fr)`
  const minW = 360 + months.length * 78 + 100
  // −₹65,966, never ₹-65,966; banks' net change also gets a +
  const amt = (v: number, plus = false) => `${v < 0 ? '−' : plus && v > 0 ? '+' : ''}${cell(Math.abs(v))}`
  const full = (v: number, plus = false) => `${v < 0 ? '−' : plus && v > 0 ? '+' : ''}${money(Math.abs(v))}`

  const Cells = ({ values, color, bold, signed }: { values: number[]; color?: string; bold?: boolean; signed?: boolean }) => (<>
    {[...values, sum(values)].map((v, i) => {
      const isTotal = i === values.length
      const c = signed ? (v > 0 ? '#1E8F5F' : v < 0 ? '#D9482F' : 'var(--text4)') : v ? color ?? 'var(--text)' : 'var(--text4)'
      return (
        <div key={i} className="text-right tabular-nums text-[12.5px] px-2 whitespace-nowrap" style={{ color: c, fontWeight: bold || isTotal ? 700 : 500, background: !isTotal && isHighlighted(months[i]) ? 'rgba(106,85,232,.05)' : undefined, borderLeft: isTotal ? '1.5px solid var(--line)' : undefined, alignSelf: 'stretch', display: 'flex', alignItems: 'center', justifyContent: 'flex-end' }}>
          {v ? amt(v, signed) : '—'}
        </div>
      )
    })}
  </>)

  const balanceRow = (label: string, tag: string, values: (number | null)[], bg: string, ink: string) => (
    <div className="grid items-center" style={{ gridTemplateColumns: cols, borderTop: '1px solid #F1F0F7', minHeight: 38, background: bg }}>
      <div className="sticky left-0 z-[1] flex items-center gap-2 py-1.5 pl-[50px] pr-3 min-w-0" style={{ background: bg }}>
        <span className="text-[12.5px] font-bold truncate" style={{ color: ink }}>{label}</span>
        <span className="text-[10px] font-semibold px-1.5 py-[1px] rounded-full flex-shrink-0" style={{ background: '#FFFFFF', color: 'var(--text3)', border: '1px solid var(--line)' }}>{tag}</span>
      </div>
      {[...values, null].map((v, i) => (
        <div key={i} className="text-right tabular-nums text-[12.5px] px-2 whitespace-nowrap font-bold self-stretch flex items-center justify-end"
          style={{ color: ink, background: i < values.length && isHighlighted(months[i]) ? 'rgba(106,85,232,.05)' : undefined, borderLeft: i === values.length ? '1.5px solid var(--line)' : undefined }}>
          {v == null ? '' : amt(v)}
        </div>
      ))}
    </div>
  )
  const accountRows = (g: GroupAccount) => {
    const open = !closed.has(g.id), b = badgeOf(g.account)
    const known = g.start.some(v => v != null)
    return (
      <div key={g.id}>
        <button onClick={() => toggle(g.id)} aria-expanded={open} className="grid w-full text-left items-center hover:bg-[#FAFAFE]" style={{ gridTemplateColumns: cols, borderTop: '1px solid #F1F0F7', minHeight: 48 }}>
          <div className="sticky left-0 z-[1] flex items-center gap-2.5 py-2 pl-7 pr-3 bg-white min-w-0">
            {open ? <ChevronDown size={13} style={{ color: 'var(--text4)' }} /> : <ChevronRight size={13} style={{ color: 'var(--text4)' }} />}
            <span className="w-[30px] h-[30px] rounded-[9px] flex items-center justify-center text-[10.5px] font-bold flex-shrink-0" style={{ background: b.bg, color: b.ink }}>{b.t}</span>
            <span className="min-w-0">
              <span className="block text-[13.5px] font-semibold truncate" style={{ color: 'var(--text)' }}>{g.account.name}</span>
              <span className="block text-[11.5px] truncate" style={{ color: 'var(--text4)' }}>{viewNote(g.account)} · {g.card ? 'charged' : 'net change'}</span>
            </span>
          </div>
          <Cells values={g.head} signed={!g.card} bold />
        </button>
        {open && known && balanceRow(g.card ? 'Owed at the start' : `Started the ${unit} with`, 'from your balances', g.start, g.card ? '#FBF7FF' : '#F5F9FF', 'var(--text)')}
        {open && g.lines.map(l => {
          const s = style(l, g.card, colorOf)
          return (
            <div key={l.key} className="grid items-center" style={{ gridTemplateColumns: cols, borderTop: '1px solid #F6F5FA', minHeight: 36 }}>
              <div className="sticky left-0 z-[1] flex items-center gap-2 py-1.5 pl-[70px] pr-3 bg-white min-w-0">
                {s.sign ? <span className="w-3 text-[13px] font-bold flex-shrink-0" style={{ color: s.dot }}>{s.sign}</span> : <i className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: s.dot }} />}
                <span className="text-[12.5px] truncate" style={{ color: s.ink }} title={l.label}>{l.label}</span>
                {s.tag && <span className="text-[10px] font-semibold px-1.5 py-[1px] rounded-full flex-shrink-0" style={{ background: s.tagBg, color: s.tagInk }}>{s.tag}</span>}
              </div>
              {[...l.values, l.total].map((v, i) => {
                const isTotal = i === l.values.length
                const items = isTotal ? l.items.flat() : l.items[i]
                return (
                  <div key={i} className="text-right tabular-nums text-[12.5px] px-2 self-stretch flex items-center justify-end whitespace-nowrap" style={{ color: v ? s.ink : 'var(--text4)', fontWeight: isTotal ? 700 : 400, background: !isTotal && isHighlighted(months[i]) ? 'rgba(106,85,232,.05)' : undefined, borderLeft: isTotal ? '1.5px solid var(--line)' : undefined }}>
                    {v ? <button onClick={() => onDrill(`${l.label} · ${g.account.name}`, isTotal ? `All ${unit}s` : mLabel(months[i]), items)} className="hover:underline" style={{ color: 'inherit' }}>{cell(v)}</button> : '—'}
                  </div>
                )
              })}
            </div>
          )
        })}
        {open && known && balanceRow(g.card ? '= Owed at the end' : `= Left at the end of the ${unit}`, 'started + in − out', g.end, g.card ? '#FBF7FF' : '#F0FAF5', g.card ? 'var(--text)' : '#1E8F5F')}
      </div>
    )
  }

  const section = (id: string, title: string, sub: string, values: number[], bg: string, list: GroupAccount[]) => {
    if (!list.length) return null
    const open = !closed.has(id)
    return (
      <div>
        <button onClick={() => toggle(id)} aria-expanded={open} className="grid w-full text-left items-center" style={{ gridTemplateColumns: cols, borderTop: '1px solid var(--line)', background: bg, minHeight: 56 }}>
          <div className="sticky left-0 z-[1] flex items-center gap-2.5 py-2.5 pl-4 pr-3 min-w-0" style={{ background: bg }}>
            <span className="w-[22px] h-[22px] rounded-[7px] flex items-center justify-center bg-white flex-shrink-0" style={{ border: '1px solid var(--accent-border)', color: 'var(--accent2)' }}>{open ? <ChevronDown size={13} /> : <ChevronRight size={13} />}</span>
            <span className="min-w-0">
              <span className="block text-[12.5px] font-bold uppercase tracking-[0.03em]" style={{ color: 'var(--text)' }}>{title}</span>
              <span className="block text-[11.5px] truncate" style={{ color: 'var(--text3)' }}>{sub}</span>
            </span>
          </div>
          <Cells values={values} bold />
        </button>
        {open && list.map(accountRows)}
      </div>
    )
  }

  // All bank accounts together, each type on its own line
  type Total = { label: string; sub: string; values: (number | null)[]; ink: string; bg: string; signed?: boolean; strong?: boolean }
  const T = groups.byType
  const totals: Total[] = [
    ...(groups.startTotal.some(v => v != null) ? [{ label: `Started the ${unit} with`, sub: 'all bank and cash balances, where known', values: groups.startTotal, ink: 'var(--text)', bg: '#F5F9FF', strong: true }] : []),
    { label: '+ Came in', sub: 'salary and other income', values: groups.income, ink: '#1E8F5F', bg: '#FFFFFF' },
    ...(sum(groups.otherIn) > 0 ? [{ label: '+ Other money in', sub: 'from outside these accounts — received from UAE, loan money', values: groups.otherIn, ink: '#1E8F5F', bg: '#FFFFFF' }] : []),
    ...([['− Spending from bank & cash', 'rent, bills, school, family…', T.spend], ['− EMIs', 'loans paid from the bank', T.emi], ['− Investing', 'SIPs and other investments', T.invest],
      ['− Card bills', 'what you bought on cards is below the cards', T.card], [`− ${sentLabel}`, 'money that left these accounts', T.sentOut]] as [string, string, number[]][])
      .filter(([, , v]) => sum(v) > 0).map(([label, sub, values]) => ({ label, sub, values, ink: 'var(--text)', bg: '#FFFFFF' })),
    { label: '= Came in − went out', sub: 'moves between your own accounts cancel out', values: groups.left, ink: '#1E8F5F', bg: '#F0FAF5', signed: true, strong: true },
    ...(groups.endTotal.some(v => v != null) ? [{ label: `= Left at the end of the ${unit}`, sub: 'started with + came in − went out', values: groups.endTotal, ink: '#1E8F5F', bg: '#F0FAF5', strong: true }] : []),
    { label: 'Spent on cards', sub: 'paid through the card bills above', values: groups.charged, ink: '#7E22CE', bg: '#FBF7FF' },
    ...(sum(groups.friendPaid) > 0 ? [{ label: 'Paid for you by friends', sub: 'your share — nothing left your accounts; you owe them', values: groups.friendPaid, ink: '#B45309', bg: '#FFFBF5' }] : []),
    { label: 'All spending, by category', sub: 'paid from bank + bought on cards + paid by friends — what your budgets use', values: groups.allSpend, ink: 'var(--accent2)', bg: '#FAFAFE' },
  ]

  // ── Phone: the focus month as cards ──
  const pAccount = (g: GroupAccount) => {
    const open = !pClosed.has(g.id), b = badgeOf(g.account), head = g.head[focus] ?? 0
    const lines = g.lines.filter(l => l.values[focus])
    return (
      <div key={g.id} className="wl-card overflow-hidden">
        <button onClick={() => pToggle(g.id)} aria-expanded={open} className="w-full flex items-center justify-between gap-2.5 px-3.5 py-2.5 text-left" style={{ minHeight: 56 }}>
          <span className="flex items-center gap-2.5 min-w-0">
            <span className="w-8 h-8 rounded-[10px] flex items-center justify-center text-[10.5px] font-bold flex-shrink-0" style={{ background: b.bg, color: b.ink }}>{b.t}</span>
            <span className="min-w-0">
              <span className="block text-[14px] font-semibold truncate" style={{ color: 'var(--text)' }}>{g.account.name}</span>
              <span className="block text-[11.5px] truncate" style={{ color: 'var(--text4)' }}>{viewNote(g.account)}</span>
            </span>
          </span>
          <span className="text-right flex-shrink-0">
            <span className="block text-[14px] font-bold tabular-nums" style={{ color: g.card ? 'var(--text)' : head >= 0 ? '#1E8F5F' : '#D9482F' }}>{full(head, !g.card)}</span>
            <span className="block text-[11px]" style={{ color: 'var(--text4)' }}>{g.card ? 'charged' : 'net change'} {open ? '▾' : '▸'}</span>
          </span>
        </button>
        {open && (
          <div className="px-3.5 pb-2.5">
            {g.start[focus] != null && (
              <div className="flex justify-between gap-2.5 py-2 text-[13px] font-bold" style={{ borderTop: '1px solid #F3F2F8', color: 'var(--text)' }}>
                <span>{g.card ? 'Owed at the start' : `Started the ${unit} with`}</span><span className="tabular-nums">{full(g.start[focus]!)}</span>
              </div>
            )}
            {lines.length === 0 && <div className="text-[12.5px] py-2" style={{ color: 'var(--text4)' }}>Nothing this {unit}.</div>}
            {lines.map(l => {
              const s = style(l, g.card, colorOf)
              return (
                <button key={l.key} onClick={() => onDrill(`${l.label} · ${g.account.name}`, mLabel(months[focus]), l.items[focus])} className="w-full flex items-center justify-between gap-2.5 py-2 text-left" style={{ borderTop: '1px solid #F3F2F8' }}>
                  <span className="flex items-center gap-1.5 min-w-0 flex-wrap">
                    {s.sign ? <span className="w-3 text-[13px] font-bold" style={{ color: s.dot }}>{s.sign}</span> : <i className="w-2 h-2 rounded-full" style={{ background: s.dot }} />}
                    <span className="text-[13px]" style={{ color: s.ink }}>{l.label}</span>
                    {s.tag && <span className="text-[10px] font-semibold px-1.5 py-[1px] rounded-full" style={{ background: s.tagBg, color: s.tagInk }}>{s.tag}</span>}
                  </span>
                  <span className="text-[13px] font-semibold tabular-nums flex-shrink-0" style={{ color: s.ink }}>{money(l.values[focus])}</span>
                </button>
              )
            })}
            {g.end[focus] != null && (
              <div className="flex justify-between gap-2.5 py-2 text-[13px] font-bold" style={{ borderTop: '1.5px solid var(--line)', color: g.card ? 'var(--text)' : '#1E8F5F' }}>
                <span>{g.card ? '= Owed at the end' : `= Left at the end of the ${unit}`}</span><span className="tabular-nums">{full(g.end[focus]!)}</span>
              </div>
            )}
          </div>
        )}
      </div>
    )
  }
  const pGroup = (id: string, title: string, sub: string, total: string, bg: string, list: GroupAccount[]) => {
    if (!list.length) return null
    const open = !pClosed.has(id)
    return (
      <div className="flex flex-col gap-2">
        <button onClick={() => pToggle(id)} aria-expanded={open} className="w-full flex items-center justify-between px-3.5 rounded-[14px] text-left" style={{ minHeight: 50, background: bg, border: '1px solid var(--accent-border)' }}>
          <span>
            <span className="block text-[12.5px] font-bold uppercase tracking-[0.03em]" style={{ color: 'var(--text)' }}>{open ? '▾' : '▸'} {title}</span>
            <span className="block text-[11.5px]" style={{ color: 'var(--text3)' }}>{sub}</span>
          </span>
          <span className="text-[14px] font-bold tabular-nums" style={{ color: 'var(--text)' }}>{total}</span>
        </button>
        {open && list.map(pAccount)}
      </div>
    )
  }

  return (<>
    {/* Desktop and tablet: month by month */}
    <section className="hidden md:block wl-card overflow-hidden">
      <div className="flex flex-wrap items-center justify-between gap-2.5 px-5 py-3.5" style={{ borderBottom: '1px solid var(--line)' }}>
        <div>
          <h2 className="text-[15px] font-semibold" style={{ color: 'var(--text)' }}>Where your money went, account by account</h2>
          <div className="text-[12px]" style={{ color: 'var(--text3)' }}>Tap a group or an account to fold it · tap an amount to see its transactions</div>
        </div>
        <div className="flex gap-2">
          <button onClick={() => setClosed(new Set())} className="wl-btn" style={{ height: 32, fontSize: 12.5 }}>Open all</button>
          <button onClick={() => setClosed(new Set(allIds))} className="wl-btn" style={{ height: 32, fontSize: 12.5 }}>Fold accounts</button>
        </div>
      </div>
      <div className="overflow-x-auto">
        <div style={{ minWidth: minW }}>
          <div className="grid items-center text-[10.5px] font-semibold uppercase tracking-[0.05em]" style={{ gridTemplateColumns: cols, background: '#FAFAFE', color: 'var(--text3)', minHeight: 38 }}>
            <div className="sticky left-0 z-[1] pl-4" style={{ background: '#FAFAFE' }}>What</div>
            {months.map(m => <div key={m} className="text-right px-2 self-stretch flex items-center justify-end" style={{ background: isHighlighted(m) ? 'rgba(106,85,232,.08)' : undefined, color: isHighlighted(m) ? 'var(--accent2)' : undefined }}>{byYear ? m : MON[Number(m.slice(5)) - 1]}</div>)}
            <div className="text-right px-2" style={{ borderLeft: '1.5px solid var(--line)' }}>Total</div>
          </div>
          {section('bank', 'Bank accounts', 'Where your salary went · money out of each account', groups.moneyOut, '#F7F5FF', groups.banks)}
          {section('cards', 'Credit cards', 'What you bought on cards · paid through the card bills above', groups.charged, '#FBF5FF', groups.cards)}
          <div style={{ borderTop: '2px solid var(--line)' }}>
            {totals.map(t => (
              <div key={t.label} className="grid items-center" style={{ gridTemplateColumns: cols, background: t.bg, borderTop: '1px solid var(--line)', minHeight: 52 }}>
                <div className="sticky left-0 z-[1] py-2 pl-4 pr-3 min-w-0" style={{ background: t.bg }}>
                  <span className="block text-[13px]" style={{ color: t.ink, fontWeight: t.strong ? 700 : 600 }}>{t.label}</span>
                  <span className="block text-[11px]" style={{ color: 'var(--text4)' }}>{t.sub}</span>
                </div>
                {t.values.some(v => v == null)
                  ? [...t.values, null].map((v, i) => <div key={i} className="text-right tabular-nums text-[12.5px] px-2 whitespace-nowrap font-bold" style={{ color: t.ink, borderLeft: i === t.values.length ? '1.5px solid var(--line)' : undefined }}>{v == null ? '' : amt(v)}</div>)
                  : <Cells values={t.values as number[]} color={t.ink} bold signed={t.signed} />}
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>

    {/* Phones: the month picked at the top, as cards */}
    <div className="md:hidden flex flex-col gap-3">
      {pGroup('bank', 'Bank accounts', 'Where your salary went', `${money(groups.moneyOut[focus] ?? 0)} out`, '#F7F5FF', groups.banks)}
      {pGroup('cards', 'Credit cards', 'Paid through the card bills above', money(groups.charged[focus] ?? 0), '#FBF5FF', groups.cards)}
      <div className="wl-card px-3.5 py-1.5">
        {totals.filter(t => t.values[focus] != null).map((t, i) => (
          <div key={t.label} className="flex justify-between gap-3 py-2.5" style={{ borderTop: i ? '1px solid #F3F2F8' : 'none' }}>
            <span className="text-[13px] min-w-0" style={{ color: t.strong ? 'var(--text)' : 'var(--text2)', fontWeight: t.strong ? 700 : 500 }}>{t.label}</span>
            <span className="text-[13.5px] font-bold tabular-nums flex-shrink-0" style={{ color: t.ink }}>{full(t.values[focus] ?? 0, !!t.signed)}</span>
          </div>
        ))}
      </div>
    </div>
  </>)
}
