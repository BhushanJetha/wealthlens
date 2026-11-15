'use client'
import { useState, useCallback, useEffect, useMemo } from 'react'
import { premiumsPaid, premiumSchedule, type PremiumYear } from '@/lib/insurancePaid'
import { useDropzone } from 'react-dropzone'
import { useViewStore } from '@/store/viewStore'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import MetricCard from '@/components/dashboard/MetricCard'
import AddInsuranceModal from '@/components/forms/AddInsuranceModal'
import { Shield, Upload, AlertCircle, Loader2, Plus, Pencil, Trash2 } from 'lucide-react'
import { PageHeader, InsightBar, AiActions, LearnStrip, HeroStat, KpiTile, Bars, ProgressRow, EmptyState } from '@/components/ui/kit'
import { ListCard, ListRow } from '@/components/ui/list'
import { addMonths, fmtDay } from '@/lib/insights'
import { fmtCompact } from '@/lib/format'
import { CalendarClock, Layers, HeartPulse, Wallet } from 'lucide-react'
import Link from 'next/link'
import type { Protection } from '@/lib/portfolio/protection'

function toINR(amt: number, cur: string, fx: number) { return cur === 'AED' ? amt * fx : amt }

const TYPE_COLORS: Record<string, string> = {
  term_life: '#DC2626', health: '#16A34A', property: '#D97706',
  vehicle: '#3B8EF0', travel: '#0891B2', other: '#64748B',
}
const PER_YEAR: Record<string, number> = { monthly: 12, quarterly: 4, semi_annual: 2, annual: 1 }
const MON = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']

const TYPE_LABELS: Record<string, string> = {
  term_life: 'Term Life', health: 'Health', property: 'Property',
  vehicle: 'Vehicle', travel: 'Travel', other: 'Other',
}

