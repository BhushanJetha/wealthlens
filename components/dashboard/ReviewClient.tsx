'use client'
import { useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Landmark, Tag, Copy, Send, Trash2, X, Wand2, ArrowLeftRight } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { useCategoryStore } from '@/store/categoryStore'
import { fmtMoney } from '@/lib/format'
import { fmtDay, localToday } from '@/lib/insights'
import { kindOf } from '@/lib/ledger'
import { labelOf } from '@/lib/money'
import { findReviewItems, reviewCount, type ReviewItem, type ReviewKind } from '@/lib/review'
import { ruleTextFor, type TxnRule } from '@/lib/rules'
import { PageHeader, Panel } from '@/components/ui/kit'
import { ChipFilter } from '@/components/ui/list'
import AddTransactionModal from '@/components/forms/AddTransactionModal'

interface Props { today: string; fx: number; transactions: any[]; accounts: any[]; rules: TxnRule[] }

const KINDS: { key: ReviewKind; label: string; icon: typeof Landmark; c: string }[] = [
  { key: 'account', label: 'Paid from', icon: Landmark, c: '#3B8EF0' },
  { key: 'category', label: 'Category', icon: Tag, c: '#6A55E8' },
  { key: 'duplicate', label: 'Duplicates', icon: Copy, c: '#F29A2E' },
  { key: 'remit', label: 'Sent home', icon: Send, c: '#2FB67C' },
  { key: 'transfer', label: 'Transfers', icon: ArrowLeftRight, c: '#0891B2' },
]
const MIGRATION_HINT = 'Run migration 027 in Supabase to use this.'
// What a transfer of unknown kind can be (the kinds in Add transaction)
const TRANSFER_KIND_LABEL: Record<string, string> = { Own: 'My other account', International: 'UAE → India', Internal: 'NRE → NRO', 'NRO to NRE': 'NRO → NRE', Family: 'Family support' }
const isNre = (a: any) => /\bnre\b/i.test(`${a?.name ?? ''}`)

