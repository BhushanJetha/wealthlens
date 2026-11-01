'use client'
import { useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { X, Loader2, Plus, HandCoins, Wallet, Users, ChevronRight, Check, Receipt, ArrowDownLeft, ArrowUpRight } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { isMissingTable } from '@/lib/supabase/missingTable'
import { useViewStore } from '@/store/viewStore'
import { useCategoryStore } from '@/store/categoryStore'
import { friendBalances, friendTotals, settleCandidates, ENTRY_TEXT, type Cur, type FriendBalance } from '@/lib/friends'
import { REPAID_BY_FRIEND, PAID_BACK_FRIEND, MOVEMENT_CATS, CC_BILL } from '@/lib/money'
import { kindOf } from '@/lib/ledger'
import { localToday, fmtDay } from '@/lib/insights'
import { toast } from '@/components/ui/toaster'
import { PageHeader, KpiTile, Segmented } from '@/components/ui/kit'

const NEEDS_MIGRATION = 'Friends & splits needs migration 036 (supabase/migrations/036_friends_and_splits.sql). Run it in Supabase, then refresh.'
const fmt = (v: number, c: Cur) => `${c === 'AED' ? 'AED ' : '₹'}${Math.abs(v).toLocaleString(c === 'AED' ? 'en-US' : 'en-IN', { maximumFractionDigits: 2 })}`
const pair = (r: Record<Cur, number>) => (['AED', 'INR'] as Cur[]).filter(c => Math.abs(r[c]) > 0.004).map(c => fmt(r[c], c)).join(' · ') || 'Nothing'
const AVATAR = ['#6A55E8', '#2FB67C', '#F29A2E', '#3B8EF0', '#EC5B8C', '#0891B2', '#D97706', '#7C3AED']
const avatarOf = (name: string) => AVATAR[Array.from(name).reduce((s, ch) => s + ch.charCodeAt(0), 0) % AVATAR.length]

interface Props { ready: boolean; friends: any[]; splits: any[]; transactions: any[]; recent: any[]; accounts: any[] }

export default function FriendsClient(p: Props) {
  const router = useRouter()
  const supabase = createClient()
  const { view } = useViewStore()
  const list = useMemo(() => friendBalances(p.friends, p.splits, p.transactions), [p.friends, p.splits, p.transactions])
  const totals = friendTotals(list)
  const [open, setOpen] = useState<FriendBalance | null>(null)
  const [settling, setSettling] = useState<FriendBalance | null>(null)
  const [paying, setPaying] = useState<{ friendId?: string } | null>(null)
  const [newName, setNewName] = useState('')
  const [adding, setAdding] = useState(false)
  // Keep an open friend in step with the data after a change
  useEffect(() => { if (open) setOpen(list.find(b => b.friend.id === open.friend.id) ?? null) }, [list]) // eslint-disable-line react-hooks/exhaustive-deps

  async function addFriend() {
    const name = newName.trim()
    if (!name) return
    if (p.friends.some(f => f.name.toLowerCase() === name.toLowerCase())) { toast(`${name} is already on your list`, 'error'); return }
    setAdding(true)
    const { data: { user } } = await supabase.auth.getUser()
    const { error } = user ? await supabase.from('friends').insert({ user_id: user.id, name }) : { error: { message: 'Please sign in again.' } }
    setAdding(false)
    if (error) { toast(isMissingTable(error) ? NEEDS_MIGRATION : error.message, 'error'); return }
    setNewName(''); toast(`${name} added`); router.refresh()
  }

  if (!p.ready) return (
    <div className="flex flex-col gap-3.5 md:gap-[18px] animate-fade-up max-w-[900px]">
      <PageHeader title="Friends & splits" sub="What friends owe you, and what you owe them" />
      <div className="wl-card px-5 py-6 text-[13.5px] leading-[1.5]" style={{ color: 'var(--text2)' }}>{NEEDS_MIGRATION}</div>
    </div>
  )

  const owesText = (b: FriendBalance) => (['AED', 'INR'] as Cur[]).filter(c => Math.abs(b.owes[c]) > 0.004)
    .map(c => ({ c, v: b.owes[c], text: b.owes[c] > 0 ? `owes you ${fmt(b.owes[c], c)}` : `you owe ${fmt(b.owes[c], c)}` }))

  return (
    <div className="flex flex-col gap-3.5 md:gap-[18px] animate-fade-up max-w-[900px]">
      <PageHeader title="Friends & splits" sub="Split what you pay · what friends paid for you · settle up"
        actions={<button onClick={() => setPaying({})} className="wl-btn wl-btn-primary" style={{ height: 38 }}><Receipt size={15} />A friend paid for me</button>}
        onAdd={() => setPaying({})} addLabel="A friend paid for me" />

      <div className="grid grid-cols-2 gap-2.5 md:gap-3.5">
        <KpiTile label="To receive" value={pair(totals.toReceive)} tint={1} icon={HandCoins} delta="friends owe you" />
        <KpiTile label="To pay" value={pair(totals.toPay)} tint={2} icon={Wallet} delta="you owe friends" />
      </div>

      <div className="wl-card px-4 py-3 text-[12.5px] leading-[1.5]" style={{ color: 'var(--text2)', background: '#F5F3FF', borderColor: '#DDD6FE' }}>
        <b style={{ color: 'var(--accent2)' }}>Paid for friends too?</b> Open it in <Link href="/dashboard/expenses" className="font-semibold underline">Expenses</Link> (or tap any amount in a report) and choose <b>Split</b>.
        The full amount stays on your account — only your share counts as your spending; theirs shows here until they pay you back.
      </div>

      <div className="wl-card overflow-hidden">
        <div className="px-4 md:px-5 pt-4 pb-2 flex items-center justify-between gap-3">
          <h2 className="text-[14px] md:text-[15px] font-semibold" style={{ color: 'var(--text)' }}>Friends</h2>
          <span className="text-[12px]" style={{ color: 'var(--text3)' }}>{list.length} {list.length === 1 ? 'friend' : 'friends'}</span>
        </div>
        {list.length === 0 && (
          <div className="px-5 py-6 text-[13px] text-center" style={{ color: 'var(--text3)' }}>No friends yet. Add one below, split an expense, or record what a friend paid for you.</div>
        )}
        {list.map(b => {
          const lines = owesText(b), last = b.entries[0]
          return (
            <div key={b.friend.id} className="flex items-center gap-3 px-4 md:px-5 py-3" style={{ borderTop: '1px solid #F1F0F7' }}>
              <button onClick={() => setOpen(b)} className="flex items-center gap-3 min-w-0 flex-1 text-left">
                <span className="w-10 h-10 rounded-full flex items-center justify-center text-white text-[15px] font-bold flex-shrink-0" style={{ background: avatarOf(b.friend.name) }}>
                  {b.friend.name.trim().charAt(0).toUpperCase()}
                </span>
                <span className="min-w-0">
                  <span className="block text-[14px] font-semibold truncate" style={{ color: 'var(--text)' }}>{b.friend.name}</span>
                  <span className="block text-[12px] truncate" style={{ color: 'var(--text3)' }}>{last ? `${fmtDay(last.date)} · ${last.label}` : 'Nothing yet'}</span>
                </span>
              </button>
              <div className="text-right flex-shrink-0">
                {lines.length ? lines.map(l => (
                  <div key={l.c} className="text-[13px] font-semibold tabular-nums" style={{ color: l.v > 0 ? '#1E8F5F' : '#B45309' }}>{l.text}</div>
                )) : <div className="text-[12.5px]" style={{ color: 'var(--text3)' }}>{b.entries.length ? 'all settled' : '—'}</div>}
              </div>
              {lines.length > 0 && <button onClick={() => setSettling(b)} className="wl-btn hidden sm:inline-flex" style={{ height: 34 }}>Settle up</button>}
              <button onClick={() => setOpen(b)} aria-label={`Open ${b.friend.name}`} className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0" style={{ color: 'var(--text3)' }}><ChevronRight size={17} /></button>
            </div>
          )
        })}
        <form onSubmit={e => { e.preventDefault(); addFriend() }} className="flex items-center gap-2 px-4 md:px-5 py-3" style={{ borderTop: '1px solid #F1F0F7', background: '#FAFAFE' }}>
          <input value={newName} onChange={e => setNewName(e.target.value)} placeholder="Add a friend — name" aria-label="Friend's name" className="wl-input flex-1" style={{ height: 40 }} />
          <button type="submit" disabled={adding || !newName.trim()} className="wl-btn" style={{ height: 40 }}>{adding ? <Loader2 size={14} className="animate-spin" /> : <Plus size={15} />}Add</button>
        </form>
      </div>

      {open && <FriendSheet b={open} onClose={() => setOpen(null)} onSettle={() => { setSettling(open); setOpen(null) }}
        onPaid={() => { setPaying({ friendId: open.friend.id }); setOpen(null) }} />}
      {settling && <SettleSheet b={settling} recent={p.recent} accounts={p.accounts} view={view} onClose={() => setSettling(null)} />}
      {paying && <FriendPaidSheet friends={p.friends} friendId={paying.friendId} view={view} onClose={() => setPaying(null)} />}
    </div>
  )
}

// ── Shared sheet frame ───────────────────────────────────────────────────────
function Sheet({ title, sub, onClose, busy, children, footer }: { title: string; sub?: React.ReactNode; onClose: () => void; busy?: boolean; children: React.ReactNode; footer?: React.ReactNode }) {
  useEffect(() => {
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape' && !busy) onClose() }
    window.addEventListener('keydown', esc); return () => window.removeEventListener('keydown', esc)
  }, [busy, onClose])
  return (
    <div className="fixed inset-0 wl-sheet z-[60] flex items-center justify-center p-4" style={{ background: 'rgba(15,23,42,.4)' }} onClick={() => !busy && onClose()}>
      <div className="wl-sheet-panel w-full max-w-[480px] rounded-2xl bg-white flex flex-col max-h-[88vh]" onClick={e => e.stopPropagation()}
        style={{ boxShadow: '0 20px 60px rgba(15,23,42,.18)' }} role="dialog" aria-label={title}>
        <div className="flex items-start justify-between gap-3 px-5 pt-5 pb-3">
          <div className="min-w-0">
            <div className="text-[17px] font-bold" style={{ color: 'var(--text)' }}>{title}</div>
            {sub && <div className="text-[12.5px] mt-0.5 leading-[1.45]" style={{ color: 'var(--text3)' }}>{sub}</div>}
          </div>
          <button onClick={onClose} disabled={busy} aria-label="Close" className="w-8 h-8 -mr-1 rounded-lg flex items-center justify-center flex-shrink-0 hover:bg-[var(--bg2)]" style={{ color: 'var(--text3)' }}><X size={18} /></button>
        </div>
        <div className="px-5 pb-3 overflow-y-auto flex flex-col gap-3">{children}</div>
        {footer && <div className="flex gap-2.5 px-5 py-4" style={{ borderTop: '1px solid var(--line)' }}>{footer}</div>}
      </div>
    </div>
  )
}
const Label = ({ children }: { children: React.ReactNode }) => <div className="text-[11px] font-semibold uppercase tracking-[0.05em] mb-1.5" style={{ color: 'var(--text3)' }}>{children}</div>
const ErrorNote = ({ text }: { text: string }) => text ? <div className="text-[12.5px] rounded-[10px] px-3 py-2" style={{ background: '#FDECEC', color: '#B42318' }}>{text}</div> : null

// ── One friend: the running history ─────────────────────────────────────────
function FriendSheet({ b, onClose, onSettle, onPaid }: { b: FriendBalance; onClose: () => void; onSettle: () => void; onPaid: () => void }) {
  const router = useRouter()
  const supabase = createClient()
  const [busy, setBusy] = useState(false)
  const owing = (['AED', 'INR'] as Cur[]).filter(c => Math.abs(b.owes[c]) > 0.004)
  async function remove() {
    setBusy(true)
    const { error } = await supabase.from('friends').delete().eq('id', b.friend.id)
    setBusy(false)
    if (error) { toast(error.message, 'error'); return }
    toast(`${b.friend.name} removed`); router.refresh(); onClose()
  }
  return (
    <Sheet title={b.friend.name} busy={busy} onClose={onClose}
      sub={owing.length ? owing.map(c => b.owes[c] > 0 ? `Owes you ${fmt(b.owes[c], c)}` : `You owe ${fmt(b.owes[c], c)}`).join(' · ') : b.entries.length ? 'All settled' : 'Nothing yet'}
      footer={<>
        {!b.entries.length && <button onClick={remove} disabled={busy} className="wl-btn" style={{ height: 44, color: '#DC2626' }}>Remove</button>}
        <button onClick={onPaid} disabled={busy} className="wl-btn flex-1 justify-center" style={{ height: 44 }}><Receipt size={15} />They paid for me</button>
        {owing.length > 0 && <button onClick={onSettle} disabled={busy} className="wl-btn wl-btn-primary flex-1 justify-center" style={{ height: 44 }}><Check size={15} />Settle up</button>}
      </>}>
      {b.entries.length === 0 ? <div className="text-[13px] py-4 text-center" style={{ color: 'var(--text3)' }}>Nothing with {b.friend.name} yet.</div> : (
        <div className="rounded-[14px] overflow-hidden" style={{ border: '1px solid var(--line)' }}>
          {b.entries.map(e => {
            const up = e.effect > 0
            return (
              <div key={e.id} className="flex items-center gap-3 px-3.5 py-2.5" style={{ borderBottom: '1px solid #F1F0F7' }}>
                <span className="w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0" style={{ background: up ? '#E7F7EF' : '#FFF2E2', color: up ? '#1E8F5F' : '#B45309' }}>
                  {up ? <ArrowUpRight size={14} /> : <ArrowDownLeft size={14} />}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-[13.5px] font-medium truncate" style={{ color: 'var(--text)' }}>{e.label}</span>
                  <span className="block text-[11.5px]" style={{ color: 'var(--text3)' }}>{fmtDay(e.date)} · {ENTRY_TEXT[e.kind]}</span>
                </span>
                <span className="text-[13.5px] font-semibold tabular-nums flex-shrink-0" style={{ color: 'var(--text)' }}>{fmt(e.amount, e.currency)}</span>
              </div>
            )
          })}
        </div>
      )}
      <div className="text-[12px] leading-[1.45]" style={{ color: 'var(--text3)' }}>
        <ArrowUpRight size={11} className="inline -mt-0.5" style={{ color: '#1E8F5F' }} /> adds to what {b.friend.name} owes you · <ArrowDownLeft size={11} className="inline -mt-0.5" style={{ color: '#B45309' }} /> takes it down (or means you owe them)
      </div>
    </Sheet>
  )
}

// ── Settle up: money back, either way ───────────────────────────────────────
function SettleSheet({ b, recent, accounts, view, onClose }: { b: FriendBalance; recent: any[]; accounts: any[]; view: string; onClose: () => void }) {
  const router = useRouter()
  const supabase = createClient()
  const curs = (['AED', 'INR'] as Cur[]).filter(c => Math.abs(b.owes[c]) > 0.004)
  const prefer: Cur = view === 'uae' ? 'AED' : 'INR'
  const [cur, setCur] = useState<Cur>(curs.includes(prefer) ? prefer : curs[0] ?? prefer)
  const [theyPaid, setTheyPaid] = useState(b.owes[cur] >= 0)
  const [amount, setAmount] = useState(String(Math.abs(b.owes[cur]) || ''))
  const [date, setDate] = useState(localToday())
  const [pick, setPick] = useState<string>('')                 // a transaction id, or 'new'
  const banks = accounts.filter(a => a.currency === cur && kindOf(a) !== 'card')
  const [accountId, setAccountId] = useState(banks[0]?.id ?? '')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  useEffect(() => { setTheyPaid(b.owes[cur] >= 0); setAmount(String(Math.abs(b.owes[cur]) || '')); setPick(''); setAccountId(banks[0]?.id ?? '') }, [cur]) // eslint-disable-line react-hooks/exhaustive-deps
  const amt = Number(amount) || 0
  const candidates = useMemo(() => settleCandidates(recent, { theyPaid, currency: cur, amount: amt, date }), [recent, theyPaid, cur, amt, date])
  const accName = (id: string) => accounts.find(a => a.id === id)?.name ?? ''
  const name = b.friend.name

  async function save() {
    if (!pick) { setError(theyPaid ? `Which transaction is ${name}’s money?` : `Which transaction paid ${name}?`); return }
    setBusy(true); setError('')
    const category = theyPaid ? REPAID_BY_FRIEND : PAID_BACK_FRIEND
    let error: any = null
    if (pick === 'new') {
      if (!(amt > 0)) { setBusy(false); setError('Enter the amount.'); return }
      if (!accountId) { setBusy(false); setError(`Pick the account the money ${theyPaid ? 'came into' : 'left'}.`); return }
      const { data: { user } } = await supabase.auth.getUser()
      ;({ error } = user ? await supabase.from('transactions').insert({
        user_id: user.id, account_id: accountId, txn_date: date, amount: amt, currency: cur, country: cur === 'AED' ? 'UAE' : 'India',
        txn_type: theyPaid ? 'income' : 'transfer', category, merchant: theyPaid ? `From ${name}` : `To ${name}`, friend_id: b.friend.id, source: 'manual',
      }) : { error: { message: 'Please sign in again.' } })
    } else {
      ;({ error } = await supabase.from('transactions').update({ category, sub_category: null, friend_id: b.friend.id }).eq('id', pick))
    }
    setBusy(false)
    if (error) { setError(isMissingTable(error) || /friend_id/.test(error.message ?? '') ? NEEDS_MIGRATION : error.message); return }
    const t = candidates.find(c => c.id === pick)
    toast(`${theyPaid ? `${name} paid you back` : `You paid ${name} back`} ${fmt(t ? Number(t.amount) : amt, cur)} · not counted as ${theyPaid ? 'income' : 'spending'}`)
    router.refresh(); onClose()
  }

  return (
    <Sheet title={`Settle up with ${name}`} busy={busy} onClose={onClose}
      sub={curs.length ? curs.map(c => b.owes[c] > 0 ? `${name} owes you ${fmt(b.owes[c], c)}` : `You owe ${name} ${fmt(b.owes[c], c)}`).join(' · ') : 'All settled — record money back anyway'}
      footer={<>
        <button onClick={onClose} disabled={busy} className="wl-btn" style={{ height: 44, padding: '0 18px' }}>Cancel</button>
        <button onClick={save} disabled={busy || !pick} className="wl-btn wl-btn-primary flex-1 justify-center" style={{ height: 44 }}>
          {busy ? <Loader2 size={16} className="animate-spin" /> : <Check size={16} />}{busy ? 'Saving…' : 'Record it'}
        </button>
      </>}>
      <div className="flex items-center gap-2 flex-wrap">
        <Segmented label="Who paid" value={theyPaid ? 'they' : 'me'} onChange={v => { setTheyPaid(v === 'they'); setPick('') }}
          options={[{ value: 'they' as const, label: `${name} paid me` }, { value: 'me' as const, label: `I paid ${name}` }]} />
        {curs.length > 1 && <Segmented label="Currency" value={cur} onChange={setCur} options={curs.map(c => ({ value: c, label: c === 'AED' ? 'AED' : '₹ INR' }))} />}
      </div>
      <div className="grid grid-cols-2 gap-2.5">
        <label className="block"><Label>Amount</Label>
          <span className="flex items-center gap-1.5 h-11 px-3 rounded-[10px]" style={{ background: 'var(--bg2)', border: '1px solid var(--line)' }}>
            <span className="text-[12.5px]" style={{ color: 'var(--text3)' }}>{cur === 'AED' ? 'AED' : '₹'}</span>
            <input inputMode="decimal" value={amount} onChange={e => setAmount(e.target.value.replace(/[^0-9.]/g, ''))} aria-label="Amount" className="w-full bg-transparent outline-none text-[15px] font-semibold tabular-nums" />
          </span>
        </label>
        <label className="block"><Label>Around</Label>
          <input type="date" value={date} onChange={e => setDate(e.target.value)} aria-label="Date" className="wl-input w-full" style={{ height: 44 }} />
        </label>
      </div>

      <div>
        <Label>{theyPaid ? `Which money in is from ${name}?` : `Which payment went to ${name}?`}</Label>
        <div className="flex flex-col gap-1.5">
          {candidates.map(t => {
            const on = pick === t.id
            return (
              <button key={t.id} onClick={() => setPick(t.id)} aria-pressed={on} className="flex items-center gap-3 rounded-[12px] px-3 py-2.5 text-left"
                style={{ border: `1.5px solid ${on ? 'var(--accent)' : 'var(--line)'}`, background: on ? 'var(--accent-bg)' : '#fff' }}>
                <span className="w-4 h-4 rounded-full flex-shrink-0" style={{ border: `1.5px solid ${on ? 'var(--accent)' : '#CBD5E1'}`, background: on ? 'var(--accent)' : '#fff', boxShadow: on ? 'inset 0 0 0 3px #fff' : undefined }} />
                <span className="min-w-0 flex-1">
                  <span className="block text-[13.5px] font-medium truncate" style={{ color: 'var(--text)' }}>{t.merchant || t.description || t.category}</span>
                  <span className="block text-[11.5px]" style={{ color: 'var(--text3)' }}>{fmtDay(t.txn_date)} · {accName(t.account_id)}</span>
                </span>
                <span className="text-[13.5px] font-semibold tabular-nums" style={{ color: 'var(--text)' }}>{fmt(Number(t.amount), cur)}</span>
              </button>
            )
          })}
          <button onClick={() => setPick('new')} aria-pressed={pick === 'new'} className="flex items-center gap-3 rounded-[12px] px-3 py-2.5 text-left"
            style={{ border: `1.5px ${pick === 'new' ? 'solid var(--accent)' : 'dashed var(--line)'}`, background: pick === 'new' ? 'var(--accent-bg)' : '#fff' }}>
            <Plus size={16} style={{ color: 'var(--accent)' }} />
            <span className="text-[13px]" style={{ color: 'var(--text2)' }}>{candidates.length ? 'None of these — ' : ''}it’s not in my transactions yet (cash, or not imported)</span>
          </button>
          {pick === 'new' && (
            <label className="block mt-1"><Label>{theyPaid ? 'It came into' : 'It left'}</Label>
              <select value={accountId} onChange={e => setAccountId(e.target.value)} className="wl-input w-full" style={{ height: 44 }} aria-label="Account">
                {banks.length === 0 && <option value="">No {cur} account yet</option>}
                {banks.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
              </select>
            </label>
          )}
        </div>
      </div>
      <div className="text-[12px] leading-[1.45]" style={{ color: 'var(--text3)' }}>
        {theyPaid ? `Your balance goes up by what ${name} sent — it settles their share, so it isn’t income.` : `Your balance goes down by what you sent — your share was already counted, so it isn’t spending again.`}
      </div>
      <ErrorNote text={error} />
    </Sheet>
  )
}

// ── A friend paid for you ───────────────────────────────────────────────────
function FriendPaidSheet({ friends, friendId, view, onClose }: { friends: any[]; friendId?: string; view: string; onClose: () => void }) {
  const router = useRouter()
  const supabase = createClient()
  const { rows: cats, load } = useCategoryStore()
  useEffect(() => { load() }, [load])
  const [fid, setFid] = useState(friendId ?? friends[0]?.id ?? '__new__')
  const [newName, setNewName] = useState('')
  const [what, setWhat] = useState('')
  const [category, setCategory] = useState('Food')
  const [amount, setAmount] = useState('')
  const [cur, setCur] = useState<Cur>(view === 'uae' ? 'AED' : 'INR')
  const [date, setDate] = useState(localToday())
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const options = cats.filter(c => c.kind === 'expense' && !MOVEMENT_CATS.has(c.name) && c.name !== CC_BILL && c.name !== 'Loan on Card').map(c => c.name)
  const who = fid === '__new__' ? (newName.trim() || 'your friend') : friends.find(f => f.id === fid)?.name ?? 'your friend'

  async function save() {
    const amt = Number(amount) || 0
    if (!(amt > 0)) { setError('Enter your share.'); return }
    if (!what.trim()) { setError('What was it? e.g. Dinner at Bu Qtair'); return }
    if (fid === '__new__' && !newName.trim()) { setError('Who paid? Add their name.'); return }
    setBusy(true); setError('')
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { setBusy(false); setError('Please sign in again.'); return }
    let id = fid
    if (fid === '__new__') {
      const { data, error } = await supabase.from('friends').insert({ user_id: user.id, name: newName.trim() }).select('id').single()
      if (error || !data) { setBusy(false); setError(isMissingTable(error) ? NEEDS_MIGRATION : error?.message ?? 'Couldn’t add the friend.'); return }
      id = data.id
    }
    const { error } = await supabase.from('transactions').insert({
      user_id: user.id, account_id: null, paid_by_friend_id: id, txn_date: date, amount: amt, currency: cur, country: cur === 'AED' ? 'UAE' : 'India',
      txn_type: 'expense', category, merchant: what.trim(), description: `Paid by ${who}`, source: 'manual',
    })
    setBusy(false)
    if (error) { setError(isMissingTable(error) || /paid_by_friend_id/.test(error.message ?? '') ? NEEDS_MIGRATION : error.message); return }
    toast(`Saved · ${fmt(amt, cur)} in ${category}, you owe ${who}`)
    router.refresh(); onClose()
  }

  return (
    <Sheet title="A friend paid for me" busy={busy} onClose={onClose}
      sub="Nothing comes off your accounts. Your share counts as your spending, and you owe your friend until you pay them back."
      footer={<>
        <button onClick={onClose} disabled={busy} className="wl-btn" style={{ height: 44, padding: '0 18px' }}>Cancel</button>
        <button onClick={save} disabled={busy} className="wl-btn wl-btn-primary flex-1 justify-center" style={{ height: 44 }}>
          {busy ? <Loader2 size={16} className="animate-spin" /> : <Check size={16} />}{busy ? 'Saving…' : 'Save'}
        </button>
      </>}>
      <label className="block"><Label>Who paid</Label>
        <select value={fid} onChange={e => setFid(e.target.value)} className="wl-input w-full" style={{ height: 44 }} aria-label="Who paid">
          {friends.map(f => <option key={f.id} value={f.id}>{f.name}</option>)}
          <option value="__new__">+ Someone new…</option>
        </select>
      </label>
      {fid === '__new__' && <input value={newName} onChange={e => setNewName(e.target.value)} placeholder="Their name" aria-label="Friend's name" className="wl-input w-full" style={{ height: 44 }} />}
      <label className="block"><Label>What was it</Label>
        <input value={what} onChange={e => setWhat(e.target.value)} placeholder="e.g. Dinner at Bu Qtair" className="wl-input w-full" style={{ height: 44 }} />
      </label>
      <div className="grid grid-cols-2 gap-2.5">
        <label className="block"><Label>Your share</Label>
          <span className="flex items-center gap-1.5 h-11 px-3 rounded-[10px]" style={{ background: 'var(--bg2)', border: '1px solid var(--line)' }}>
            <span className="text-[12.5px]" style={{ color: 'var(--text3)' }}>{cur === 'AED' ? 'AED' : '₹'}</span>
            <input inputMode="decimal" value={amount} onChange={e => setAmount(e.target.value.replace(/[^0-9.]/g, ''))} aria-label="Your share" className="w-full bg-transparent outline-none text-[15px] font-semibold tabular-nums" />
          </span>
        </label>
        <label className="block"><Label>Category</Label>
          <select value={category} onChange={e => setCategory(e.target.value)} className="wl-input w-full" style={{ height: 44 }} aria-label="Category">
            {(options.includes(category) ? options : [category, ...options]).map(c => <option key={c} value={c}>{c}</option>)}
          </select>
        </label>
      </div>
      <div className="grid grid-cols-2 gap-2.5">
        <div><Label>Currency</Label><Segmented label="Currency" value={cur} onChange={setCur} full options={[{ value: 'AED' as Cur, label: 'AED' }, { value: 'INR' as Cur, label: '₹ INR' }]} /></div>
        <label className="block"><Label>Date</Label>
          <input type="date" value={date} onChange={e => setDate(e.target.value)} aria-label="Date" className="wl-input w-full" style={{ height: 44 }} />
        </label>
      </div>
      <ErrorNote text={error} />
    </Sheet>
  )
}