export default function InsuranceClient({ policies, cover, premiums = [], today: todayStr }: { policies: any[]; cover?: Protection & { nomineesMissing: number | null; parents: boolean }; premiums?: any[]; today?: string }) {
  const { view, fxRate: FX } = useViewStore()
  const router   = useRouter()
  const supabase = createClient()

  const [uploading,     setUploading]     = useState(false)
  const [uploadError,   setUploadError]   = useState('')
  const [pendingFile,   setPendingFile]   = useState<File | null>(null)   // waiting for a PDF password
  const [password,      setPassword]      = useState('')
  const [wrongPwd,      setWrongPwd]      = useState(false)
  const [prefill,       setPrefill]       = useState<any | null>(null)    // parsed fields → Add-policy form
  const [filledNote,    setFilledNote]    = useState('')
  const [localPolicies, setLocalPolicies] = useState(policies)
  useEffect(() => { setLocalPolicies(policies) }, [policies])
  const [showAdd,       setShowAdd]       = useState(false)
  const [editPolicy,    setEditPolicy]    = useState<any | null>(null)
  const [deleteId,      setDeleteId]      = useState<string | null>(null)
  const [deleting,      setDeleting]      = useState(false)

  const filtered = view === 'uae' ? localPolicies.filter(p => p.currency === 'AED')
    : view === 'india' ? localPolicies.filter(p => p.currency === 'INR') : localPolicies

  const sym  = view === 'uae' ? 'AED ' : '₹'
  const conv = (amt: number, cur: string) => view === 'consolidated' ? toINR(amt, cur, FX) : amt

  const totalPremium = filtered.reduce((a, p) => a + conv(Number(p.annual_premium), p.currency), 0)
  // Paid so far on each policy (lib/insurancePaid): by its schedule, and what your entries show
  const day = todayStr ?? new Date().toISOString().slice(0, 10)
  const paidOf = useMemo(() => new Map(localPolicies.map(p => [p.id, premiumsPaid(p, day, premiums)])), [localPolicies, day, premiums])
  const paidTotal = filtered.reduce((a, p) => a + conv(paidOf.get(p.id)?.paid ?? 0, p.currency), 0)
  const oldest = filtered.map(p => paidOf.get(p.id)?.since).filter(Boolean).sort()[0] as string | undefined
  const [openPolicy, setOpenPolicy] = useState<string | null>(null)
  const totalAssured = filtered.reduce((a, p) => a + conv(Number(p.sum_assured ?? 0), p.currency), 0)
  const lifeAssured  = filtered.filter(p => p.policy_type === 'term_life').reduce((a, p) => a + conv(Number(p.sum_assured ?? 0), p.currency), 0)

  const today = new Date()
  const nextDue = filtered
    .filter(p => p.next_premium_date)
    .sort((a, b) => new Date(a.next_premium_date).getTime() - new Date(b.next_premium_date).getTime())[0]
  const daysToNext = nextDue ? Math.ceil((new Date(nextDue.next_premium_date).getTime() - today.getTime()) / 86400000) : null

  const short = (n: number) => fmtCompact(n, view === 'uae' ? 'AED' : 'INR')
  const money = (n: number) => `${sym}${Math.round(n).toLocaleString('en-IN')}`

  // Premiums falling due in each of the next 12 months (instalment = annual ÷ instalments a year)
  const thisMonth = today.toISOString().slice(0, 7)
  const months = Array.from({ length: 12 }, (_, i) => addMonths(thisMonth, i))
  const dueBy: Record<string, number> = {}
  filtered.forEach(p => {
    if (!p.next_premium_date) return
    const n = PER_YEAR[p.premium_frequency] ?? 1, step = 12 / n
    const inst = conv(Number(p.annual_premium) || 0, p.currency) / n
    let m = String(p.next_premium_date).slice(0, 7)
    for (let k = 0; k < 24 && m <= months[11]; k++) {
      if (m >= thisMonth) dueBy[m] = (dueBy[m] ?? 0) + inst
      m = addMonths(m, step)
    }
  })
  const premBars = months.map(m => ({ label: MON[Number(m.slice(5)) - 1], value: dueBy[m] ?? 0, hi: (dueBy[m] ?? 0) > 0,
    tip: `${MON[Number(m.slice(5)) - 1]} ${m.slice(0, 4)}: ${money(dueBy[m] ?? 0)}` }))
  const byType = Object.entries(filtered.reduce<Record<string, number>>((m, p) => {
    m[p.policy_type] = (m[p.policy_type] ?? 0) + conv(Number(p.sum_assured ?? 0), p.currency); return m
  }, {})).filter(([, v]) => v > 0).sort((a, b) => b[1] - a[1])
  const renewSoon = filtered.filter(p => p.expiry_date && (new Date(p.expiry_date).getTime() - today.getTime()) / 86400000 <= 60).length

  async function handleDelete() {
    if (!deleteId) return
    setDeleting(true)
    await supabase.from('insurance_policies').update({ is_active: false }).eq('id', deleteId)
    setLocalPolicies(prev => prev.filter(p => p.id !== deleteId))
    setDeleting(false)
    setDeleteId(null)
    router.refresh()
  }

  // Read the PDF locally on the server, then open the Add-policy form with
  // what was found so the user checks it before anything is saved
  const readPolicy = useCallback(async (file: File, pwd?: string) => {
    setUploading(true); setUploadError(''); setFilledNote('')
    const fd = new FormData()
    fd.append('file', file)
    if (pwd) fd.append('password', pwd)
    try {
      const res  = await fetch('/api/parse-insurance', { method: 'POST', body: fd })
      const data = await res.json()
      if (data.encrypted || data.wrongPassword) {
        setPendingFile(file); setWrongPwd(!!data.wrongPassword); setPassword('')
      } else if (!res.ok) {
        throw new Error(data.error ?? 'Could not read this PDF.')
      } else {
        setPendingFile(null); setWrongPwd(false)
        setFilledNote(`Filled in ${data.found} of ${data.of} key details from your PDF. Check them before saving.`)
        setPrefill(data.policy ?? {})
      }
    } catch (e: any) { setUploadError(e.message) }
    setUploading(false)
  }, [])
  const onDrop = useCallback((files: File[]) => { if (files[0]) readPolicy(files[0]) }, [readPolicy])

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop, accept: { 'application/pdf': ['.pdf'] },
    maxFiles: 1, maxSize: 20 * 1024 * 1024,
  })

  return (
    <div className="flex flex-col gap-3.5 md:gap-[18px] animate-fade-up">
      <div className="max-md:order-1"><PageHeader title="Insurance" sub="Renewals, premiums and cover · read from your policy PDFs or added by hand"
        onAdd={() => setShowAdd(true)} addLabel="Add policy"
        actions={<button onClick={() => setShowAdd(true)} className="wl-btn wl-btn-primary" style={{ height: 34 }}><Plus size={14} />Add policy</button>} /></div>
      {filtered.length > 0 && <div className="max-md:order-4"><InsightBar
        text={`You pay ${sym}${Math.round(totalPremium).toLocaleString('en-IN')} a year for ${sym}${(totalAssured / 100000).toFixed(1)}L of cover, including ${sym}${(lifeAssured / 10000000).toFixed(2)}Cr of term life.${daysToNext !== null ? ` Next premium is due in ${daysToNext} day${daysToNext === 1 ? '' : 's'}.` : ''} A common guide is term cover of about 10× your yearly income.`}
        prompt={`Explain my insurance page. Annual premiums ${sym}${Math.round(totalPremium)}, total cover ${sym}${Math.round(totalAssured)}, term life ${sym}${Math.round(lifeAssured)}. Policies: ${filtered.map((p: any) => `${p.policy_name} (${p.policy_type}) cover ${p.currency} ${p.sum_assured}, premium ${p.annual_premium}${p.expiry_date ? `, renews ${p.expiry_date}` : ''}`).join('; ')}.`} /></div>}
      {filtered.length > 0 && <div className="max-md:order-5"><AiActions actions={['Check my cover gap', 'Am I paying too much?']}
        context={`Policies: ${filtered.map((p: any) => `${p.policy_name} (${p.policy_type}) cover ${p.currency} ${p.sum_assured}`).join('; ')}.`} /></div>}

      {filtered.length > 0 && (<>
        <div className="max-md:contents grid grid-cols-1 lg:grid-cols-[1.6fr_1fr] gap-4">
          <HeroStat className="max-md:order-2" label="Total cover" value={money(totalAssured)}
            delta={`${lifeAssured > 0 ? `${short(lifeAssured)} of it term life · ` : 'No term life cover · '}${short(totalPremium)} a year in premiums`}
            tone={lifeAssured > 0 ? 'neutral' : 'bad'}
            right={<span className="text-[11.5px]" style={{ color: 'var(--text3)' }}>Premiums due, next 12 months</span>}>
            {premBars.some(b => b.value > 0)
              ? <Bars data={premBars} className="h-[110px] md:h-auto md:flex-1 md:min-h-[170px] mt-3" label={`Premiums due by month: ${premBars.map(b => b.tip).join(', ')}`} />
              : <p className="text-[12px] mt-3" style={{ color: 'var(--text3)' }}>Add next premium dates to see when premiums fall due.</p>}
          </HeroStat>

          <section className="wl-card max-md:order-6 px-4 md:px-5 py-4 md:py-[18px] flex flex-col gap-3">
            <h2 className="text-[14px] font-semibold" style={{ color: 'var(--text)' }}>Cover by type</h2>
            {byType.map(([t, v]) => (
              <ProgressRow key={t} name={TYPE_LABELS[t] ?? t} value={short(v)} right={`${totalAssured > 0 ? Math.round(v / totalAssured * 100) : 0}%`}
                pct={totalAssured > 0 ? v / totalAssured * 100 : 0} color={TYPE_COLORS[t] ?? '#64748B'} />
            ))}
            <p className="text-[11.5px] mt-auto" style={{ color: 'var(--text4)' }}>A common guide is term cover of about 10× your yearly income.</p>
          </section>
        </div>

        <div className="max-md:order-3 grid grid-cols-2 lg:grid-cols-5 gap-2.5 md:gap-3.5">
          <div className="col-span-2 lg:col-span-1"><KpiTile label="Paid so far" value={short(paidTotal)} tint={3} icon={Wallet}
            delta={oldest ? `Premiums since ${fmtDay(oldest)} ${oldest.slice(0, 4)}` : 'Add start dates to work it out'} /></div>
          <KpiTile label="Annual premium" value={short(totalPremium)} delta={`${filtered.length} polic${filtered.length === 1 ? 'y' : 'ies'}`} tint={2} icon={Wallet} />
          <KpiTile label="Policies" value={String(filtered.length)} tint={0} icon={Layers}
            delta={renewSoon ? `${renewSoon} renew${renewSoon === 1 ? 's' : ''} within 60 days` : 'None renewing soon'} tone={renewSoon ? 'bad' : 'neutral'} />
          <KpiTile label="Life cover" value={lifeAssured > 0 ? short(lifeAssured) : '—'} tint={3} icon={HeartPulse}
            delta={lifeAssured > 0 ? 'Term life sum assured' : 'No term life policy'} tone={lifeAssured > 0 ? 'neutral' : 'bad'} />
          <KpiTile label="Next premium" value={nextDue ? fmtDay(nextDue.next_premium_date) : '—'} tint={1} icon={CalendarClock}
            delta={nextDue ? `${nextDue.policy_name}${daysToNext != null ? ` · in ${daysToNext}d` : ''}` : 'No dates set'} />
        </div>
      </>)}

      {cover && (
        <section className="wl-card max-md:order-4 px-4 md:px-5 py-4" aria-label="Is your cover enough">
          <h2 className="text-[14px] md:text-[15px] font-semibold" style={{ color: 'var(--text)' }}>Is your cover enough?</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-2.5">
            <div>
              <div className="text-[11px] font-semibold uppercase tracking-[0.05em]" style={{ color: 'var(--text3)' }}>Life cover</div>
              {cover.dependents === 0 ? (
                <p className="text-[12.5px] mt-1.5 leading-snug" style={{ color: 'var(--text2)' }}>No one depends on your income{cover.loans > 0 ? `, but ${fmtCompact(cover.loans, 'INR')} of loans would fall on your family — cover at least that` : ', so life cover is optional for now'}.</p>
              ) : (<>
                <dl className="mt-1.5 text-[12.5px] flex flex-col gap-1">
                  {[[`10 years of income (${cover.dependents} depend on you)`, cover.incomeYear * 10], ['+ loans to clear', cover.loans], ['− investments your family could sell', -cover.liquid]].map(([k, v]) => (
                    <div key={k as string} className="flex justify-between gap-3"><dt style={{ color: 'var(--text3)' }}>{k}</dt><dd className="tabular-nums" style={{ color: 'var(--text)' }}>{(v as number) < 0 ? '−' : ''}{fmtCompact(Math.abs(v as number), 'INR')}</dd></div>
                  ))}
                  <div className="flex justify-between gap-3 pt-1" style={{ borderTop: '1px solid var(--track)' }}><dt className="font-semibold" style={{ color: 'var(--text)' }}>Cover needed</dt><dd className="font-semibold tabular-nums">{fmtCompact(cover.need, 'INR')}</dd></div>
                  <div className="flex justify-between gap-3"><dt style={{ color: 'var(--text3)' }}>You have (term {fmtCompact(cover.termCover, 'INR')} + LIC {fmtCompact(cover.licCover, 'INR')})</dt><dd className="tabular-nums">{fmtCompact(cover.cover, 'INR')}</dd></div>
                </dl>
                <div className="mt-2 rounded-lg px-3 py-2 text-[12.5px] font-semibold" style={{ background: cover.gap > 0 ? 'var(--amber-bg)' : 'var(--pos-bg)', color: cover.gap > 0 ? 'var(--amber-text)' : 'var(--pos-text)' }}>
                  {cover.gap > 0 ? `About ${fmtCompact(cover.gap, 'INR')} short — a term plan is the cheapest way to close it` : '✓ Your life cover is enough on this measure'}
                </div>
              </>)}
            </div>
            <div>
              <div className="text-[11px] font-semibold uppercase tracking-[0.05em]" style={{ color: 'var(--text3)' }}>Health & the rest</div>
              <ul className="mt-1.5 text-[12.5px] flex flex-col gap-1.5 leading-snug" style={{ color: 'var(--text2)' }}>
                <li>{cover.health.count ? `${fmtCompact(cover.health.amount, 'INR')} of health cover across ${cover.health.count} polic${cover.health.count === 1 ? 'y' : 'ies'}.` : 'No health policy recorded — UAE employer cover usually ends with the job and doesn’t cover family in India.'}</li>
                {cover.parents && <li>Parents in India: UAE cover doesn’t reach them. A senior-citizen policy or a family floater with a top-up keeps one hospital stay from becoming a crisis.</li>}
                {cover.nomineesMissing != null && cover.nomineesMissing > 0 && <li><Link href="/dashboard/nominees" className="font-semibold" style={{ color: 'var(--accent)' }}>{cover.nomineesMissing} accounts and policies have no nominee recorded →</Link></li>}
              </ul>
              <p className="text-[11px] mt-2" style={{ color: 'var(--text4)' }}>Income is your last 3 months’ average (₹, AED at today’s rate). A guide, not an underwriter’s figure.</p>
            </div>
          </div>
        </section>
      )}

      {/* Upload zone: local reader fills the Add-policy form */}
      <section className="wl-card max-md:order-8 px-4 md:px-5 py-3.5 md:py-[18px]">
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <h2 className="text-[14px] md:text-[15px] font-semibold flex items-center gap-2" style={{ color: 'var(--text)' }}>
            <Upload size={15} style={{ color: 'var(--accent)' }} /> Fill in from a policy PDF
          </h2>
          <span className="rounded-full px-2 py-0.5 text-[10.5px] font-semibold" style={{ background: '#E7F7EF', color: '#1E8F5F' }}>Read on our server, no AI</span>
        </div>
        <div {...getRootProps()} className="mt-3 rounded-[14px] p-6 md:p-8 text-center cursor-pointer transition-colors"
          style={{ border: `1.5px dashed ${isDragActive ? 'var(--accent)' : 'var(--border2)'}`, background: isDragActive ? 'var(--accent-bg)' : 'var(--canvas)' }}>
          <input {...getInputProps()} />
          <Shield size={24} className="mx-auto mb-2" style={{ color: 'var(--accent)' }} />
          <p className="text-[13px] font-semibold" style={{ color: 'var(--text)' }}>
            {isDragActive ? 'Drop to read it…' : 'Drop your policy schedule PDF, or click to browse'}
          </p>
          <p className="text-[11.5px] mt-1 max-w-[460px] mx-auto" style={{ color: 'var(--text3)' }}>
            We fill in the insurer, policy number, cover, premium and dates. You check the form before saving, and the PDF isn&apos;t kept.
          </p>
        </div>

        {uploading && (
          <div className="mt-3 flex items-center gap-2.5 text-[12.5px]" style={{ color: 'var(--text2)' }}>
            <Loader2 size={16} className="animate-spin" style={{ color: 'var(--accent)' }} /> Reading your policy…
          </div>
        )}
        {pendingFile && !uploading && (
          <form onSubmit={e => { e.preventDefault(); if (password) readPolicy(pendingFile, password) }}
            className="mt-3 flex flex-col sm:flex-row gap-2 sm:items-center">
            <span className="text-[12.5px]" style={{ color: wrongPwd ? '#D9482F' : 'var(--text2)' }}>
              {wrongPwd ? "That password didn't work. Try again:" : `${pendingFile.name} is password-protected. Enter its password:`}
            </span>
            <input type="password" value={password} onChange={e => setPassword(e.target.value)} autoFocus
              className="wl-input sm:!w-[200px]" aria-label="PDF password" />
            <span className="flex gap-2">
              <button type="submit" disabled={!password} className="wl-btn wl-btn-primary disabled:opacity-60" style={{ height: 36 }}>Open</button>
              <button type="button" onClick={() => setPendingFile(null)} className="wl-btn" style={{ height: 36 }}>Cancel</button>
            </span>
          </form>
        )}
        {uploadError && (
          <div className="mt-3 rounded-[10px] px-3 py-2.5 flex items-center gap-2 text-[12.5px]" style={{ background: '#FDECE8', color: '#D9482F' }}>
            <AlertCircle size={14} className="flex-shrink-0" /> {uploadError}
          </div>
        )}
      </section>

      {/* Policies */}
      {filtered.length === 0 ? (
        <div className="max-md:order-2"><EmptyState message="No policies yet. Drop a policy PDF above to fill in the details, or add one by hand."
          cta="Add policy" onCta={() => setShowAdd(true)} /></div>
      ) : (
        <ListCard className="max-md:order-7" title="Your policies" sub={`${filtered.length} polic${filtered.length === 1 ? 'y' : 'ies'}`}
          head={['Policy', 'Type', 'Renews', 'Premium / yr']}>
          {filtered.map((p: any, i: number) => {
            const lSym = p.currency === 'AED' ? 'AED ' : '₹'
            const daysToExpiry = p.expiry_date ? Math.ceil((new Date(p.expiry_date).getTime() - today.getTime()) / 86400000) : null
            return (
              <ListRow key={p.id ?? i} color={TYPE_COLORS[p.policy_type] ?? '#64748B'} initial={<Shield size={16} />} title={p.policy_name}
                sub={[p.provider, p.policy_number ? `#${p.policy_number}` : null, Number(p.sum_assured) > 0 ? `cover ${lSym}${Number(p.sum_assured).toLocaleString('en-IN')}` : null, p.insured_members?.length ? p.insured_members.join(', ') : null].filter(Boolean).join(' · ')}
                tag={TYPE_LABELS[p.policy_type] ?? 'Other'}
                meta={p.expiry_date ? `${fmtDay(p.expiry_date)} ${String(p.expiry_date).slice(0, 4)}` : '—'}
                metaColor={daysToExpiry != null && daysToExpiry <= 60 ? '#D97706' : undefined}
                amount={`${lSym}${Number(p.annual_premium).toLocaleString('en-IN')}`}
                amountSub={(paidOf.get(p.id)?.paid ?? 0) > 0 ? `${lSym}${Math.round(paidOf.get(p.id)!.paid).toLocaleString('en-IN')} paid so far` : undefined}
                onOpen={() => setEditPolicy(p)}
                actions={[
                  { label: 'Edit', icon: Pencil, onClick: () => setEditPolicy(p) },
                  { label: 'Delete', icon: Trash2, onClick: () => setDeleteId(p.id), danger: true },
                ]} />
            )
          })}
        </ListCard>
      )}

      {/* What you've paid so far, policy by policy */}
      {filtered.length > 0 && paidTotal > 0 && (
        <section className="wl-card max-md:order-7 px-4 md:px-5 py-4 md:py-[18px] overflow-x-auto" aria-label="Premiums paid so far">
          <div className="flex justify-between items-baseline gap-3 flex-wrap">
            <h2 className="text-[14px] md:text-[15px] font-semibold" style={{ color: 'var(--text)' }}>What you’ve paid so far</h2>
            <b className="text-[16px] tabular-nums" style={{ color: 'var(--text)' }}>{money(paidTotal)}</b>
          </div>
          <table className="w-full mt-2.5 text-[12.5px] min-w-[560px]">
            <thead><tr style={{ color: 'var(--text3)' }}>
              <th className="text-left font-semibold py-2">Policy</th><th className="text-left font-semibold">Since</th><th className="text-right font-semibold">Premiums</th>
              <th className="text-right font-semibold">By its schedule</th><th className="text-right font-semibold">In your entries</th><th className="text-right font-semibold">Paid so far</th>
            </tr></thead>
            <tbody>
              {filtered.map((p: any) => { const x = paidOf.get(p.id)!, c = p.currency === 'AED' ? 'AED ' : '₹', f = (n: number) => `${c}${Math.round(n).toLocaleString('en-IN')}`
                const open = openPolicy === p.id
                return [
                  <tr key={p.id} onClick={() => setOpenPolicy(open ? null : p.id)} className="cursor-pointer hover:bg-[#FAFAFE]" aria-expanded={open} style={{ borderTop: '1px solid var(--track)' }}>
                    <td className="py-2.5 pr-3" style={{ color: 'var(--text)' }}><b className="font-semibold"><span className="inline-block w-4 transition-transform" style={{ transform: open ? 'rotate(90deg)' : 'none', color: 'var(--text3)' }}>›</span>{p.policy_name}</b><span className="block text-[11.5px]" style={{ color: 'var(--text3)' }}>{f(x.per)} {({ monthly: 'a month', quarterly: 'a quarter', semi_annual: 'every 6 months', annual: 'a year' } as Record<string, string>)[p.premium_frequency] ?? 'a year'}</span></td>
                    <td style={{ color: 'var(--text2)' }}>{x.since ? `${fmtDay(x.since)} ${x.since.slice(0, 4)}` : '—'}</td>
                    <td className="text-right tabular-nums" style={{ color: 'var(--text2)' }}>{x.count || '—'}</td>
                    <td className="text-right tabular-nums" style={{ color: 'var(--text2)' }}>{x.scheduled ? f(x.scheduled) : '—'}</td>
                    <td className="text-right tabular-nums" style={{ color: 'var(--text2)' }}>{x.recCount ? `${f(x.recorded)} · ${x.recCount}` : '—'}</td>
                    <td className="text-right tabular-nums font-semibold" style={{ color: 'var(--text)' }}>{x.paid ? f(x.paid) : '—'}</td>
                  </tr>,
                  open && <tr key={`${p.id}-s`}><td colSpan={6} className="pb-3"><PolicySchedule years={premiumSchedule(p, day, premiums)} cur={p.currency} monthly={p.premium_frequency !== 'annual'} /></td></tr>,
                ] })}
            </tbody>
          </table>
          <p className="text-[11.5px] mt-2.5 leading-relaxed" style={{ color: 'var(--text3)' }}>
            “By its schedule” counts each premium due from the policy’s start date to today, at today’s premium: if it went up over the years the real total is a little lower, and if the start date is just this year’s renewal, edit it to the first day of the policy.
            “In your entries” is what you’ve recorded as insurance that names the insurer, the policy or its number. “Paid so far” is the larger of the two. Tap a policy for each premium, year by year.
          </p>
          <div className="mt-3 rounded-xl px-3.5 py-3 text-[12.5px] leading-relaxed" style={{ background: '#F4F2FF', color: 'var(--text2)' }}>
            <b style={{ color: 'var(--text)' }}>In your net worth:</b> nothing is added. Term, health, vehicle and travel cover has no value you can take back — the premium buys protection, so it’s spending, and it already came out of your bank balance when you paid it.
            Plans that pay back (LIC, endowment, money-back, ULIPs) are different: they’re in <Link href="/dashboard/investments/lic" className="font-semibold" style={{ color: 'var(--accent)' }}>Investments › LIC</Link> and count in your net worth at what they’re worth.
          </div>
        </section>
      )}

      {/* Add modal */}
      {showAdd && <AddInsuranceModal onClose={() => { setShowAdd(false); router.refresh() }} />}

      {/* Add modal, pre-filled from a policy PDF */}
      {prefill && <AddInsuranceModal initialData={prefill} note={filledNote} onClose={() => { setPrefill(null); setFilledNote(''); router.refresh() }} />}

      {/* Edit modal */}
      {editPolicy && (
        <AddInsuranceModal
          onClose={() => setEditPolicy(null)}
          initialData={editPolicy}
          policyId={editPolicy.id}
        />
      )}

      {/* Delete confirmation */}
      {deleteId && (
        <div className="fixed inset-0 wl-sheet bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="wl-sheet-panel rounded-2xl p-6 w-full max-w-sm"
            style={{ background: '#fff', border: '1px solid var(--border)', boxShadow: '0 8px 32px rgba(0,0,0,0.12)' }}>
            <div className="flex items-center gap-3 mb-3">
              <div className="w-10 h-10 rounded-xl flex items-center justify-center"
                style={{ background: 'var(--rose-bg)' }}>
                <Trash2 size={18} style={{ color: 'var(--rose)' }} />
              </div>
              <h2 className="text-[15px] font-bold" style={{ color: 'var(--text)' }}>Delete Policy?</h2>
            </div>
            <p className="text-[13px] mb-5" style={{ color: 'var(--text2)' }}>
              This policy will be removed from your dashboard. The data cannot be recovered.
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
                {deleting ? <><Loader2 size={13} className="animate-spin" />Deleting…</> : 'Delete'}
              </button>
            </div>
          </div>
        </div>
      )}
      <div className="max-md:order-9"><LearnStrip title="Term insurance: how much is enough" href="/dashboard/learn" /></div>
    </div>
  )
}

