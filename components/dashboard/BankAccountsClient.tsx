'use client'
import { useState, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { useViewStore } from '@/store/viewStore'
import { Building2, Plus, Pencil, Trash2, Loader2 } from 'lucide-react'
import MetricCard from '@/components/dashboard/MetricCard'
import AddAccountModal from '@/components/forms/AddAccountModal'

const TYPE_COLORS: Record<string, string> = {
  savings:  'var(--sage)',
  current:  'var(--blue)',
  salary:   'var(--gold)',
  wallet:   'var(--purple)',
  nre:      'var(--income)',
  nro:      'var(--rose)',
  joint:    'var(--text2)',
}


export default function BankAccountsClient({ accounts }: { accounts: any[] }) {
  const [showAdd,      setShowAdd]      = useState(false)
  const [editAccount,  setEditAccount]  = useState<any | null>(null)
  const [deleteId,     setDeleteId]     = useState<string | null>(null)
  const [deleting,     setDeleting]     = useState(false)
  const { view, fxRate: FX } = useViewStore()
  const router   = useRouter()
  const supabase = createClient()

  const filtered = useMemo(() => {
    if (view === 'uae')   return accounts.filter(a => a.currency === 'AED')
    if (view === 'india') return accounts.filter(a => a.currency === 'INR')
    return accounts
  }, [accounts, view])

  const sym = view === 'uae' ? 'AED ' : '₹'

  const toConv = (amt: number, cur: string) =>
    view === 'consolidated' ? (cur === 'AED' ? amt * FX : amt) : amt

  const totalBalance = filtered.reduce((a, acc) =>
    a + toConv(Number(acc.outstanding_bal ?? acc.current_balance ?? 0), acc.currency), 0)

  async function handleDelete() {
    if (!deleteId) return
    setDeleting(true)
    await supabase.from('accounts').update({ is_active: false }).eq('id', deleteId)
    setDeleting(false)
    setDeleteId(null)
    router.refresh()
  }

  return (
    <div className="space-y-5 animate-fade-up">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold" style={{ color: 'var(--text)' }}>Bank Accounts</h1>
          <p className="text-[12px] mt-0.5" style={{ color: 'var(--text3)' }}>
            {filtered.length} account{filtered.length !== 1 ? 's' : ''}
          </p>
        </div>
        <button onClick={() => setShowAdd(true)}
          className="flex items-center gap-2 px-3 py-2 rounded-lg text-white text-[12px] font-bold"
          style={{ background: 'var(--sage)' }}>
          <Plus size={14} /> Add Account
        </button>
      </div>

      {/* KPI */}
      <div className="grid grid-cols-2 lg:grid-cols-3 gap-3">
        <MetricCard
          label="Total Balance"
          value={`${sym}${Math.round(totalBalance).toLocaleString('en-IN')}`}
          accent="teal"
        />
        <MetricCard
          label="Total Accounts"
          value={String(filtered.length)}
          accent="blue"
        />
        <MetricCard
          label="Account Types"
          value={String(new Set(filtered.map(a => a.account_type)).size)}
          accent="gold"
        />
      </div>

      {/* Accounts grid */}
      {filtered.length === 0 ? (
        <div className="wl-card py-16 text-center" style={{ borderStyle: 'dashed' }}>
          <Building2 size={32} className="mx-auto mb-3" style={{ color: 'var(--border2)' }} />
          <div className="text-[13px] mb-4" style={{ color: 'var(--text3)' }}>No bank accounts added yet</div>
          <button onClick={() => setShowAdd(true)}
            className="px-4 py-2 rounded-lg text-white text-[12px] font-bold"
            style={{ background: 'var(--sage)' }}>
            Add Bank Account
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {filtered.map((acc: any) => {
            const bal      = Number(acc.outstanding_bal ?? acc.current_balance ?? 0)
            const lSym     = acc.currency === 'AED' ? 'AED ' : '₹'
            const typeCol  = TYPE_COLORS[acc.account_type] ?? 'var(--text2)'
            return (
              <div key={acc.id} className="wl-card p-5 relative">
                <div className="absolute top-0 left-0 right-0 h-[3px] rounded-t-[inherit]"
                  style={{ background: typeCol }} />

                <div className="flex items-start justify-between gap-2 mb-4 mt-1">
                  <div className="flex items-start gap-3 flex-1 min-w-0">
                    <div className="w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0"
                      style={{ background: typeCol + '18' }}>
                      <Building2 size={16} style={{ color: typeCol }} />
                    </div>
                    <div className="min-w-0">
                      <div className="text-[14px] font-bold truncate" style={{ color: 'var(--text)' }}>
                        {acc.name}
                      </div>
                      <div className="text-[11px]" style={{ color: 'var(--text3)' }}>
                        {acc.bank_name} · {acc.country}
                        {acc.last_four && ` · ••••${acc.last_four}`}
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-1 flex-shrink-0">
                    <button onClick={() => setEditAccount(acc)}
                      className="w-7 h-7 rounded-lg flex items-center justify-center"
                      style={{ background: 'var(--blue-bg)', color: 'var(--blue)' }}
                      title="Edit account">
                      <Pencil size={12} />
                    </button>
                    <button onClick={() => setDeleteId(acc.id)}
                      className="w-7 h-7 rounded-lg flex items-center justify-center"
                      style={{ background: 'var(--rose-bg)', color: 'var(--rose)' }}
                      title="Remove account">
                      <Trash2 size={12} />
                    </button>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <div className="col-span-2 rounded-lg p-3"
                    style={{ background: 'var(--bg2)', border: '1px solid var(--border)' }}>
                    <div className="text-[9px] uppercase tracking-wider mb-1" style={{ color: 'var(--text3)' }}>
                      Balance
                    </div>
                    <div className="text-[18px] font-bold font-mono" style={{ color: typeCol }}>
                      {lSym}{bal.toLocaleString('en-IN')}
                    </div>
                  </div>
                  <div className="rounded-lg p-2.5"
                    style={{ background: 'var(--bg2)', border: '1px solid var(--border)' }}>
                    <div className="text-[9px] uppercase tracking-wider mb-1" style={{ color: 'var(--text3)' }}>
                      Type
                    </div>
                    <span className="text-[11px] font-semibold capitalize px-2 py-0.5 rounded"
                      style={{ background: typeCol + '18', color: typeCol }}>
                      {acc.account_type.replace('_', ' ')}
                    </span>
                  </div>
                  <div className="rounded-lg p-2.5"
                    style={{ background: 'var(--bg2)', border: '1px solid var(--border)' }}>
                    <div className="text-[9px] uppercase tracking-wider mb-1" style={{ color: 'var(--text3)' }}>
                      Currency
                    </div>
                    <div className="text-[13px] font-bold font-mono" style={{ color: 'var(--text)' }}>
                      {acc.currency}
                    </div>
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* Modals */}
      {showAdd && (
        <AddAccountModal onClose={() => { setShowAdd(false); router.refresh() }} type="savings" />
      )}
      {editAccount && (
        <AddAccountModal
          onClose={() => { setEditAccount(null); router.refresh() }}
          type={editAccount.account_type}
          initialData={editAccount}
          cardId={editAccount.id}
        />
      )}

      {/* Delete confirm */}
      {deleteId && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="rounded-2xl p-6 w-full max-w-sm"
            style={{ background: '#fff', border: '1px solid var(--border)', boxShadow: '0 8px 32px rgba(0,0,0,0.12)' }}>
            <div className="flex items-center gap-3 mb-3">
              <div className="w-10 h-10 rounded-xl flex items-center justify-center"
                style={{ background: 'var(--rose-bg)' }}>
                <Trash2 size={18} style={{ color: 'var(--rose)' }} />
              </div>
              <h2 className="text-[15px] font-bold" style={{ color: 'var(--text)' }}>Remove Bank Account?</h2>
            </div>
            <p className="text-[13px] mb-5" style={{ color: 'var(--text2)' }}>
              This account will be removed from your dashboard. All associated transaction history remains intact.
            </p>
            <div className="flex gap-3">
              <button onClick={() => setDeleteId(null)}
                className="flex-1 py-2.5 rounded-lg text-[12px] font-semibold"
                style={{ border: '1px solid var(--border)', color: 'var(--text3)', background: 'var(--bg2)' }}>
                Cancel
              </button>
              <button onClick={handleDelete} disabled={deleting}
                className="flex-1 py-2.5 rounded-lg text-white text-[12px] font-bold flex items-center justify-center gap-2 disabled:opacity-50"
                style={{ background: 'var(--rose)' }}>
                {deleting ? <><Loader2 size={13} className="animate-spin" />Removing…</> : 'Remove'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