// Review inbox (design v2): each card fixes one problem — or a whole
// merchant's worth — in one tap; "Always" turns the fix into a rule.
export default function ReviewClient(p: Props) {
  const router = useRouter()
  const supabase = createClient()
  const { rows: categories, load: loadCategories } = useCategoryStore()
  useEffect(() => { loadCategories() }, [loadCategories])
  const [today, setToday] = useState(p.today)
  useEffect(() => { setToday(localToday()) }, [])

  const [done, setDone] = useState<Set<string>>(new Set())
  const [filter, setFilter] = useState<'all' | ReviewKind>('all')
  const [busy, setBusy] = useState<string | null>(null)
  const [note, setNote] = useState<{ text: string; undo?: () => void } | null>(null)
  const [adding, setAdding] = useState<ReviewItem | null>(null)
  const [rules, setRules] = useState(p.rules)
  const [limit, setLimit] = useState(15)
  useEffect(() => setRules(p.rules), [p.rules])

  const all = useMemo(() => findReviewItems(p.transactions, { today, fx: p.fx }), [p.transactions, today, p.fx])
  const items = all.filter(i => !done.has(i.id))
  const shown = items.filter(i => filter === 'all' || i.kind === filter)
  const accById = new Map(p.accounts.map(a => [a.id, a]))
  const accName = (id: string | null | undefined) => (id && accById.get(id)?.name) || null

  // Categories ordered by how often you use them
  const catUse = useMemo(() => {
    const n: Record<string, number> = {}
    for (const t of p.transactions) if (t.txn_type === 'expense' && t.category) n[t.category] = (n[t.category] ?? 0) + 1
    return n
  }, [p.transactions])
  const expenseCats = categories.filter(c => c.kind === 'expense' && !/^other$/i.test(c.name))
    .sort((a, b) => (catUse[b.name] ?? 0) - (catUse[a.name] ?? 0))
  const accUse = useMemo(() => {
    const n: Record<string, number> = {}
    for (const t of p.transactions) if (t.account_id) n[t.account_id] = (n[t.account_id] ?? 0) + 1
    return n
  }, [p.transactions])

  const finish = (id: string, text: string, undo?: () => void) => {
    setDone(s => new Set(s).add(id)); setNote({ text, undo }); router.refresh()
  }
  const fail = (msg: string) => setNote({ text: /reviewed_at|txn_rules/.test(msg) ? MIGRATION_HINT : msg })

  async function addRule(item: ReviewItem, patch: { set_category?: string; set_account_id?: string }, key: string) {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user || !key) return ''
    const label = String(item.txns[0].merchant ?? '').trim()
    const { data, error } = await supabase.from('txn_rules').insert({ user_id: user.id, match_text: key, label, ...patch }).select().single()
    if (error) return ' Run migration 027 to remember this next time.'
    setRules(r => [data as TxnRule, ...r])
    return ` New ones with “${key}” will be done for you.`
  }

  async function fix(item: ReviewItem, patch: { account_id?: string; category?: string; sub_category?: string | null; txn_type?: string }, always: boolean, key: string) {
    setBusy(item.id)
    const ids = item.txns.map(t => t.id)
    const { error } = await supabase.from('transactions').update(patch).in('id', ids)
    if (error) { setBusy(null); fail(error.message); return }
    const extra = always ? await addRule(item, patch.category ? { set_category: patch.category } : { set_account_id: patch.account_id }, key) : ''
    setBusy(null)
    const what = patch.sub_category ? (TRANSFER_KIND_LABEL[patch.sub_category] ?? patch.sub_category) : patch.txn_type === 'expense' ? 'spending' : patch.category ? labelOf(patch.category) : accName(patch.account_id)
    finish(item.id, `${ids.length} transaction${ids.length === 1 ? '' : 's'} set to ${what}.${extra}`)
  }

  async function markReviewed(item: ReviewItem, ids: string[], text: string) {
    setBusy(item.id)
    const { error } = await supabase.from('transactions').update({ reviewed_at: new Date().toISOString() }).in('id', ids)
    setBusy(null)
    if (error) fail(error.message); else finish(item.id, text)
  }

  async function deleteCopy(item: ReviewItem) {
    const [copy] = item.txns
    setBusy(item.id)
    const { error } = await supabase.from('transactions').delete().eq('id', copy.id)
    setBusy(null)
    if (error) { fail(error.message); return }
    const { _remit, accounts, ...row } = copy
    finish(item.id, `Deleted the copy of ${copy.merchant}.`, async () => {
      const { error } = await supabase.from('transactions').insert(row)
      if (error) { setNote({ text: `Couldn’t restore it: ${error.message}` }); return }
      setDone(s => { const n = new Set(s); n.delete(item.id); return n })
      setNote({ text: 'Restored.' }); router.refresh()
    })
  }

  async function deleteRule(r: TxnRule) {
    const { error } = await supabase.from('txn_rules').delete().eq('id', r.id)
    if (error) { fail(error.message); return }
    setRules(rs => rs.filter(x => x.id !== r.id))
  }

  const counts = Object.fromEntries(KINDS.map(k => [k.key, items.filter(i => i.kind === k.key).length])) as Record<ReviewKind, number>
  const total = reviewCount(items)

  return (
    <div className="flex flex-col gap-3.5 md:gap-[18px] animate-fade-up max-w-[900px]">
      <PageHeader title="Review" sub={total ? `${total} transaction${total === 1 ? '' : 's'} to check · last 90 days` : 'Nothing to check · last 90 days'} />
      <p className="text-[12.5px] md:text-[13px] -mt-1" style={{ color: 'var(--text3)' }}>
        These make reports, budgets and balances less accurate. Fix a whole merchant in one tap, and tick <b>Always</b> so new ones are sorted for you.
      </p>

      {items.length > 0 && (
        <ChipFilter label="Show" value={filter} onChange={k => setFilter(k as any)}
          options={[{ key: 'all', label: 'All', count: items.length }, ...KINDS.filter(k => counts[k.key]).map(k => ({ key: k.key, label: k.label, count: counts[k.key] }))]} />
      )}

      {shown.length === 0 ? (
        <div className="wl-card flex flex-col items-center justify-center text-center py-12 gap-1.5">
          <div className="w-11 h-11 rounded-full flex items-center justify-center text-[19px]" style={{ background: 'var(--income-bg)', color: 'var(--income)' }}>✓</div>
          <div className="text-[15px] font-semibold mt-1" style={{ color: 'var(--text)' }}>All reviewed</div>
          <div className="text-[12.5px]" style={{ color: 'var(--text3)' }}>Every transaction from the last 90 days has an account and a category.</div>
        </div>
      ) : (
        <div className="flex flex-col gap-2.5">
          {shown.slice(0, limit).map(item => (
            <ReviewCard key={item.id} item={item} busy={busy === item.id} accounts={p.accounts} accUse={accUse} accName={accName}
              cats={expenseCats.map(c => c.name)}
              onFix={(patch, always, key) => fix(item, patch, always, key)}
              onReviewed={(ids, text) => markReviewed(item, ids, text)}
              onDeleteCopy={() => deleteCopy(item)}
              onAddCredit={() => setAdding(item)} />
          ))}
          {shown.length > limit && (
            <button onClick={() => setLimit(l => l + 15)} className="wl-btn self-center" style={{ height: 34 }}>Show {Math.min(15, shown.length - limit)} more</button>
          )}
        </div>
      )}

      <Panel title="Your rules" right={<span className="text-[11.5px]" style={{ color: 'var(--text4)' }}>{rules.length || 'None yet'}</span>}>
        {rules.length === 0 ? (
          <div className="text-[12.5px] mt-2 leading-snug" style={{ color: 'var(--text3)' }}>
            When you fix something with <b>Always</b> ticked, it becomes a rule here: new transactions from that merchant get the same category or account when you add or import them.
          </div>
        ) : (
          <ul className="mt-2">
            {rules.map(r => (
              <li key={r.id} className="flex items-center gap-3 py-2.5" style={{ borderTop: '1px solid #F1F5F9' }}>
                <span className="w-8 h-8 rounded-[10px] flex items-center justify-center flex-shrink-0" style={{ background: '#F0EDFF', color: '#6A55E8' }}><Wand2 size={15} /></span>
                <span className="flex-1 min-w-0 text-[13px]" style={{ color: 'var(--text2)' }}>
                  Merchant contains <b style={{ color: 'var(--text)' }}>“{r.match_text}”</b>
                  <span style={{ color: 'var(--text4)' }}> → </span>
                  <b style={{ color: 'var(--text)' }}>{[r.set_category && labelOf(r.set_category), accName(r.set_account_id)].filter(Boolean).join(' · ') || '—'}</b>
                  {r.label && <span className="block text-[11.5px] truncate" style={{ color: 'var(--text4)' }}>From {r.label}</span>}
                </span>
                <button onClick={() => deleteRule(r)} aria-label={`Delete rule ${r.match_text}`} className="w-8 h-8 rounded-lg flex items-center justify-center hover:bg-[#FEF2F2]" style={{ color: 'var(--text4)' }}><Trash2 size={15} /></button>
              </li>
            ))}
          </ul>
        )}
      </Panel>

      {note && (
        <div role="status" className="fixed z-40 left-1/2 -translate-x-1/2 bottom-[calc(env(safe-area-inset-bottom,0px)+84px)] md:bottom-6 max-w-[92vw] md:max-w-lg rounded-xl px-4 py-3 flex items-center gap-3 text-[12.5px] text-white shadow-lg"
          style={{ background: '#1E1B3A' }}>
          <span className="flex-1">{note.text}</span>
          {note.undo && <button onClick={() => { const u = note.undo!; setNote(null); u() }} className="font-semibold" style={{ color: '#C9C2F5' }}>Undo</button>}
          <button onClick={() => setNote(null)} aria-label="Dismiss" style={{ color: '#C9C2F5' }}><X size={14} /></button>
        </div>
      )}

      {adding && (() => {
        const sent = adding.txns[0]
        const nre = p.accounts.find(a => a.currency === 'INR' && kindOf(a) === 'bank' && isNre(a))
        return <AddTransactionModal onClose={() => { setAdding(null); router.refresh() }}
          defaults={{ txn_type: 'income', category: 'NRE Received', currency: 'INR', amount: String(Math.round(adding.estimate ?? 0)),
            txn_date: sent.txn_date, merchant: `From UAE · AED ${Math.round(Number(sent.amount)).toLocaleString('en-US')}`, account_id: nre?.id ?? '' }} />
      })()}
    </div>
  )
}

