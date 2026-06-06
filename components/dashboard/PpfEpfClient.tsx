'use client'
import { useState, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import InvPageShell from './InvPageShell'
import HolderFilter from './HolderFilter'
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

      <HolderFilter />

      {/* Summary */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { label: 'Total Balance', value: `₹${Math.round(totalBalance).toLocaleString('en-IN')}`, color: 'var(--blue)' },
          { label: 'Annual Contribution', value: `₹${Math.round(totalAnnual).toLocaleString('en-IN')}`, color: 'var(--income)' },
          { label: 'Avg Interest', value: `${avgRate}% p.a.`, color: 'var(--gold)' },
          { label: 'Accounts', value: `${filtered.length}`, color: 'var(--text)' },
        ].map(c => (
          <div key={c.label} className="wl-card p-3">
            <div className="text-[10px] uppercase tracking-wider mb-1" style={{ color: 'var(--text3)' }}>{c.label}</div>
            <div className="text-[17px] font-bold font-mono" style={{ color: c.color }}>{c.value}</div>
          </div>
        ))}
      </div>

      {/* Account cards */}
      {filtered.length === 0 ? (
        <div className="wl-card py-16 text-center" style={{ borderStyle: 'dashed' }}>
          <div className="flex justify-center mb-3">
            <div className="w-12 h-12 rounded-full flex items-center justify-center" style={{ background: 'var(--sage-bg)' }}>
              <PiggyBank size={22} style={{ color: 'var(--sage)' }} />
            </div>
          </div>
          <div className="text-[13px] mb-3" style={{ color: 'var(--text3)' }}>No PPF or EPF accounts yet.</div>
          <button onClick={openAdd}
            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-[12px] font-bold text-white transition-all"
            style={{ background: 'var(--sage)' }}>
            <PiggyBank size={14} /> Add PPF/EPF account
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {filtered.map((x, i) => {
            const isPpf = (x.kind ?? 'ppf') === 'ppf'
            return (
              <div key={x.id ?? i} className="wl-card p-4">
                <div className="flex justify-between items-start mb-2">
                  <div>
                    <div className="flex items-center gap-2">
                      <div className="text-[13px] font-bold" style={{ color: 'var(--text)' }}>{x.name}</div>
                      <span className="text-[9px] px-1.5 py-0.5 rounded font-bold uppercase tracking-wide"
                        style={isPpf
                          ? { background: 'var(--sage-bg)', color: 'var(--sage)' }
                          : { background: 'var(--blue-bg)', color: 'var(--blue)' }}>
                        {isPpf ? 'PPF' : 'EPF'}
                      </span>
                    </div>
                    <div className="text-[10px]" style={{ color: 'var(--text3)' }}>A/C {maskAccount(x.account_number)}</div>
                    {x.holder_name && x.holder_name !== 'Self' && (
                      <span className="text-[9px] px-1.5 py-0.5 rounded font-semibold mt-0.5 inline-block"
                        style={{ background: 'var(--blue-bg)', color: 'var(--blue)' }}>{x.holder_name}</span>
                    )}
                  </div>
                  <div className="flex gap-1">
                    <button onClick={() => openEdit(x)} className="p-1 rounded" style={{ color: 'var(--text3)' }}><Pencil size={12} /></button>
                    <button onClick={() => deleteItem(x.id)} className="p-1 rounded" style={{ color: 'var(--rose)' }}><Trash2 size={12} /></button>
                  </div>
                </div>
                {Number(x.interest_rate ?? 0) > 0 && (
                  <div className="text-[11px] font-bold mb-2 px-2 py-0.5 rounded-full inline-block" style={{ background: 'var(--gold-bg)', color: 'var(--gold)' }}>{Number(x.interest_rate)}% p.a.</div>
                )}
                <div className="grid grid-cols-2 gap-2 text-[11px]">
                  <div>
                    <div style={{ color: 'var(--text3)' }}>Balance</div>
                    <div className="font-mono font-bold" style={{ color: 'var(--text)' }}>₹{Number(x.current_balance ?? 0).toLocaleString('en-IN')}</div>
                  </div>
                  <div>
                    <div style={{ color: 'var(--text3)' }}>Annual</div>
                    <div className="font-mono font-bold" style={{ color: 'var(--income)' }}>₹{Number(x.annual_contribution ?? 0).toLocaleString('en-IN')}</div>
                  </div>
                </div>
                {x.maturity_date && (
                  <div className="flex items-center gap-1 mt-2 text-[10px]" style={{ color: 'var(--text3)' }}>
                    <Clock size={10} /> Matures on {x.maturity_date}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}

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
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: 'rgba(0,0,0,0.35)' }} onClick={onClose}>
      <div className="wl-card w-full max-w-md p-5 max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
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