// One policy's premiums from its start: a line per year (with the date and
// amount for a yearly policy), and for monthly or quarterly ones each year
// opens to its payments. Recorded = found in your entries; schedule = the
// premium as it is today; next = still to come.
function PolicySchedule({ years, cur, monthly }: { years: PremiumYear[]; cur: string; monthly: boolean }) {
  const [open, setOpen] = useState<string | null>(null)
  const f = (n: number) => `${cur === 'AED' ? 'AED ' : '₹'}${Math.round(n).toLocaleString('en-IN')}`
  const day = (d: string) => `${Number(d.slice(8, 10))} ${MON[Number(d.slice(5, 7)) - 1]}`
  const TAG = { recorded: { t: 'In your entries', bg: '#E7F6EE', c: '#15803D' }, schedule: { t: 'By the schedule', bg: '#F1F2F6', c: '#5F657A' }, next: { t: 'Next', bg: '#F4F2FF', c: '#4B3BC4' } }
  const tag = (k: keyof typeof TAG) => <span className="text-[10.5px] font-semibold px-1.5 py-[1px] rounded-full whitespace-nowrap" style={{ background: TAG[k].bg, color: TAG[k].c }}>{TAG[k].t}</span>
  if (!years.length) return <p className="text-[12px] px-2 py-2" style={{ color: 'var(--text3)' }}>Add the policy’s start date to see each premium.</p>
  return (
    <div className="rounded-xl ml-4 mt-1" style={{ background: '#FAFAFE', border: '1px solid var(--line)' }}>
      {years.map(y => {
        const one = !monthly && y.rows.length === 1 ? y.rows[0] : null, isOpen = open === y.year
        return (
          <div key={y.year} style={{ borderTop: '1px solid var(--track)' }} className="first:border-t-0">
            <button onClick={() => !one && setOpen(isOpen ? null : y.year)} className="w-full grid grid-cols-[56px_minmax(0,1fr)_auto] gap-3 items-center px-3 py-2 text-left text-[12.5px]" style={{ cursor: one ? 'default' : 'pointer' }}>
              <b style={{ color: 'var(--text)' }}>{y.year}</b>
              <span className="flex items-center gap-2 min-w-0" style={{ color: 'var(--text2)' }}>
                {one ? <><span className="w-12 tabular-nums">{day(one.date)}</span>{tag(one.kind)}</> : <>{y.count ? `${y.count} premium${y.count === 1 ? '' : 's'} paid` : ''}{y.rows.some(r => r.kind === 'next') ? `${y.count ? ' · ' : ''}${y.rows.filter(r => r.kind === 'next').length} to come` : ''}<span style={{ color: 'var(--text3)' }}>{isOpen ? '▾' : '▸'}</span></>}
              </span>
              <b className="tabular-nums" style={{ color: one?.kind === 'next' ? 'var(--text3)' : 'var(--text)' }}>{one ? f(one.amount) : f(y.paid)}</b>
            </button>
            {isOpen && !one && (
              <div className="pb-1.5">
                {y.rows.map(r => (
                  <div key={r.date} className="grid grid-cols-[56px_minmax(0,1fr)_auto] gap-3 items-center pl-[68px] pr-3 py-1.5 text-[12px]" style={{ color: 'var(--text2)' }}>
                    <span className="col-span-2 flex items-center gap-2"><span className="w-12 tabular-nums">{day(r.date)}</span>{tag(r.kind)}</span>
                    <span className="tabular-nums" style={{ color: r.kind === 'next' ? 'var(--text3)' : 'var(--text)' }}>{f(r.amount)}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}
