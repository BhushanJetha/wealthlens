'use client'
import InvHoldings, { fullDate, pctText, pctColor } from './InvHoldings'
import { Landmark as IcBank, TrendingUp as IcUp, Percent as IcPct, Wallet as IcWallet, Layers as IcLayers, CalendarClock as IcCal } from 'lucide-react'
import { useState, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import InvPageShell from './InvPageShell'
import { Pencil, Trash2, PiggyBank, X, Clock, AlertTriangle } from 'lucide-react'
import { useViewStore } from '@/store/viewStore'
import { useHolderStore } from '@/store/holderStore'

type Account = {
  id?: string
  kind: 'ppf' | 'epf'
  name: string
  account_number?: string | null
  current_balance: number | string
  annual_contribution?: number | string | null
  interest_rate?: number | string | null
  start_date?: string | null
  maturity_date?: string | null
  currency?: string
  country?: string
  holder_name?: string | null
}

const MIGRATION_HINT = 'This feature needs database migration 017_ppf_epf.sql. Please run it in your Supabase SQL editor, then try again.'

function isMissingTableError(err: any): boolean {
  if (!err) return false
  const msg = `${err.code ?? ''} ${err.message ?? ''} ${err.details ?? ''} ${err.hint ?? ''}`.toLowerCase()
  return msg.includes('pgrst') ||
    msg.includes('does not exist') ||
    msg.includes('relation') ||
    msg.includes('column') ||
    msg.includes('schema cache')
}

function maskAccount(num?: string | null): string {
  if (!num) return '—'
  const s = String(num).trim()
  if (s.length <= 4) return s
  return `••••${s.slice(-4)}`
}

export default function PpfEpfClient({ data }: { data: any[] }) {
  const [showModal, setShowModal] = useState(false)
  const [editItem,  setEditItem]  = useState<any>(null)
  const router    = useRouter()
  const supabase  = createClient()
  const { view }  = useViewStore()
  const { selectedHolder } = useHolderStore()

  const filtered = useMemo(() => {
    // PPF / EPF are India-only, so the UAE view should show nothing.
    let arr = view === 'uae'   ? data.filter(x => x.currency === 'AED' || x.country === 'UAE')
            : view === 'india' ? data.filter(x => (x.currency ?? 'INR') === 'INR' || (x.country ?? 'India') === 'India')
            : data
    if (selectedHolder) arr = arr.filter(x => (x.holder_name ?? 'Self') === selectedHolder)
    return [...arr].sort((a, b) => Number(b.current_balance) - Number(a.current_balance))
  }, [data, view, selectedHolder])

  const totalBalance = filtered.reduce((a, x) => a + Number(x.current_balance ?? 0), 0)
  const totalAnnual  = filtered.reduce((a, x) => a + Number(x.annual_contribution ?? 0), 0)
  const avgRate = filtered.length > 0
    ? (filtered.reduce((a, x) => a + Number(x.interest_rate ?? 0), 0) / filtered.length).toFixed(2)
    : '0.00'

  async function deleteItem(id: string) {
    if (!confirm('Delete this PPF/EPF account?')) return
    await supabase.from('ppf_epf_accounts').delete().eq('id', id)
    router.refresh()
  }

  function openAdd()  { setEditItem(null); setShowModal(true) }
  function openEdit(x: any) { setEditItem(x); setShowModal(true) }
  function closeModal() { setShowModal(false); setEditItem(null) }

  return (
    <InvPageShell title="PPF / EPF" subtitle="Provident Fund · Long-Term Savings" count={filtered.length}
      totalValue={`₹${Math.round(totalBalance).toLocaleString('en-IN')}`}
      onAdd={openAdd}>


      <InvHoldings listTitle="Your accounts" head={['Account', 'Type', 'Rate', 'Balance']} chartLabel="Balance by account"
        emptyMsg="No PPF or EPF accounts yet. Use Add new above to add one." totalCount={filtered.length}
        hero={{ label: 'Total balance', value: `₹${Math.round(totalBalance).toLocaleString('en-IN')}`, delta: `₹${Math.round(totalAnnual).toLocaleString('en-IN')} going in each year` }}
        tiles={[
          { label: 'Yearly contribution', value: `₹${Math.round(totalAnnual).toLocaleString('en-IN')}`, delta: 'counts towards 80C', icon: IcCal },
          { label: 'Average interest', value: `${avgRate}%`, delta: 'per year', icon: IcPct },
          { label: 'Accounts', value: String(filtered.length), delta: 'PPF and EPF', icon: IcLayers },
        ]}
        items={filtered.map((x, i) => {
          const isPpf = (x.kind ?? 'ppf') === 'ppf'
          return {
            key: x.id ?? String(i), name: x.name, color: isPpf ? '#16A34A' : '#3B8EF0',
            sub: [`A/C ${maskAccount(x.account_number)}`, x.maturity_date ? `matures ${fullDate(x.maturity_date)}` : null, x.holder_name && x.holder_name !== 'Self' ? x.holder_name : null].filter(Boolean).join(' · '),
            tag: isPpf ? 'PPF' : 'EPF', meta: Number(x.interest_rate ?? 0) > 0 ? `${Number(x.interest_rate)}% p.a.` : '—',
            value: Number(x.current_balance ?? 0), valueText: `₹${Number(x.current_balance ?? 0).toLocaleString('en-IN')}`,
            valueSub: `₹${Number(x.annual_contribution ?? 0).toLocaleString('en-IN')}/yr`,
            onEdit: () => openEdit(x), onDelete: () => deleteItem(x.id),
          }
        })} />

      {showModal && (
        <PpfEpfModal
          editData={editItem}
          onClose={closeModal}
          onSaved={() => { closeModal(); router.refresh() }}
        />
      )}
    </InvPageShell>
  )
}

// ----------------------------------------------------------------------------
// Self-contained Add / Edit modal (no shared AddInvestmentModal dependency)
// ----------------------------------------------------------------------------
function PpfEpfModal({ editData, onClose, onSaved }: { editData: any | null; onClose: () => void; onSaved: () => void }) {
  const supabase = createClient()
  const isEdit = !!editData?.id
  const [saving, setSaving] = useState(false)
  const [error,  setError]  = useState<string | null>(null)
  const [form, setForm] = useState<Account>({
    kind:                editData?.kind ?? 'ppf',
    name:                editData?.name ?? '',
    account_number:      editData?.account_number ?? '',
    current_balance:     editData?.current_balance ?? '',
    annual_contribution: editData?.annual_contribution ?? '',
    interest_rate:       editData?.interest_rate ?? '',
    start_date:          editData?.start_date ?? '',
    maturity_date:       editData?.maturity_date ?? '',
    holder_name:         editData?.holder_name ?? 'Self',
  })

  function set<K extends keyof Account>(k: K, v: Account[K]) {
    setForm(f => ({ ...f, [k]: v }))
  }

  async function save() {
    setError(null)
    if (!form.name.trim()) { setError('Please enter an account name.'); return }
    setSaving(true)

    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { setError('You must be signed in.'); setSaving(false); return }

    const payload = {
      kind:                form.kind,
      name:                form.name.trim(),
      account_number:      form.account_number?.toString().trim() || null,
      current_balance:     Number(form.current_balance) || 0,
      annual_contribution: Number(form.annual_contribution) || 0,
      interest_rate:       Number(form.interest_rate) || 0,
      start_date:          form.start_date || null,
      maturity_date:       form.maturity_date || null,
      currency:            'INR',
      country:             'India',
      holder_name:         form.holder_name?.toString().trim() || 'Self',
    }

    const res = isEdit
      ? await supabase.from('ppf_epf_accounts').update(payload).eq('id', editData.id)
      : await supabase.from('ppf_epf_accounts').insert({ ...payload, user_id: user.id })

    setSaving(false)
    if (res.error) {
      setError(isMissingTableError(res.error) ? MIGRATION_HINT : (res.error.message || 'Something went wrong.'))
      return
    }
    onSaved()
  }

  return (
    <div className="fixed inset-0 wl-sheet z-50 flex items-center justify-center p-4" style={{ background: 'rgba(0,0,0,0.35)' }} onClick={onClose}>
      <div className="wl-sheet-panel wl-card w-full max-w-md p-5 max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-[16px] font-bold" style={{ color: 'var(--text)' }}>{isEdit ? 'Edit PPF/EPF Account' : 'Add PPF/EPF Account'}</h2>
          <button onClick={onClose} style={{ color: 'var(--text3)' }}><X size={18} /></button>
        </div>

        {error && (
          <div className="flex items-start gap-2 mb-3 p-2.5 rounded-lg text-[11px]" style={{ background: 'var(--rose-bg)', color: 'var(--rose)' }}>
            <AlertTriangle size={14} className="flex-shrink-0 mt-0.5" />
            <span>{error}</span>
          </div>
        )}

        <div className="space-y-3">
          <div>
            <label className="text-[11px] font-semibold" style={{ color: 'var(--text2)' }}>Type</label>
            <div className="flex gap-2 mt-1">
              {(['ppf', 'epf'] as const).map(k => (
                <button key={k} type="button" onClick={() => set('kind', k)}
                  className="flex-1 py-2 rounded-lg text-[12px] font-bold uppercase tracking-wide transition-all border"
                  style={form.kind === k
                    ? { background: 'var(--sage)', color: '#fff', borderColor: 'var(--sage)' }
                    : { background: 'var(--card)', color: 'var(--text2)', borderColor: 'var(--border)' }}>
                  {k}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="text-[11px] font-semibold" style={{ color: 'var(--text2)' }}>Account Name</label>
            <input className="wl-input mt-1" value={form.name} onChange={e => set('name', e.target.value)} placeholder="e.g. SBI PPF Account" />
          </div>

          <div>
            <label className="text-[11px] font-semibold" style={{ color: 'var(--text2)' }}>Account Number</label>
            <input className="wl-input mt-1" value={form.account_number ?? ''} onChange={e => set('account_number', e.target.value)} placeholder="Optional" />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-[11px] font-semibold" style={{ color: 'var(--text2)' }}>Current Balance (₹)</label>
              <input className="wl-input mt-1" type="number" inputMode="decimal" value={form.current_balance} onChange={e => set('current_balance', e.target.value)} placeholder="0" />
            </div>
            <div>
              <label className="text-[11px] font-semibold" style={{ color: 'var(--text2)' }}>Annual Contribution (₹)</label>
              <input className="wl-input mt-1" type="number" inputMode="decimal" value={form.annual_contribution ?? ''} onChange={e => set('annual_contribution', e.target.value)} placeholder="0" />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-[11px] font-semibold" style={{ color: 'var(--text2)' }}>Interest Rate (% p.a.)</label>
              <input className="wl-input mt-1" type="number" inputMode="decimal" value={form.interest_rate ?? ''} onChange={e => set('interest_rate', e.target.value)} placeholder="e.g. 7.1" />
            </div>
            <div>
              <label className="text-[11px] font-semibold" style={{ color: 'var(--text2)' }}>Holder</label>
              <input className="wl-input mt-1" value={form.holder_name ?? ''} onChange={e => set('holder_name', e.target.value)} placeholder="Self" />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-[11px] font-semibold" style={{ color: 'var(--text2)' }}>Start Date</label>
              <input className="wl-input mt-1" type="date" value={form.start_date ?? ''} onChange={e => set('start_date', e.target.value)} />
            </div>
            <div>
              <label className="text-[11px] font-semibold" style={{ color: 'var(--text2)' }}>Maturity Date</label>
              <input className="wl-input mt-1" type="date" value={form.maturity_date ?? ''} onChange={e => set('maturity_date', e.target.value)} />
            </div>
          </div>
        </div>

        <div className="flex gap-2 mt-5">
          <button onClick={onClose} className="flex-1 py-2.5 rounded-lg text-[12px] font-semibold border transition-all"
            style={{ borderColor: 'var(--border)', color: 'var(--text2)', background: 'var(--card)' }}>
            Cancel
          </button>
          <button onClick={save} disabled={saving}
            className="flex-1 py-2.5 rounded-lg text-[12px] font-bold text-white transition-all disabled:opacity-60"
            style={{ background: 'var(--sage)' }}>
            {saving ? 'Saving…' : isEdit ? 'Save Changes' : 'Add Account'}
          </button>
        </div>
      </div>
    </div>
  )
}