function ReviewCard({ item, busy, accounts, accUse, accName, cats, onFix, onReviewed, onDeleteCopy, onAddCredit }: {
  item: ReviewItem; busy: boolean; accounts: any[]; accUse: Record<string, number>; accName: (id?: string | null) => string | null; cats: string[]
  onFix: (patch: { account_id?: string; category?: string; sub_category?: string | null; txn_type?: string }, always: boolean, key: string) => void
  onReviewed: (ids: string[], text: string) => void
  onDeleteCopy: () => void; onAddCredit: () => void
}) {
  const K = KINDS.find(k => k.key === item.kind)!
  const t0 = item.txns[0]
  const n = item.txns.length
  const cur = t0.currency
  const sum = item.txns.reduce((s, t) => s + (Number(t.amount) || 0), 0)
  const oldest = item.txns[n - 1]?.txn_date
  const [always, setAlways] = useState(!!item.key && n >= 1)
  const [key, setKey] = useState(item.key ?? ruleTextFor(t0.merchant))
  const [more, setMore] = useState(false)

  const chip = (label: React.ReactNode, onClick: () => void, primary = false, k?: string) => (
    <button key={k} onClick={onClick} disabled={busy}
      className="rounded-full px-3 h-[30px] text-[12.5px] font-semibold flex items-center gap-1 disabled:opacity-50 transition-colors"
      style={primary ? { background: 'var(--accent)', color: '#fff' } : { background: '#fff', border: '1px solid var(--line)', color: 'var(--text2)' }}>
      {label}
    </button>
  )
  const alwaysBox = (item.kind === 'account' || item.kind === 'category') && (
    <label className="flex items-center gap-2 text-[12px] mt-2.5 flex-wrap" style={{ color: 'var(--text3)' }}>
      <input type="checkbox" checked={always} onChange={e => setAlways(e.target.checked)} className="accent-[var(--accent)]" />
      Always do this for merchants containing
      <input value={key} onChange={e => setKey(e.target.value.toLowerCase().replace(/[^a-z0-9]/g, ''))} aria-label="Rule text"
        className="rounded-md px-1.5 py-0.5 text-[12px] font-semibold w-[130px]" style={{ border: '1px dashed var(--accent-border)', color: 'var(--accent2)', background: 'var(--accent-bg)' }} />
    </label>
  )

  let title: React.ReactNode, sub: React.ReactNode, body: React.ReactNode
  if (item.kind === 'account' || item.kind === 'category') {
    title = <>{t0.merchant || 'Unnamed'}{n > 1 && <span className="font-normal" style={{ color: 'var(--text3)' }}> · {n} transactions</span>}</>
    sub = `${fmtMoney(sum, cur)} · ${fmtDay(t0.txn_date)}${n > 1 && oldest !== t0.txn_date ? ` – ${fmtDay(oldest)}` : ''} · ${item.kind === 'account' ? 'no “Paid from”' : `category “${t0.category || 'none'}”`}`
    if (item.kind === 'account') {
      const opts = accounts.filter(a => a.currency === cur && a.is_active !== false && a.id !== item.suggestAccount)
        .sort((a, b) => (accUse[b.id] ?? 0) - (accUse[a.id] ?? 0))
      body = (
        <div className="flex flex-wrap gap-1.5">
          {item.suggestAccount && accName(item.suggestAccount) && chip(<>✦ {accName(item.suggestAccount)}</>, () => onFix({ account_id: item.suggestAccount! }, always, key), true, 's')}
          {(more ? opts : opts.slice(0, 4)).map(a => chip(a.name, () => onFix({ account_id: a.id }, always, key), false, a.id))}
          {!more && opts.length > 4 && chip(`+${opts.length - 4} more`, () => setMore(true), false, 'more')}
          {opts.length === 0 && !item.suggestAccount && <span className="text-[12px]" style={{ color: 'var(--text3)' }}>No {cur} accounts yet — add one on Bank accounts.</span>}
        </div>
      )
    } else {
      const opts = cats.filter(c => c !== item.suggestCategory)
      body = (
        <div className="flex flex-wrap gap-1.5 items-center">
          {item.suggestCategory && chip(<>✦ {labelOf(item.suggestCategory)}</>, () => onFix({ category: item.suggestCategory! }, always, key), true, 's')}
          {opts.slice(0, 6).map(c => chip(labelOf(c), () => onFix({ category: c }, always, key), false, c))}
          {opts.length > 6 && (
            <select aria-label="Other category" disabled={busy} defaultValue="" onChange={e => e.target.value && onFix({ category: e.target.value }, always, key)}
              className="rounded-full px-3 h-[30px] text-[12.5px] font-semibold" style={{ background: '#fff', border: '1px solid var(--line)', color: 'var(--text2)' }}>
              <option value="">More…</option>
              {opts.slice(6).map(c => <option key={c} value={c}>{labelOf(c)}</option>)}
            </select>
          )}
          {chip('Leave as Other', () => onReviewed(item.txns.map(t => t.id), `Kept as ${t0.category || 'Other'}.`), false, 'keep')}
        </div>
      )
    }
  } else if (item.kind === 'transfer') {
    title = <>{t0.merchant || 'Transfer'}{n > 1 && <span className="font-normal" style={{ color: 'var(--text3)' }}> · {n} transfers</span>}</>
    sub = `${fmtMoney(sum, cur)} · ${fmtDay(t0.txn_date)}${n > 1 && oldest !== t0.txn_date ? ` – ${fmtDay(oldest)}` : ''} · from ${accName(t0.account_id) ?? 'an account'} · kind unknown — counted as money sent until you choose`
    const kinds = ['Own', ...(cur === 'AED' ? ['International'] : ['Internal', 'NRO to NRE']), 'Family']
    body = (
      <div className="flex flex-wrap gap-1.5">
        {kinds.map((k, i) => chip(TRANSFER_KIND_LABEL[k], () => onFix({ category: 'Transfer', sub_category: k }, false, ''), i === 0, k))}
        {chip('It was spending', () => onFix({ txn_type: 'expense', category: 'Other', sub_category: null }, false, ''), false, 'spend')}
      </div>
    )
  } else if (item.kind === 'duplicate') {
    const [copy, keep] = item.txns
    title = <>Possible duplicate · {keep.merchant}</>
    sub = `${fmtMoney(Number(keep.amount), cur)} twice, ${copy.txn_date === keep.txn_date ? `on ${fmtDay(keep.txn_date)}` : `${fmtDay(keep.txn_date)} and ${fmtDay(copy.txn_date)}`}`
    const line = (t: any, tag: string) => (
      <div className="flex items-center gap-2 text-[12px] py-1" style={{ color: 'var(--text3)' }}>
        <span className="w-12 text-[10.5px] font-semibold uppercase tracking-[0.04em]" style={{ color: tag === 'Keep' ? 'var(--income)' : '#B45309' }}>{tag}</span>
        <span className="truncate">{t.merchant} · {fmtDay(t.txn_date)} · {accName(t.account_id) ?? 'no account'} · {t.category || 'no category'}{t.created_at ? ` · added ${fmtDay(String(t.created_at).slice(0, 10))}` : ''}</span>
      </div>
    )
    body = (<>
      <div className="rounded-xl px-3 py-1.5 mb-2.5" style={{ background: 'var(--bg2)' }}>{line(keep, 'Keep')}{line(copy, 'Copy')}</div>
      <div className="flex flex-wrap gap-1.5">
        {chip(<><Trash2 size={13} />Delete the copy</>, onDeleteCopy, true, 'del')}
        {chip('Keep both', () => onReviewed([copy.id, keep.id], 'Kept both.'), false, 'keep')}
      </div>
    </>)
  } else {
    title = <>AED {Math.round(Number(t0.amount)).toLocaleString('en-US')} sent home on {fmtDay(t0.txn_date)}</>
    sub = `No ₹ credit found in NRE yet — counted as about ${fmtMoney(item.estimate ?? 0, 'INR')} at today’s rate`
    body = (
      <div className="flex flex-wrap gap-1.5">
        {chip('Add the ₹ credit', onAddCredit, true, 'add')}
        {chip('The estimate is fine', () => onReviewed([t0.id], 'Keeping the estimate.'), false, 'ok')}
      </div>
    )
  }

  return (
    <section className="wl-card px-4 md:px-5 py-3.5 md:py-4" style={{ opacity: busy ? 0.6 : 1 }}>
      <div className="flex items-start gap-3 mb-3">
        <span className="w-8 h-8 rounded-[10px] flex items-center justify-center flex-shrink-0" style={{ background: K.c + '1A', color: K.c }}><K.icon size={15} /></span>
        <div className="min-w-0 flex-1">
          <div className="text-[13.5px] font-semibold" style={{ color: 'var(--text)' }}>{title}</div>
          <div className="text-[12px] mt-0.5" style={{ color: 'var(--text3)' }}>{sub}</div>
        </div>
        <span className="hidden md:inline text-[10.5px] font-semibold uppercase tracking-[0.05em] px-2 py-1 rounded-full flex-shrink-0" style={{ background: K.c + '14', color: K.c }}>{K.label}</span>
      </div>
      {body}
      {alwaysBox}
    </section>
  )
}
