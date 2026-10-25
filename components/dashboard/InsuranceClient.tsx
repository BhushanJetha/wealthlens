'use client'
import { useState, useCallback, useEffect } from 'react'
import { useDropzone } from 'react-dropzone'
import { useViewStore } from '@/store/viewStore'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import MetricCard from '@/components/dashboard/MetricCard'
import AddInsuranceModal from '@/components/forms/AddInsuranceModal'
import { Shield, Upload, AlertCircle, Loader2, Plus, Pencil, Trash2 } from 'lucide-react'
import { PageHeader, InsightBar, AiActions, LearnStrip } from '@/components/ui/kit'

function toINR(amt: number, cur: string, fx: number) { return cur === 'AED' ? amt * fx : amt }

const TYPE_COLORS: Record<string, string> = {
  term_life: 'var(--sage)',
  health:    'var(--blue)',
  property:  'var(--gold)',
  vehicle:   'var(--purple)',
  travel:    'var(--income)',
  other:     'var(--text3)',
}

const TYPE_LABELS: Record<string, string> = {
  term_life: 'Term Life', health: 'Health', property: 'Property',
  vehicle: 'Vehicle', travel: 'Travel', other: 'Other',
}

export default function InsuranceClient({ policies }: { policies: any[] }) {
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
  const totalAssured = filtered.reduce((a, p) => a + conv(Number(p.sum_assured ?? 0), p.currency), 0)
  const lifeAssured  = filtered.filter(p => p.policy_type === 'term_life').reduce((a, p) => a + conv(Number(p.sum_assured ?? 0), p.currency), 0)

  const today = new Date()
  const nextDue = filtered
    .filter(p => p.next_premium_date)
    .sort((a, b) => new Date(a.next_premium_date).getTime() - new Date(b.next_premium_date).getTime())[0]
  const daysToNext = nextDue ? Math.ceil((new Date(nextDue.next_premium_date).getTime() - today.getTime()) / 86400000) : null

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
    <div className="space-y-5 animate-fade-up">
      <PageHeader title="Insurance" sub="Upload policy documents or add them by hand"
        onAdd={() => setShowAdd(true)} addLabel="Add policy"
        actions={<button onClick={() => setShowAdd(true)} className="wl-btn wl-btn-primary" style={{ height: 34 }}><Plus size={14} />Add policy</button>} />
      {filtered.length > 0 && <InsightBar
        text={`You pay ${sym}${Math.round(totalPremium).toLocaleString('en-IN')} a year for ${sym}${(totalAssured / 100000).toFixed(1)}L of cover, including ${sym}${(lifeAssured / 10000000).toFixed(2)}Cr of term life.${daysToNext !== null ? ` Next premium is due in ${daysToNext} day${daysToNext === 1 ? '' : 's'}.` : ''} A common guide is term cover of about 10× your yearly income.`}
        prompt={`Explain my insurance page. Annual premiums ${sym}${Math.round(totalPremium)}, total cover ${sym}${Math.round(totalAssured)}, term life ${sym}${Math.round(lifeAssured)}. Policies: ${filtered.map((p: any) => `${p.policy_name} (${p.policy_type}) cover ${p.currency} ${p.sum_assured}, premium ${p.annual_premium}${p.expiry_date ? `, renews ${p.expiry_date}` : ''}`).join('; ')}.`} />}
      {filtered.length > 0 && <AiActions actions={['Check my cover gap']}
        context={`Policies: ${filtered.map((p: any) => `${p.policy_name} (${p.policy_type}) cover ${p.currency} ${p.sum_assured}`).join('; ')}.`} />}

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <MetricCard label="Annual Premiums"   value={`${sym}${Math.round(totalPremium).toLocaleString('en-IN')}`} accent="gold" />
        <MetricCard label="Total Sum Assured" value={`${sym}${Math.round(totalAssured / 100000).toLocaleString('en-IN')}L`} accent="teal" />
        <MetricCard label="Life Cover"        value={`${sym}${(lifeAssured / 10000000).toFixed(1)}Cr`} accent="blue" />
        <MetricCard label="Next Premium Due"
          value={daysToNext !== null ? `${daysToNext}d` : '—'}
          delta={daysToNext !== null && daysToNext <= 30 ? '⚠ Soon' : ''}
          positive={false}
          accent={daysToNext !== null && daysToNext <= 30 ? 'rose' : 'teal'} />
      </div>

      {/* Upload zone: local reader fills the Add-policy form */}
      <section className="wl-card px-4 md:px-5 py-3.5 md:py-[18px]">
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

      {/* Policy List */}
      {filtered.length === 0 ? (
        <div className="wl-card py-16 text-center" style={{ borderStyle: 'dashed' }}>
          <Shield size={32} className="mx-auto mb-3" style={{ color: 'var(--border2)' }} />
          <div className="text-[13px] mb-4" style={{ color: 'var(--text3)' }}>No policies yet. Upload a document or add manually.</div>
          <button onClick={() => setShowAdd(true)}
            className="px-4 py-2 rounded-lg text-white text-[12px] font-bold"
            style={{ background: 'var(--sage)' }}>
            Add Policy
          </button>
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.map((p: any, i: number) => {
            const lSym          = p.currency === 'AED' ? 'AED ' : '₹'
            const daysToExpiry  = Math.ceil((new Date(p.expiry_date).getTime() - today.getTime()) / 86400000)
            const daysToPremium = p.next_premium_date ? Math.ceil((new Date(p.next_premium_date).getTime() - today.getTime()) / 86400000) : null
            const typeColor     = TYPE_COLORS[p.policy_type] ?? 'var(--text3)'
            const isExpiringSoon = daysToExpiry <= 60
            const isPremiumSoon  = daysToPremium !== null && daysToPremium <= 30

            return (
              <div key={p.id ?? i} className="wl-card p-5"
                style={{ borderColor: isExpiringSoon ? 'var(--rose)' : 'var(--border)' }}>
                <div className="flex items-start justify-between flex-wrap gap-3">
                  <div className="flex items-start gap-3 flex-1 min-w-0">
                    <div className="w-9 h-9 rounded-lg flex items-center justify-center text-[11px] font-bold flex-shrink-0"
                      style={{ background: typeColor + '18', color: typeColor }}>
                      {TYPE_LABELS[p.policy_type]?.slice(0, 2).toUpperCase()}
                    </div>
                    <div className="min-w-0">
                      <div className="text-[14px] font-bold truncate" style={{ color: 'var(--text)' }}>{p.policy_name}</div>
                      <div className="text-[11px]" style={{ color: 'var(--text3)' }}>{p.provider}</div>
                      {p.policy_number && <div className="text-[10px] font-mono mt-0.5" style={{ color: 'var(--text3)' }}>#{p.policy_number}</div>}
                    </div>
                  </div>

                  <div className="flex items-center gap-2 flex-shrink-0">
                    <span className="px-2 py-1 rounded-lg text-[10px] font-bold"
                      style={{ background: typeColor + '18', color: typeColor }}>
                      {TYPE_LABELS[p.policy_type]}
                    </span>
                    {isExpiringSoon && (
                      <span className="px-2 py-1 rounded-lg text-[10px] font-bold"
                        style={{ background: 'var(--rose-bg)', color: 'var(--rose)' }}>
                        ⚠ {daysToExpiry}d left
                      </span>
                    )}
                    <button onClick={() => setEditPolicy(p)}
                      className="w-7 h-7 rounded-lg flex items-center justify-center transition-all"
                      style={{ background: 'var(--blue-bg)', color: 'var(--blue)' }}
                      title="Edit policy">
                      <Pencil size={12} />
                    </button>
                    <button onClick={() => setDeleteId(p.id)}
                      className="w-7 h-7 rounded-lg flex items-center justify-center transition-all"
                      style={{ background: 'var(--rose-bg)', color: 'var(--rose)' }}
                      title="Delete policy">
                      <Trash2 size={12} />
                    </button>
                  </div>
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-4">
                  {[
                    { label: 'Sum Assured',    val: `${lSym}${(Number(p.sum_assured ?? 0) / 100000).toFixed(0)}L`, color: 'var(--sage)' },
                    { label: 'Annual Premium', val: `${lSym}${Number(p.annual_premium).toLocaleString('en-IN')}`,   color: 'var(--text)' },
                    { label: 'Expiry Date',    val: p.expiry_date,                                                   color: isExpiringSoon ? 'var(--rose)' : 'var(--text)' },
                    { label: 'Next Premium',   val: p.next_premium_date ?? '—',                                      color: isPremiumSoon ? 'var(--gold)' : 'var(--text)', extra: daysToPremium },
                  ].map(item => (
                    <div key={item.label} className="rounded-lg p-3"
                      style={{ background: 'var(--bg2)', border: '1px solid var(--border)' }}>
                      <div className="text-[9px] uppercase tracking-wider mb-1" style={{ color: 'var(--text3)' }}>{item.label}</div>
                      <div className="text-[13px] font-bold" style={{ color: item.color }}>
                        {item.val}
                        {'extra' in item && item.extra !== null && item.extra !== undefined &&
                          <span className="text-[10px] ml-1" style={{ color: 'var(--text3)' }}>({item.extra}d)</span>}
                      </div>
                    </div>
                  ))}
                </div>

                {p.insured_members?.length > 0 && (
                  <div className="mt-3 flex flex-wrap gap-1.5">
                    {p.insured_members.map((m: string, j: number) => (
                      <span key={j} className="text-[10px] px-2 py-0.5 rounded-full"
                        style={{ background: 'var(--bg2)', color: 'var(--text3)', border: '1px solid var(--border)' }}>
                        {m}
                      </span>
                    ))}
                  </div>
                )}

                {p.key_benefits?.length > 0 && (
                  <div className="mt-2 text-[10px]" style={{ color: 'var(--text3)' }}>
                    <strong style={{ color: 'var(--text2)' }}>Benefits: </strong>
                    {p.key_benefits.slice(0, 3).join(' · ')}
                    {p.key_benefits.length > 3 && ` +${p.key_benefits.length - 3} more`}
                  </div>
                )}
              </div>
            )
          })}
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
      <LearnStrip title="Term insurance: how much is enough" href="/dashboard/learn" />
    </div>
  )
}
