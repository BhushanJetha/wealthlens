'use client'
import { useState, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { useViewStore } from '@/store/viewStore'
import { Building2, Plus, Pencil, Trash2, Loader2 } from 'lucide-react'
import MetricCard from '@/components/dashboard/MetricCard'
import AddAccountModal from '@/components/forms/AddAccountModal'
import { PageHeader, InsightBar, AiActions, LearnStrip, HeroStat, KpiTile, Bars, Donut, ProgressRow, EmptyState, PALETTE } from '@/components/ui/kit'
import { ListCard, ListRow } from '@/components/ui/list'
import { fmtCompact } from '@/lib/format'
import { Wallet, Landmark, Coins, Layers } from 'lucide-react'

const TYPE_COLORS: Record<string, string> = {
  savings: '#16A34A', current: '#3B8EF0', salary: '#D97706', wallet: '#7C3AED',
  nre: '#0891B2', nro: '#EC5B8C', joint: '#64748B',
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
    a + toConv((Number(acc.current_balance) || Number(acc.outstanding_bal) || 0), acc.currency), 0)

  const short = (n: number) => fmtCompact(n, view === 'uae' ? 'AED' : 'INR')
  const bal = (a: any) => Number(a.current_balance) || Number(a.outstanding_bal) || 0
  const aed = filtered.filter(a => a.currency === 'AED').reduce((s, a) => s + bal(a), 0)
  const inr = filtered.filter(a => a.currency !== 'AED').reduce((s, a) => s + bal(a), 0)
  const current = filtered.filter(a => a.account_type === 'current').reduce((s, a) => s + toConv(bal(a), a.currency), 0)
  const byBank = Object.entries(filtered.reduce<Record<string, number>>((m, a) => {
    const k = a.bank_name || a.name; m[k] = (m[k] ?? 0) + toConv(bal(a), a.currency); return m
  }, {})).sort((a, b) => b[1] - a[1])
  const bars = [...filtered].sort((a, b) => toConv(bal(b), b.currency) - toConv(bal(a), a.currency)).slice(0, 8)
    .map(a => ({ label: String(a.bank_name || a.name).split(' ')[0], value: toConv(bal(a), a.currency), hi: true, tip: `${a.name}: ${a.currency === 'AED' ? 'AED ' : '₹'}${bal(a).toLocaleString('en-IN')}` }))

  async function handleDelete() {
    if (!deleteId) return
    setDeleting(true)
    await supabase.from('accounts').update({ is_active: false }).eq('id', deleteId)
    setDeleting(false)
    setDeleteId(null)
    router.refresh()
  }

  return (
    <div className="flex flex-col gap-3.5 md:gap-[18px] animate-fade-up">
      <div className="max-md:order-1"><PageHeader title="Bank accounts"
        sub={`${filtered.length} account${filtered.length !== 1 ? 's' : ''} · ${sym}${Math.round(totalBalance).toLocaleString('en-IN')} in total`}
        onAdd={() => setShowAdd(true)} addLabel="Add account"
        actions={<button onClick={() => setShowAdd(true)} className="wl-btn wl-btn-primary" style={{ height: 34 }}><Plus size={14} />Add account</button>} /></div>
      {filtered.length > 0 && (() => {
        const top = [...filtered].sort((a: any, b: any) => toConv(Number(b.current_balance ?? 0), b.currency) - toConv(Number(a.current_balance ?? 0), a.currency))[0]
        const ctx = `Accounts: ${filtered.map((a: any) => `${a.name} (${a.account_type}) ${a.currency} ${a.current_balance}`).join('; ')}. Total ${sym}${Math.round(totalBalance)}.`
        return (<>
          <div className="max-md:order-4"><InsightBar text={`${sym}${Math.round(totalBalance).toLocaleString('en-IN')} sits across ${filtered.length} account${filtered.length === 1 ? '' : 's'}${top ? `; ${top.name} holds the most` : ''}. Cash above your emergency fund could be earning more.`}
            prompt={`Explain my bank accounts page. ${ctx}`} /></div>
          <div className="max-md:order-5"><AiActions actions={['Find idle cash', 'Where should my emergency fund sit?']} context={ctx} /></div>
        </>)
      })()}

      {filtered.length === 0 ? (
        <div className="max-md:order-2"><EmptyState message="No bank accounts yet. Add one, or import a bank statement to fill in the balance."
          cta="Add account" onCta={() => setShowAdd(true)} onImport={() => router.push('/dashboard/ingest?m=bank')} /></div>
      ) : (<>
        <div className="max-md:contents grid grid-cols-1 lg:grid-cols-[1.6fr_1fr] gap-4">
          <HeroStat className="max-md:order-2" label="Total balance" value={`${sym}${Math.round(totalBalance).toLocaleString('en-IN')}`}
            delta={`${filtered.length} account${filtered.length === 1 ? '' : 's'} · balances from your latest statements`}
            right={<span className="text-[11.5px]" style={{ color: 'var(--text3)' }}>Balance by account</span>}>
            {bars.length > 1 && <Bars data={bars} className="h-[110px] md:h-auto md:flex-1 md:min-h-[170px] mt-3" label={`Balance by account: ${bars.map(b => b.tip).join(', ')}`} />}
          </HeroStat>

          <section className="wl-card max-md:order-6 px-4 md:px-5 py-4 md:py-[18px] flex flex-col gap-3">
            <h2 className="text-[14px] font-semibold" style={{ color: 'var(--text)' }}>By bank</h2>
            <div className="hidden md:flex justify-center">
              <Donut segments={byBank.map(([, v], i) => ({ value: v, color: PALETTE[i % PALETTE.length] }))} size={128}
                label={`Balance by bank: ${byBank.map(([k, v]) => `${k} ${short(v)}`).join(', ')}`}>
                <div className="text-[10.5px]" style={{ color: 'var(--text3)' }}>Total</div>
                <div className="text-[16px] font-bold" style={{ color: 'var(--text)' }}>{short(totalBalance)}</div>
              </Donut>
            </div>
            {byBank.map(([k, v], i) => (
              <ProgressRow key={k} name={k} value={short(v)} right={`${totalBalance > 0 ? Math.round(v / totalBalance * 100) : 0}%`}
                pct={totalBalance > 0 ? v / totalBalance * 100 : 0} color={PALETTE[i % PALETTE.length]} />
            ))}
          </section>
        </div>

        <div className="max-md:order-3 grid grid-cols-2 lg:grid-cols-4 gap-2.5 md:gap-3.5">
          <KpiTile label="UAE" value={`AED ${Math.round(aed).toLocaleString('en-US')}`} delta={`${filtered.filter(a => a.currency === 'AED').length} account(s)`} tint={0} icon={Landmark} />
          <KpiTile label="India" value={`₹${Math.round(inr).toLocaleString('en-IN')}`} delta={`${filtered.filter(a => a.currency !== 'AED').length} account(s)`} tint={1} icon={Wallet} />
          <KpiTile label="In current accounts" value={short(current)} delta={current > 0 ? 'Earns little or no interest' : 'None'} tint={2} icon={Coins} />
          <KpiTile label="Accounts" value={String(filtered.length)} delta={`${new Set(filtered.map(a => a.account_type)).size} type(s)`} tint={3} icon={Layers} />
        </div>

        <ListCard className="max-md:order-7" title="Your accounts" sub={`${filtered.length} account${filtered.length === 1 ? '' : 's'}`}
          head={['Account', 'Type', 'Country', 'Balance']}>
          {filtered.map((acc: any) => {
            const l = acc.currency === 'AED' ? 'AED ' : '₹'
            const type = String(acc.account_type ?? 'savings').replace('_', ' ')
            return (
              <ListRow key={acc.id} color={TYPE_COLORS[acc.account_type] ?? '#64748B'} initial={<Building2 size={16} />} title={acc.name}
                sub={[acc.bank_name, acc.last_four ? `••••${acc.last_four}` : null].filter(Boolean).join(' · ')}
                tag={type[0].toUpperCase() + type.slice(1)} meta={acc.country ?? (acc.currency === 'AED' ? 'UAE' : 'India')}
                amount={`${l}${bal(acc).toLocaleString('en-IN')}`}
                amountSub={view === 'consolidated' && acc.currency === 'AED' ? `≈ ₹${Math.round(toConv(bal(acc), 'AED')).toLocaleString('en-IN')}` : undefined}
                onOpen={() => setEditAccount(acc)}
                actions={[
                  { label: 'Edit', icon: Pencil, onClick: () => setEditAccount(acc) },
                  { label: 'Remove', icon: Trash2, onClick: () => setDeleteId(acc.id), danger: true },
                ]} />
            )
          })}
        </ListCard>
      </>)}

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
        <div className="fixed inset-0 wl-sheet bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="wl-sheet-panel rounded-2xl p-6 w-full max-w-sm"
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
      <div className="max-md:order-8"><LearnStrip title="Build a safety net first" href="/dashboard/goals/learn" /></div>
    </div>
  )
}
