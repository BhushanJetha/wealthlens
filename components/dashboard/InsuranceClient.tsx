'use client'
import { useState, useCallback } from 'react'
import { useDropzone } from 'react-dropzone'
import { useViewStore } from '@/store/viewStore'
import MetricCard from '@/components/dashboard/MetricCard'
import { Shield, Upload, CheckCircle, AlertCircle, Loader2, X } from 'lucide-react'

const FX = 22.80
function toINR(amt: number, cur: string) { return cur === 'AED' ? amt * FX : amt }

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
  const { view } = useViewStore()
  const [uploading, setUploading] = useState(false)
  const [uploadResult, setUploadResult] = useState<any>(null)
  const [uploadError, setUploadError] = useState('')
  const [localPolicies, setLocalPolicies] = useState(policies)

  const filtered = view === 'uae' ? localPolicies.filter(p => p.currency === 'AED')
    : view === 'india' ? localPolicies.filter(p => p.currency === 'INR') : localPolicies

  const sym = view === 'uae' ? 'AED ' : '₹'
  const conv = (amt: number, cur: string) => view === 'consolidated' ? toINR(amt, cur) : amt

  const totalPremium = filtered.reduce((a, p) => a + conv(Number(p.annual_premium), p.currency), 0)
  const totalAssured = filtered.reduce((a, p) => a + conv(Number(p.sum_assured ?? 0), p.currency), 0)
  const lifeAssured  = filtered.filter(p => p.policy_type === 'term_life').reduce((a, p) => a + conv(Number(p.sum_assured ?? 0), p.currency), 0)

  const today = new Date()
  const nextDue = filtered
    .filter(p => p.next_premium_date)
    .sort((a, b) => new Date(a.next_premium_date).getTime() - new Date(b.next_premium_date).getTime())[0]
  const daysToNext = nextDue ? Math.ceil((new Date(nextDue.next_premium_date).getTime() - today.getTime()) / 86400000) : null

  const onDrop = useCallback(async (files: File[]) => {
    if (!files[0]) return
    setUploading(true); setUploadError(''); setUploadResult(null)
    const fd = new FormData()
    fd.append('file', files[0])
    try {
      const res = await fetch('/api/parse-insurance', { method: 'POST', body: fd })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Failed')
      setUploadResult(data.policy)
      if (data.policy) setLocalPolicies(prev => [data.policy, ...prev])
    } catch (e: any) { setUploadError(e.message) }
    setUploading(false)
  }, [])

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop, accept: { 'application/pdf': ['.pdf'], 'image/*': ['.jpg', '.jpeg', '.png'] },
    maxFiles: 1, maxSize: 20 * 1024 * 1024,
  })

  return (
    <div className="space-y-5 animate-fade-up">
      <div>
        <h1 className="text-xl font-bold" style={{ color: 'var(--text)' }}>Insurance Portfolio</h1>
        <p className="text-[12px] mt-0.5" style={{ color: 'var(--text3)' }}>Upload policy documents — AI extracts all details automatically</p>
      </div>

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

      {/* Upload Zone */}
      <div className="wl-card p-5">
        <div className="text-[12px] font-bold mb-3 flex items-center gap-2" style={{ color: 'var(--text2)' }}>
          <Upload size={14} style={{ color: 'var(--sage)' }} /> Upload Insurance Document
        </div>
        <div {...getRootProps()} className="border-2 border-dashed rounded-xl p-8 text-center cursor-pointer transition-all"
          style={isDragActive
            ? { borderColor: 'var(--sage)', background: 'var(--sage-bg)' }
            : { borderColor: 'var(--border2)', background: 'var(--bg2)' }}>
          <input {...getInputProps()} />
          <Shield size={24} className="mx-auto mb-2" style={{ color: isDragActive ? 'var(--sage)' : 'var(--border2)' }} />
          <p className="text-[12px]" style={{ color: 'var(--text3)' }}>
            {isDragActive ? 'Drop to parse…' : 'Drop your insurance PDF here, or click to browse'}
          </p>
          <p className="text-[10px] mt-1" style={{ color: 'var(--text3)' }}>
            AI extracts policy number, coverage, expiry, premiums automatically
          </p>
        </div>

        {uploading && (
          <div className="mt-4 flex items-center gap-3 text-[12px]" style={{ color: 'var(--text2)' }}>
            <Loader2 size={16} className="animate-spin" style={{ color: 'var(--sage)' }} />
            Parsing your insurance document with AI…
          </div>
        )}
        {uploadResult && (
          <div className="mt-4 rounded-lg p-4 flex items-start gap-3"
            style={{ background: 'var(--income-bg)', border: '1px solid var(--income)' }}>
            <CheckCircle size={16} className="flex-shrink-0 mt-0.5" style={{ color: 'var(--income)' }} />
            <div>
              <div className="text-[12px] font-bold" style={{ color: 'var(--text)' }}>Policy added: {uploadResult.policy_name}</div>
              <div className="text-[11px] mt-1" style={{ color: 'var(--text3)' }}>Provider: {uploadResult.provider} · Expires: {uploadResult.expiry_date}</div>
            </div>
            <button onClick={() => setUploadResult(null)} className="ml-auto" style={{ color: 'var(--text3)' }}><X size={14} /></button>
          </div>
        )}
        {uploadError && (
          <div className="mt-4 rounded-lg p-3 flex items-center gap-2 text-[12px]"
            style={{ background: 'var(--rose-bg)', border: '1px solid var(--rose)', color: 'var(--rose)' }}>
            <AlertCircle size={14} /> {uploadError}
          </div>
        )}
      </div>

      {/* Policy List */}
      {filtered.length === 0 ? (
        <div className="wl-card py-16 text-center" style={{ borderStyle: 'dashed' }}>
          <Shield size={32} className="mx-auto mb-3" style={{ color: 'var(--border2)' }} />
          <div className="text-[13px]" style={{ color: 'var(--text3)' }}>No policies yet. Upload your first insurance document above.</div>
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.map((p: any, i: number) => {
            const lSym = p.currency === 'AED' ? 'AED ' : '₹'
            const daysToExpiry = Math.ceil((new Date(p.expiry_date).getTime() - today.getTime()) / 86400000)
            const daysToPremium = p.next_premium_date ? Math.ceil((new Date(p.next_premium_date).getTime() - today.getTime()) / 86400000) : null
            const typeColor = TYPE_COLORS[p.policy_type] ?? 'var(--text3)'
            const isExpiringSoon = daysToExpiry <= 60
            const isPremiumSoon  = daysToPremium !== null && daysToPremium <= 30

            return (
              <div key={i} className="wl-card p-5"
                style={{ borderColor: isExpiringSoon ? 'var(--rose)' : 'var(--border)' }}>
                <div className="flex items-start justify-between flex-wrap gap-3">
                  <div className="flex items-start gap-3">
                    <div className="w-9 h-9 rounded-lg flex items-center justify-center text-[11px] font-bold flex-shrink-0"
                      style={{ background: typeColor + '18', color: typeColor }}>
                      {TYPE_LABELS[p.policy_type]?.slice(0, 2).toUpperCase()}
                    </div>
                    <div>
                      <div className="text-[14px] font-bold" style={{ color: 'var(--text)' }}>{p.policy_name}</div>
                      <div className="text-[11px]" style={{ color: 'var(--text3)' }}>{p.provider}</div>
                      {p.policy_number && <div className="text-[10px] font-mono mt-0.5" style={{ color: 'var(--text3)' }}>#{p.policy_number}</div>}
                    </div>
                  </div>

                  <div className="flex gap-2">
                    <span className="px-2 py-1 rounded-lg text-[10px] font-bold"
                      style={{ background: typeColor + '18', color: typeColor }}>
                      {TYPE_LABELS[p.policy_type]}
                    </span>
                    {isExpiringSoon && (
                      <span className="px-2 py-1 rounded-lg text-[10px] font-bold"
                        style={{ background: 'var(--rose-bg)', color: 'var(--rose)' }}>
                        ⚠ Expires in {daysToExpiry}d
                      </span>
                    )}
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
    </div>
  )
}
