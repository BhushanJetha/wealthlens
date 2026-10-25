'use client'
import { useState, useMemo, useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { useViewStore } from '@/store/viewStore'
import MetricCard from '@/components/dashboard/MetricCard'
import AddTransactionModal from '@/components/forms/AddTransactionModal'
import BankStatementUploadModal from '@/components/forms/BankStatementUploadModal'
import BillImageUploadModal from '@/components/forms/BillImageUploadModal'
import TransactionVoiceModal from '@/components/forms/TransactionVoiceModal'
import ManageCategoriesSheet from '@/components/forms/ManageCategoriesSheet'
import { useCategoryStore } from '@/store/categoryStore'
import { colorOf } from '@/lib/categories'
import { toast } from '@/components/ui/toaster'

import Pagination from '@/components/dashboard/Pagination'
import { PenLine, BarChart2, Plus, Pencil, Trash2, Upload, Image, Mic, ChevronDown, Copy, Settings2 } from 'lucide-react'
import Link from 'next/link'
import { PageHeader, InsightBar, AiActions, KpiTile, HeroStat, Bars, Donut, ProgressRow, LearnStrip, PALETTE } from '@/components/ui/kit'
import { ListCard, ListRow, ListSearch, ChipFilter } from '@/components/ui/list'
import { addMonths, fmtDay } from '@/lib/insights'
import { fmtCompact } from '@/lib/format'
import { Star, Hash, Divide, Sprout } from 'lucide-react'

const MON = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']

type Modal = 'none' | 'manual' | 'statement' | 'bill' | 'voice'

export default function IncomeClient({ transactions, accounts, transfers = [] }: { transactions: any[]; accounts: any[]; transfers?: any[] }) {
  const { view, fromMonth, toMonth, fxRate: FX } = useViewStore()
  const [search, setSearch] = useState('')
  const [cat, setCat]       = useState('All')
  const [accFilter, setAccFilter] = useState('All')
  const [activeModal, setActiveModal] = useState<Modal>('none')
  const [page,        setPage]        = useState(1)
  const [pageSize,    setPageSize]    = useState(20)
  const [editing,     setEditing]     = useState<{ txn: any; duplicate?: boolean } | null>(null)
  const [manageCats,  setManageCats]  = useState(false)
  const { rows: categories, load: loadCategories } = useCategoryStore()
  useEffect(() => { loadCategories() }, [loadCategories])
  const [deletingId,  setDeletingId]  = useState<string | null>(null)
  const [showAddMenu, setShowAddMenu] = useState(false)
  const menuRef = useRef<HTMLDivElement>(null)
  const sheetRef = useRef<HTMLDivElement>(null)
  const router = useRouter()

  useEffect(() => {
    // Dropdown on desktop, bottom sheet on phones
    function onClickOutside(e: MouseEvent) {
      const t = e.target as Node
      if (!menuRef.current?.contains(t) && !sheetRef.current?.contains(t)) setShowAddMenu(false)
    }
    if (showAddMenu) document.addEventListener('mousedown', onClickOutside)
    return () => document.removeEventListener('mousedown', onClickOutside)
  }, [showAddMenu])

  const addButtons: { key: Modal; label: string; desc: string; icon: React.ElementType; color: string }[] = [
    { key: 'statement', label: 'Bank Statement',  desc: 'Parse a bank statement PDF for credits', icon: Upload,  color: '#059669' },
    { key: 'bill',      label: 'Receipt / Image',  desc: 'Scan a salary slip or receipt photo',    icon: Image,   color: '#D97706' },
    { key: 'voice',     label: 'Voice Entry',      desc: 'Speak your income aloud',                 icon: Mic,     color: '#7C3AED' },
    { key: 'manual',    label: 'Manual Entry',     desc: 'Type in an income entry manually',        icon: PenLine, color: '#16A34A' },
  ]

  const openEdit      = (t: any) => setEditing({ txn: t })
  const openDuplicate = (t: any) => setEditing({ txn: t, duplicate: true })
  async function deleteTxn(id: string) {
    if (!confirm('Delete this income entry?')) return
    setDeletingId(id)
    const res = await fetch(`/api/transactions?id=${id}`, { method: 'DELETE' })
    setDeletingId(null)
    toast(res.ok ? 'Income deleted' : 'Couldn’t delete it. Try again.', res.ok ? 'success' : 'error')
    router.refresh()
  }

  const sym = view === 'uae' ? 'AED ' : '₹'
  const toDisplay = (amt: number, cur: string) => view === 'consolidated' ? amt * (cur === 'AED' ? FX : 1) : amt
  const inRange = (d: string) => { const m = d?.slice(0,7) ?? ''; return m >= fromMonth && m <= toMonth }

  const filtered = useMemo(() => { setPage(1); return transactions.filter(t => {
    if (view === 'uae'   && t.currency !== 'AED') return false
    if (view === 'india' && t.currency !== 'INR') return false
    if (cat !== 'All'   && t.category !== cat)    return false
    if (accFilter !== 'All' && t.account_id !== accFilter) return false
    if (search && !t.merchant?.toLowerCase().includes(search.toLowerCase())) return false
    return true
  }) }, [transactions, view, cat, accFilter, search])

  const filteredForMonth = filtered.filter(t => inRange(t.txn_date))
  const total = filtered.reduce((a, t) => a + toDisplay(Number(t.amount), t.currency), 0)
  const rangeTotal = filteredForMonth.reduce((a, t) => a + toDisplay(Number(t.amount), t.currency), 0)

  const rangeLabel = fromMonth === toMonth
    ? new Date(fromMonth + '-01').toLocaleDateString('en-GB', { month: 'long', year: 'numeric' })
    : `${new Date(fromMonth + '-01').toLocaleDateString('en-GB', { month: 'short', year: 'numeric' })} – ${new Date(toMonth + '-01').toLocaleDateString('en-GB', { month: 'short', year: 'numeric' })}`

  // ── Design v2 summary ──
  const cur   = view === 'uae' ? 'AED' : 'INR'
  const short = (n: number) => fmtCompact(n, cur)
  const money = (n: number) => `${sym}${Math.round(n).toLocaleString('en-IN')}`
  const viewLabel = view === 'uae' ? 'UAE · AED' : view === 'india' ? 'India · INR' : 'Consolidated · INR'
  const spanMonths = (Number(toMonth.slice(0, 4)) - Number(fromMonth.slice(0, 4))) * 12 + Number(toMonth.slice(5)) - Number(fromMonth.slice(5)) + 1
  const prevFrom = addMonths(fromMonth, -spanMonths), prevTo = addMonths(fromMonth, -1)
  const prevLabel = spanMonths === 1 ? 'last month' : `the previous ${spanMonths} months`
  const prevTotal = filtered.filter(t => { const m = t.txn_date?.slice(0, 7) ?? ''; return m >= prevFrom && m <= prevTo })
    .reduce((a, t) => a + toDisplay(Number(t.amount), t.currency), 0)
  const chg = prevTotal > 0 ? Math.round((rangeTotal - prevTotal) / prevTotal * 1000) / 10 : null

  const barMonths = useMemo(() => {
    const n = Math.min(Math.max(spanMonths, 6), 12)
    const months = Array.from({ length: n }, (_, i) => addMonths(toMonth, i - n + 1))
    const tot: Record<string, number> = {}
    filtered.forEach(t => { const m = t.txn_date?.slice(0, 7); if (m && m >= months[0] && m <= toMonth) tot[m] = (tot[m] ?? 0) + toDisplay(Number(t.amount), t.currency) })
    return months.map(m => ({ label: MON[Number(m.slice(5)) - 1], value: tot[m] ?? 0, hi: m >= fromMonth && m <= toMonth,
      tip: `${MON[Number(m.slice(5)) - 1]} ${m.slice(0, 4)}: ${sym}${Math.round(tot[m] ?? 0).toLocaleString('en-IN')}` }))
  }, [filtered, fromMonth, toMonth, spanMonths, view, FX])

  const sources = useMemo(() => {
    const m: Record<string, number> = {}
    filteredForMonth.forEach(t => { m[t.category || 'Other'] = (m[t.category || 'Other'] ?? 0) + toDisplay(Number(t.amount), t.currency) })
    const rows = Object.entries(m).sort((a, b) => b[1] - a[1])
    const rest = rows.slice(5).reduce((a, r) => a + r[1], 0)
    return [...rows.slice(0, 5).map(([cat, v]) => ({ cat, v })), ...(rest > 0 ? [{ cat: 'Other sources', v: rest }] : [])]
  }, [filteredForMonth, view, FX])
  const top = sources[0]

  const insight = filteredForMonth.length === 0
    ? `No income recorded for ${rangeLabel} yet. Import a statement or add your salary to see trends.`
    : [
        top && `${top.cat} brings in ${short(top.v)} — ${Math.round(top.v / rangeTotal * 100)}% of your income in ${rangeLabel}.`,
        chg != null && `That's ${Math.abs(chg)}% ${chg >= 0 ? 'more' : 'less'} than ${prevLabel}.`,
        sources.length === 1 && 'All of it comes from one source — a second stream makes your plan sturdier.',
      ].filter(Boolean).join(' ')
  const aiContext = `My income for ${rangeLabel} (${viewLabel}): ${money(rangeTotal)} from ${filteredForMonth.length} entries. `
    + `Sources: ${sources.map(r => `${r.cat} ${short(r.v)}`).join(', ') || 'none'}.`
    + (chg != null ? ` ${chg >= 0 ? 'Up' : 'Down'} ${Math.abs(chg)}% vs ${prevLabel}.` : '')
    + ` Monthly totals: ${barMonths.map(b => b.tip).join('; ')}.`

  const addMenuList = (
    <>
      <div className="px-4 py-2.5 border-b text-[10px] uppercase tracking-wider font-bold"
        style={{ borderColor: 'var(--line)', color: 'var(--text3)', background: 'var(--bg2)' }}>
        How would you like to add?
      </div>
      {addButtons.map(({ key, label, desc, icon: Icon, color }) => (
        <button key={key}
          onClick={() => { setActiveModal(key); setShowAddMenu(false) }}
          className="w-full flex items-center gap-3 px-4 py-3 text-left transition-colors border-b last:border-b-0 hover:bg-[#F7F6FD]"
          style={{ borderColor: 'var(--line)' }}>
          <div className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0" style={{ background: color + '15', color }}>
            <Icon size={17} />
          </div>
          <div className="min-w-0">
            <div className="text-[12.5px] font-semibold" style={{ color: 'var(--text)' }}>{label}</div>
            <div className="text-[11px] leading-snug mt-0.5" style={{ color: 'var(--text3)' }}>{desc}</div>
          </div>
        </button>
      ))}
    </>
  )
  // Passive income: interest, dividends and rent
  const PASSIVE = ['Interest', 'Dividend', 'Rental']
  const passive = filteredForMonth.filter(t => PASSIVE.includes(t.category)).reduce((a, t) => a + toDisplay(Number(t.amount), t.currency), 0)

  // Category chips: only categories this period has, with counts
  // Income entries per category (all loaded history) for the manage sheet
  const catUsage = useMemo(() => {
    const n: Record<string, number> = {}
    transactions.forEach(t => { if (t.category) n[t.category] = (n[t.category] ?? 0) + 1 })
    return n
  }, [transactions])

  const catOptions = useMemo(() => {
    const n: Record<string, number> = {}
    let all = 0
    transactions.forEach(t => {
      if (view === 'uae' && t.currency !== 'AED') return
      if (view === 'india' && t.currency !== 'INR') return
      if (!inRange(t.txn_date) || (accFilter !== 'All' && t.account_id !== accFilter)) return
      n[t.category || 'Other'] = (n[t.category || 'Other'] ?? 0) + 1; all++
    })
    if (cat !== 'All' && !n[cat]) n[cat] = 0
    return [{ key: 'All', label: 'All', count: all }, ...Object.entries(n).sort((a, b) => b[1] - a[1]).map(([c, k]) => ({ key: c, label: c, count: k }))]
  }, [transactions, view, accFilter, fromMonth, toMonth, cat])

  const chgText = chg != null ? `${chg >= 0 ? '▲' : '▼'} ${Math.abs(chg)}% vs ${prevLabel}` : `${filteredForMonth.length} entr${filteredForMonth.length === 1 ? 'y' : 'ies'}`
  const chgTone = chg == null ? 'neutral' as const : chg >= 0 ? 'good' as const : 'bad' as const

  return (
    <div className="flex flex-col gap-3.5 md:gap-[18px] animate-fade-up">
      <div className="max-md:order-1">
        <PageHeader title="Income" sub={`${viewLabel} · ${rangeLabel}`}
          onAdd={() => setShowAddMenu(true)} addLabel="Add income"
          actions={<>
            <button onClick={() => setManageCats(true)} className="wl-btn" style={{ height: 34 }}><Settings2 size={14} />Categories</button>
            <Link href="/dashboard/income/report" className="wl-btn" style={{ height: 34 }}><BarChart2 size={14} />Annual report</Link>
            <div className="relative" ref={menuRef}>
              <button onClick={() => setShowAddMenu(v => !v)} aria-expanded={showAddMenu} aria-haspopup="menu"
                className="wl-btn wl-btn-primary" style={{ height: 34 }}>
                <Plus size={14} />Add income
                <ChevronDown size={13} style={{ transition: 'transform 0.2s', transform: showAddMenu ? 'rotate(180deg)' : 'none' }} />
              </button>
              {showAddMenu && (
                <div className="hidden md:block absolute right-0 top-full mt-2 w-72 rounded-2xl z-50 overflow-hidden"
                  style={{ background: '#fff', border: '1px solid var(--line)', boxShadow: '0 18px 50px rgba(15,23,42,.2)' }}>
                  {addMenuList}
                </div>
              )}
            </div>
          </>} />
      </div>
      {showAddMenu && (
        <div className="md:hidden fixed inset-0 z-50 wl-sheet" onClick={() => setShowAddMenu(false)}>
          <div ref={sheetRef} className="wl-sheet-panel bg-white" onClick={e => e.stopPropagation()}>{addMenuList}</div>
        </div>
      )}

      <div className="max-md:order-4"><InsightBar text={insight} prompt={`Explain my income page in plain language. ${aiContext}`} /></div>
      <div className="max-md:order-5"><AiActions actions={['Forecast next quarter', 'How can I grow my income?']} context={aiContext} /></div>

      {/* Headline number + monthly bars (same card on desktop and phone) + sources */}
      <div className="max-md:contents grid grid-cols-1 lg:grid-cols-[1.6fr_1fr] gap-4">
        <HeroStat className="max-md:order-2" label={`Income · ${rangeLabel}`} value={money(rangeTotal)} delta={chgText} tone={chgTone}
          right={<div className="flex gap-3.5 text-[11.5px]" style={{ color: 'var(--text3)' }}>
            <span><i className="inline-block w-[9px] h-[9px] rounded-sm mr-1.5" style={{ background: 'var(--accent)' }} />Selected period</span>
            <span><i className="inline-block w-[9px] h-[9px] rounded-sm mr-1.5" style={{ background: '#C9C2F5' }} />Earlier</span>
          </div>}>
          <Bars data={barMonths} className="h-[110px] md:h-auto md:flex-1 md:min-h-[200px] mt-2.5 md:mt-4" label={`Income by month: ${barMonths.map(b => b.tip).join(', ')}`} />
        </HeroStat>

        <section className="wl-card max-md:order-6 px-4 md:px-5 py-4 md:py-[18px] flex flex-col gap-3">
          <h2 className="text-[14px] font-semibold" style={{ color: 'var(--text)' }}>Where it came from</h2>
          {sources.length === 0 ? (
            <div className="text-[12.5px] py-6 text-center" style={{ color: 'var(--text3)' }}>No income in {rangeLabel}.</div>
          ) : (<>
            <div className="hidden md:flex justify-center">
              <Donut segments={sources.map((r, i) => ({ value: r.v, color: PALETTE[i % PALETTE.length] }))} size={128}
                label={`Income by source: ${sources.map(r => `${r.cat} ${short(r.v)}`).join(', ')}`}>
                <div className="text-[10.5px]" style={{ color: 'var(--text3)' }}>Income</div>
                <div className="text-[16px] font-bold" style={{ color: 'var(--text)' }}>{short(rangeTotal)}</div>
              </Donut>
            </div>
            {sources.map((r, i) => {
              const share = rangeTotal > 0 ? r.v / rangeTotal * 100 : 0
              const row = <ProgressRow name={r.cat} value={short(r.v)} right={`${Math.round(share)}%`} pct={share} color={PALETTE[i % PALETTE.length]} />
              return r.cat !== 'Other sources'
                ? <button key={r.cat} onClick={() => setCat(r.cat)} className="text-left" title={`Show only ${r.cat}`}>{row}</button>
                : <div key={r.cat}>{row}</div>
            })}
          </>)}
        </section>
      </div>

      {/* KPIs: same four tiles on both sizes */}
      <div className="max-md:order-3 grid grid-cols-2 lg:grid-cols-4 gap-2.5 md:gap-3.5">
        <KpiTile label="Top source" value={top ? top.cat : '—'} delta={top ? `${short(top.v)} · ${Math.round(top.v / Math.max(rangeTotal, 1) * 100)}%` : 'No income yet'} tint={0} icon={Star} />
        <KpiTile label="Passive income" value={money(passive)} tint={1} icon={Sprout}
          delta={rangeTotal > 0 ? `${Math.round(passive / rangeTotal * 100)}% · interest, dividends, rent` : 'Interest, dividends, rent'} />
        <KpiTile label="Entries" value={String(filteredForMonth.length)} delta={`${sources.length} source${sources.length === 1 ? '' : 's'}`} tint={3} icon={Hash} />
        <KpiTile label="Average entry" value={filteredForMonth.length ? money(rangeTotal / filteredForMonth.length) : '—'} delta={`All filtered: ${short(total)}`} tint={2} icon={Divide} />
      </div>

      {/* Income list: search, account and category filters live in the card */}
      <ListCard className="max-md:order-9" title="Income"
        sub={`${filteredForMonth.length} in ${rangeLabel}${cat !== 'All' ? ` · ${cat}` : ''}`}
        head={['Source', 'Category', 'Date', 'Amount']}
        right={<button onClick={() => setManageCats(true)} className="wl-btn flex-shrink-0" style={{ height: 30, fontSize: 12 }}><Settings2 size={13} />Categories</button>}
        toolbar={<>
          <ListSearch value={search} onChange={setSearch} placeholder="Search…">
            <select value={accFilter} onChange={e => setAccFilter(e.target.value)} aria-label="Account"
              className="wl-input max-w-[44%] md:max-w-[220px]" style={{ background: '#fff', width: 'auto', height: 36 }}>
              <option value="All">All accounts</option>
              {accounts.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
            </select>
          </ListSearch>
          <ChipFilter label="Category" value={cat} onChange={setCat} options={catOptions} />
        </>}
        empty={filteredForMonth.length === 0
          ? <div className="text-center py-12 text-[13px]" style={{ color: 'var(--text3)', borderTop: '1px solid var(--line)' }}>
              No income{cat !== 'All' ? ` in ${cat}` : ''} for {rangeLabel}.
            </div>
          : undefined}
        footer={filteredForMonth.length > 0 && <div>
          <Pagination total={filteredForMonth.length} page={page} pageSize={pageSize}
            onPage={setPage} onPageSize={s => { setPageSize(s); setPage(1) }} />
        </div>}>
        {filteredForMonth.slice((page - 1) * pageSize, page * pageSize).map((t, i) => {
          const c = colorOf(categories, t.category, '#16A34A')
          const account = accounts.find((a: any) => a.id === t.account_id)?.name ?? null
          const lSym = t.currency === 'AED' ? 'AED ' : '₹'
          return (
            <ListRow key={t.id ?? i} color={c} title={t.merchant} tag={t.category} meta={fmtDay(t.txn_date)}
              sub={[account, t._autoNro ? 'via NRE → NRO, managed in Transfers' : null].filter(Boolean).join(' · ') || undefined}
              amount={`+${lSym}${Number(t.amount).toLocaleString('en-IN')}`} amountColor="#16A34A"
              amountSub={t.currency === 'AED' && view !== 'uae' ? `≈ ₹${Math.round(Number(t.amount) * FX).toLocaleString('en-IN')}` : undefined}
              href={t._autoNro ? '/dashboard/transfers' : undefined}
              onOpen={t._autoNro ? undefined : () => openEdit(t)}
              actions={t._autoNro ? [] : [
                { label: 'Edit', icon: Pencil, onClick: () => openEdit(t) },
                { label: 'Duplicate', icon: Copy, onClick: () => openDuplicate(t) },
                { label: 'Delete', icon: Trash2, onClick: () => deleteTxn(t.id), danger: true, disabled: deletingId === t.id },
              ]} />
          )
        })}
      </ListCard>

      {/* UAE → India remittances (NRI view) */}
      {(() => {
        const remittances = transfers.filter(t => inRange(t.txn_date))
        if (remittances.length === 0 || view === 'uae') return null
        const totalINR = remittances.reduce((a, t) => a + (t.currency === 'AED' ? Number(t.amount) * FX : Number(t.amount)), 0)
        const totalAED = remittances.filter(t => t.currency === 'AED').reduce((a, t) => a + Number(t.amount), 0)
        return (
          <ListCard className="max-md:order-10" title="UAE → India remittances" sub={`Money sent home · ${rangeLabel}`}
            head={['Transfer', 'Type', 'Date', 'Amount']}
            right={<div className="text-right">
              <div className="text-[15px] font-bold tabular-nums" style={{ color: 'var(--text)' }}>₹{Math.round(totalINR).toLocaleString('en-IN')}</div>
              {totalAED > 0 && <div className="text-[11px] tabular-nums" style={{ color: 'var(--text3)' }}>AED {totalAED.toLocaleString('en-IN')} sent</div>}
            </div>}>
            {remittances.map((t, i) => (
              <ListRow key={t.id ?? i} color="#2563EB" title={t.merchant} tag="Remittance" meta={fmtDay(t.txn_date)}
                sub={t.description || undefined} href="/dashboard/transfers"
                amount={t.currency === 'AED' ? `AED ${Number(t.amount).toLocaleString('en-IN')}` : `₹${Number(t.amount).toLocaleString('en-IN')}`}
                amountSub={t.currency === 'AED' ? `≈ ₹${Math.round(Number(t.amount) * FX).toLocaleString('en-IN')}` : undefined} />
            ))}
          </ListCard>
        )
      })()}

      <div className="max-md:order-11"><LearnStrip title="Building more than one income stream" href="/dashboard/learn" /></div>

      {activeModal === 'manual'    && <AddTransactionModal onClose={() => setActiveModal('none')} defaults={{ txn_type: 'income' }} />}
      {activeModal === 'statement' && <BankStatementUploadModal onClose={() => setActiveModal('none')} />}
      {activeModal === 'bill'      && <BillImageUploadModal onClose={() => setActiveModal('none')} defaultType="income" />}
      {activeModal === 'voice'     && <TransactionVoiceModal onClose={() => setActiveModal('none')} defaultType="income" />}

      {editing && <AddTransactionModal edit={editing} onClose={() => setEditing(null)} />}
      {manageCats && <ManageCategoriesSheet initialKind="income" usage={catUsage} onClose={() => setManageCats(false)} onChanged={() => router.refresh()} />}
    </div>
  )
}
