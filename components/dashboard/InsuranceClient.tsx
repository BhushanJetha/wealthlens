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
  const [addMenu, setAddMenu] = useState(false)          // Add: read a PDF or type it in
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
        setAddMenu(false)
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
        onAdd={() => setAddMenu(true)} addLabel="Add policy"
        actions={<button onClick={() => setAddMenu(true)} className="wl-btn wl-btn-primary" style={{ height: 34 }}><Plus size={14} />Add policy</button>} /></div>
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

      {/* Policies: one card each, with what it covers, what it costs and what you've paid */}
      {filtered.length === 0 ? (
        <div className="max-md:order-2"><EmptyState message="No policies yet. Add one by hand, or let us read your policy PDF and fill in the details."
          cta="Add policy" onCta={() => setAddMenu(true)} /></div>
      ) : (
        <section className="max-md:order-7 flex flex-col gap-3" aria-label="Your policies">
          <div className="flex justify-between items-baseline gap-3 px-0.5">
            <h2 className="text-[15px] md:text-[16px] font-semibold" style={{ color: 'var(--text)' }}>Your policies <span style={{ color: 'var(--text3)', fontWeight: 500 }}>· {filtered.length}</span></h2>
            <span className="text-[12.5px]" style={{ color: 'var(--text3)' }}>{money(paidTotal)} paid so far in all</span>
          </div>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-3 md:gap-3.5 items-start">
            {filtered.map((p: any) => {
              const x = paidOf.get(p.id)!, c = p.currency === 'AED' ? 'AED ' : '₹', f = (n: number) => `${c}${Math.round(n).toLocaleString('en-IN')}`
              const col = TYPE_COLORS[p.policy_type] ?? '#64748B', open = openPolicy === p.id
              const daysToExpiry = p.expiry_date ? Math.ceil((new Date(p.expiry_date).getTime() - today.getTime()) / 86400000) : null
              const every = ({ monthly: 'a month', quarterly: 'a quarter', semi_annual: 'every 6 months', annual: 'a year' } as Record<string, string>)[p.premium_frequency] ?? 'a year'
              return (
                <article key={p.id} className="wl-card p-4 md:p-5 flex flex-col gap-3.5">
                  <div className="flex items-start gap-3">
                    <span className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0" style={{ background: `${col}1A`, color: col }}><Shield size={18} /></span>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 flex-wrap"><b className="text-[14.5px] truncate" style={{ color: 'var(--text)' }}>{p.policy_name}</b>
                        <span className="text-[10.5px] font-semibold px-2 py-[1px] rounded-full" style={{ background: `${col}1A`, color: col }}>{TYPE_LABELS[p.policy_type] ?? 'Other'}</span></div>
                      <div className="text-[12px] truncate" style={{ color: 'var(--text3)' }}>{[p.provider, p.policy_number ? `#${p.policy_number}` : null, p.insured_members?.length ? p.insured_members.join(', ') : null].filter(Boolean).join(' · ')}</div>
                    </div>
                    <button onClick={() => setEditPolicy(p)} aria-label="Edit policy" className="w-8 h-8 rounded-lg flex items-center justify-center hover:bg-[var(--accent-bg)]" style={{ color: 'var(--text3)' }}><Pencil size={15} /></button>
                    <button onClick={() => setDeleteId(p.id)} aria-label="Delete policy" className="w-8 h-8 rounded-lg flex items-center justify-center hover:bg-[#FDECEA]" style={{ color: '#DC2626' }}><Trash2 size={15} /></button>
                  </div>
                  <div className="grid grid-cols-3 gap-2">
                    <div className="rounded-xl px-3 py-2.5" style={{ background: '#F5F6FA' }}><div className="text-[11px]" style={{ color: 'var(--text3)' }}>Cover</div><div className="text-[15px] font-bold tabular-nums truncate" style={{ color: 'var(--text)' }}>{Number(p.sum_assured) > 0 ? fmtCompact(Number(p.sum_assured), p.currency) : '—'}</div><div className="text-[10.5px]" style={{ color: 'var(--text3)' }}>paid out on a claim</div></div>
                    <div className="rounded-xl px-3 py-2.5" style={{ background: '#F5F6FA' }}><div className="text-[11px]" style={{ color: 'var(--text3)' }}>Premium</div><div className="text-[15px] font-bold tabular-nums truncate" style={{ color: 'var(--text)' }}>{f(x.per)}</div><div className="text-[10.5px]" style={{ color: 'var(--text3)' }}>{every}</div></div>
                    <div className="rounded-xl px-3 py-2.5" style={{ background: '#EEF4FF' }}><div className="text-[11px]" style={{ color: '#1D4ED8' }}>Paid so far</div><div className="text-[15px] font-bold tabular-nums truncate" style={{ color: 'var(--text)' }}>{x.paid ? fmtCompact(x.paid, p.currency) : '—'}</div><div className="text-[10.5px]" style={{ color: 'var(--text3)' }}>{x.count ? `${x.count} premium${x.count === 1 ? '' : 's'}` : 'add a start date'}</div></div>
                  </div>
                  <div className="flex justify-between gap-3 text-[12px] flex-wrap" style={{ color: 'var(--text2)' }}>
                    <span>{x.since ? `Since ${fmtDay(x.since)} ${x.since.slice(0, 4)}` : 'No start date'}{p.next_premium_date ? ` · next ${fmtDay(p.next_premium_date)}` : ''}</span>
                    <span style={{ color: daysToExpiry != null && daysToExpiry <= 60 ? '#B45309' : 'var(--text3)' }}>{p.expiry_date ? `Ends ${fmtDay(p.expiry_date)} ${String(p.expiry_date).slice(0, 4)}` : ''}</span>
                  </div>
                  <button onClick={() => setOpenPolicy(open ? null : p.id)} aria-expanded={open} className="flex items-center justify-between rounded-xl px-3 h-10 text-[13px] font-semibold" style={{ background: open ? 'var(--accent-bg)' : '#fff', border: '1px solid var(--line)', color: 'var(--accent2)' }}>
                    Premium history{x.recCount ? ` · ${x.recCount} found in your entries` : ''}<span style={{ transform: open ? 'rotate(90deg)' : 'none', transition: 'transform .15s' }}>›</span>
                  </button>
                  {open && <PolicySchedule years={premiumSchedule(p, day, premiums)} cur={p.currency} monthly={p.premium_frequency !== 'annual'} />}
                </article>
              )
            })}
          </div>

          {/* How these numbers work */}
          <section className="wl-card px-4 md:px-5 py-4 grid grid-cols-1 md:grid-cols-3 gap-4 text-[12.5px] leading-relaxed" style={{ color: 'var(--text2)' }} aria-label="How these numbers work">
            <div><b className="block text-[13px] mb-1" style={{ color: 'var(--text)' }}>Why paid so far is far less than the cover</b>
              The cover (sum assured) is what the insurer pays out if you claim — not money you put in. The premium is the price of that protection, so it’s a small part of it: {money(totalPremium)} a year buys {money(totalAssured)} of cover here.</div>
            <div><b className="block text-[13px] mb-1" style={{ color: 'var(--text)' }}>How paid so far is worked out</b>
              Each premium due from the start date to today. Where a payment you recorded matches one, it’s what you actually paid; otherwise today’s premium. If the start date is only this year’s renewal, edit it to the policy’s first day.</div>
            <div><b className="block text-[13px] mb-1" style={{ color: 'var(--text)' }}>In your net worth</b>
              Nothing is added: term, health, vehicle and travel cover has no value you can take back, and the premiums already came out of your bank. Plans that pay back (LIC, endowment, ULIPs) count in <Link href="/dashboard/investments/lic" className="font-semibold" style={{ color: 'var(--accent)' }}>Investments › LIC</Link>.</div>
          </section>
        </section>
      )}

      {/* Add: read a policy PDF (filled in for you to check) or type it in */}
      {addMenu && (
        <div className="fixed inset-0 z-50 flex items-end md:items-center justify-center p-0 md:p-4" style={{ background: 'rgba(20,23,43,.4)' }} onClick={() => !uploading && setAddMenu(false)}>
          <div role="dialog" aria-modal="true" aria-label="Add a policy" onClick={e => e.stopPropagation()} className="w-full md:max-w-[480px] bg-white rounded-t-[22px] md:rounded-2xl p-5 flex flex-col gap-3.5 shadow-2xl">
            <div className="flex justify-between items-center"><h2 className="text-[16px] font-bold" style={{ color: 'var(--text)' }}>Add a policy</h2>
              <span className="rounded-full px-2 py-0.5 text-[10.5px] font-semibold" style={{ background: '#E7F7EF', color: '#1E8F5F' }}>PDF read on our server, no AI</span></div>
            <div {...getRootProps()} className="rounded-[14px] p-6 text-center cursor-pointer transition-colors"
              style={{ border: `1.5px dashed ${isDragActive ? 'var(--accent)' : 'var(--border2)'}`, background: isDragActive ? 'var(--accent-bg)' : 'var(--canvas)' }}>
              <input {...getInputProps()} />
              <Upload size={22} className="mx-auto mb-2" style={{ color: 'var(--accent)' }} />
              <p className="text-[13px] font-semibold" style={{ color: 'var(--text)' }}>{isDragActive ? 'Drop to read it…' : 'Drop your policy schedule PDF, or tap to choose'}</p>
              <p className="text-[11.5px] mt-1" style={{ color: 'var(--text3)' }}>We fill in the insurer, number, cover, premium and dates for you to check. The PDF isn’t kept.</p>
            </div>
            {uploading && <div className="flex items-center gap-2.5 text-[12.5px]" style={{ color: 'var(--text2)' }}><Loader2 size={16} className="animate-spin" style={{ color: 'var(--accent)' }} /> Reading your policy…</div>}
            {pendingFile && !uploading && (
              <form onSubmit={e => { e.preventDefault(); if (password) readPolicy(pendingFile, password) }} className="flex flex-col gap-2">
                <span className="text-[12.5px]" style={{ color: wrongPwd ? '#D9482F' : 'var(--text2)' }}>{wrongPwd ? "That password didn't work. Try again:" : `${pendingFile.name} is password-protected. Enter its password:`}</span>
                <span className="flex gap-2"><input type="password" value={password} onChange={e => setPassword(e.target.value)} autoFocus className="wl-input flex-1" aria-label="PDF password" />
                  <button type="submit" disabled={!password} className="wl-btn wl-btn-primary disabled:opacity-60" style={{ height: 38 }}>Open</button></span>
              </form>
            )}
            {uploadError && <div className="rounded-[10px] px-3 py-2.5 flex items-center gap-2 text-[12.5px]" style={{ background: '#FDECE8', color: '#D9482F' }}><AlertCircle size={14} className="flex-shrink-0" /> {uploadError}</div>}
            <div className="flex items-center gap-3 text-[12px]" style={{ color: 'var(--text3)' }}><span className="flex-1 h-px" style={{ background: 'var(--line)' }} />or<span className="flex-1 h-px" style={{ background: 'var(--line)' }} /></div>
            <button onClick={() => { setAddMenu(false); setShowAdd(true) }} className="wl-btn justify-center" style={{ height: 42 }}><Pencil size={14} />Type it in</button>
          </div>
        </div>
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
  const [sel, setSel] = useState(() => years.find(y => y.count > 0)?.year ?? years[0]?.year)
  const f = (n: number) => `${cur === 'AED' ? 'AED ' : '₹'}${Math.round(n).toLocaleString('en-IN')}`
  const day = (d: string) => `${Number(d.slice(8, 10))} ${MON[Number(d.slice(5, 7)) - 1]}`
  const TAG = { recorded: { t: 'In your entries', bg: '#E7F6EE', c: '#15803D' }, schedule: { t: 'By the schedule', bg: '#F1F2F6', c: '#5F657A' }, next: { t: 'Next', bg: '#F4F2FF', c: '#4B3BC4' } }
  const tag = (k: keyof typeof TAG) => <span className="text-[10.5px] font-semibold px-1.5 py-[1px] rounded-full whitespace-nowrap" style={{ background: TAG[k].bg, color: TAG[k].c }}>{TAG[k].t}</span>
  if (!years.length) return <p className="text-[12px] px-1" style={{ color: 'var(--text3)' }}>Add the policy’s start date to see each premium.</p>
  const y = years.find(x => x.year === sel) ?? years[0]
  const total = years.reduce((s2, x) => s2 + x.paid, 0), max = Math.max(1, ...years.map(x => x.paid))
  return (
    <div className="flex flex-col gap-2.5">
      {/* A bar per year: what was paid that year; tap one for its premiums */}
      <div role="tablist" aria-label="Year" className="flex gap-1.5 overflow-x-auto no-scrollbar pb-0.5">
        {[...years].reverse().map(x => (
          <button key={x.year} role="tab" aria-selected={x.year === y.year} onClick={() => setSel(x.year)} className="flex flex-col items-center gap-1 rounded-lg px-2 pt-2 pb-1.5 min-w-[54px]"
            style={x.year === y.year ? { background: 'var(--accent-bg)', border: '1px solid var(--accent)' } : { background: '#fff', border: '1px solid var(--line)' }}>
            <span className="w-5 rounded-sm" style={{ height: Math.max(3, x.paid / max * 34), background: x.paid > 0 ? (x.year === y.year ? 'var(--accent)' : '#C9C2F5') : '#E9EBF1' }} />
            <span className="text-[11.5px] font-semibold" style={{ color: 'var(--text)' }}>{x.year}</span>
          </button>
        ))}
      </div>
      <div className="rounded-xl" style={{ background: '#FAFAFE', border: '1px solid var(--line)' }}>
        <div className="flex justify-between px-3 py-2 text-[12.5px]" style={{ borderBottom: '1px solid var(--track)' }}>
          <b style={{ color: 'var(--text)' }}>{y.year}{monthly && y.count ? ` · ${y.count} premium${y.count === 1 ? '' : 's'}` : ''}</b><b className="tabular-nums" style={{ color: 'var(--text)' }}>{f(y.paid)}</b>
        </div>
        {y.rows.map(r => (
          <div key={r.date} className="flex justify-between items-center px-3 py-1.5 text-[12px]" style={{ color: 'var(--text2)' }}>
            <span className="flex items-center gap-2"><span className="w-12 tabular-nums">{day(r.date)}</span>{tag(r.kind)}</span>
            <span className="tabular-nums" style={{ color: r.kind === 'next' ? 'var(--text3)' : 'var(--text)' }}>{f(r.amount)}</span>
          </div>
        ))}
      </div>
      <div className="text-[11.5px] px-1" style={{ color: 'var(--text3)' }}>{f(total)} over {years.filter(x => x.count).length} year{years.filter(x => x.count).length === 1 ? '' : 's'} · tap a year for its premiums</div>
    </div>
  )
}
