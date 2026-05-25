'use client'
import { useState, useCallback } from 'react'
import { useDropzone } from 'react-dropzone'
import { useViewStore } from '@/store/viewStore'
import MetricCard from '@/components/dashboard/MetricCard'
import { Shield, Upload, CheckCircle, AlertCircle, Loader2, X, Clock } from 'lucide-react'

const FX = 22.80
function toINR(amt: number, cur: string) { return cur === 'AED' ? amt * FX : amt }

const TYPE_COLORS: Record<string, { bg: string; text: string }> = {
  term_life: { bg: '#00C9A7', text: '#000' },
  health:    { bg: '#4A90D9', text: '#fff' },
  property:  { bg: '#F4A535', text: '#000' },
  vehicle:   { bg: '#7C5CBF', text: '#fff' },
  travel:    { bg: '#3CC68A', text: '#000' },
  other:     { bg: '#6A7F92', text: '#fff' },
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

  const totalPremium  = filtered.reduce((a, p) => a + conv(Number(p.annual_premium), p.currency), 0)
  const totalAssured  = filtered.reduce((a, p) => a + conv(Number(p.sum_assured ?? 0), p.currency), 0)
  const lifeAssured   = filtered.filter(p => p.policy_type === 'term_life').reduce((a, p) => a + conv(Number(p.sum_assured ?? 0), p.currency), 0)

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
    onDrop, accept: { 'application/pdf': ['.pdf'], 'image/*': ['.jpg','.jpeg','.png'] },
    maxFiles: 1, maxSize: 20 * 1024 * 1024
  })

  return (
    <div className="space-y-5 animate-fade-up">
      <div>
        <h1 className="text-lg font-bold text-white">Insurance Portfolio</h1>
        <p className="text-xs text-slate-500 mt-0.5">Upload policy documents — Gemini AI extracts all details automatically</p>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <MetricCard label="Annual Premiums"   value={`${sym}${Math.round(totalPremium).toLocaleString('en-IN')}`}  accent="gold"   />
        <MetricCard label="Total Sum Assured" value={`${sym}${Math.round(totalAssured/100000).toLocaleString('en-IN')}L`} accent="teal"   />
        <MetricCard label="Life Cover"        value={`${sym}${(lifeAssured/10000000).toFixed(1)}Cr`}               accent="blue"   />
        <MetricCard label="Next Premium Due"
          value={daysToNext !== null ? `${daysToNext}d` : '—'}
          delta={daysToNext !== null && daysToNext <= 30 ? '⚠ Soon' : ''}
          positive={false}
          accent={daysToNext !== null && daysToNext <= 30 ? 'rose' : 'teal'} />
      </div>

      {/* Upload Zone */}
      <div className="bg-[#162032] border border-white/7 rounded-xl p-5">
        <div className="text-[12px] font-bold text-slate-300 mb-3 flex items-center gap-2">
          <Upload size={14} className="text-[#00C9A7]" /> Upload Insurance Document
        </div>
        <div {...getRootProps()} className={`border-2 border-dashed rounded-xl p-8 text-center cursor-pointer transition-all ${isDragActive ? 'border-[#00C9A7] bg-[#00C9A7]/5' : 'border-white/10 hover:border-white/20'}`}>
          <input {...getInputProps()} />
          <Shield size={24} className={`mx-auto mb-2 ${isDragActive ? 'text-[#00C9A7]' : 'text-slate-600'}`} />
          <p className="text-[12px] text-slate-400">{isDragActive ? 'Drop to parse…' : 'Drop your insurance PDF here, or click to browse'}</p>
          <p className="text-[10px] text-slate-600 mt-1">Gemini AI extracts policy number, coverage, expiry, premiums automatically</p>
        </div>

        {uploading && (
          <div className="mt-4 flex items-center gap-3 text-[12px] text-slate-300">
            <Loader2 size={16} className="animate-spin text-[#00C9A7]" />
            Parsing your insurance document with Gemini AI…
          </div>
        )}
        {uploadResult && (
          <div className="mt-4 bg-[#00C9A7]/8 border border-[#00C9A7]/20 rounded-lg p-4 flex items-start gap-3">
            <CheckCircle size={16} className="text-[#00C9A7] flex-shrink-0 mt-0.5" />
            <div>
              <div className="text-[12px] font-bold text-white">Policy added: {uploadResult.policy_name}</div>
              <div className="text-[11px] text-slate-400 mt-1">Provider: {uploadResult.provider} · Expires: {uploadResult.expiry_date}</div>
            </div>
            <button onClick={() => setUploadResult(null)} className="ml-auto text-slate-500 hover:text-white"><X size={14} /></button>
          </div>
        )}
        {uploadError && (
          <div className="mt-4 bg-rose-500/8 border border-rose-500/20 rounded-lg p-3 flex items-center gap-2 text-rose-400 text-[12px]">
            <AlertCircle size={14} /> {uploadError}
          </div>
        )}
      </div>

      {/* Policy List */}
      {filtered.length === 0 ? (
        <div className="bg-[#162032] border border-white/7 border-dashed rounded-xl py-16 text-center">
          <Shield size={32} className="mx-auto text-slate-700 mb-3" />
          <div className="text-slate-500 text-sm">No policies yet. Upload your first insurance document above.</div>
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.map((p: any, i: number) => {
            const lSym = p.currency === 'AED' ? 'AED ' : '₹'
            const daysToExpiry = Math.ceil((new Date(p.expiry_date).getTime() - today.getTime()) / 86400000)
            const daysToPremium = p.next_premium_date ? Math.ceil((new Date(p.next_premium_date).getTime() - today.getTime()) / 86400000) : null
            const tc = TYPE_COLORS[p.policy_type] ?? TYPE_COLORS.other
            const isExpiringSoon = daysToExpiry <= 60
            const isPremiumSoon  = daysToPremium !== null && daysToPremium <= 30

            return (
              <div key={i} className={`bg-[#162032] border rounded-xl p-5 transition-all ${isExpiringSoon ? 'border-rose-500/25' : 'border-white/7'}`}>
                <div className="flex items-start justify-between flex-wrap gap-3">
                  <div className="flex items-start gap-3">
                    <div className="w-9 h-9 rounded-lg flex items-center justify-center text-[11px] font-bold flex-shrink-0"
                      style={{ background: tc.bg + '22', color: tc.bg }}>
                      {TYPE_LABELS[p.policy_type]?.slice(0,2).toUpperCase()}
                    </div>
                    <div>
                      <div className="text-[14px] font-bold text-white">{p.policy_name}</div>
                      <div className="text-[11px] text-slate-500">{p.provider}</div>
                      {p.policy_number && <div className="text-[10px] text-slate-600 font-mono mt-0.5">#{p.policy_number}</div>}
                    </div>
                  </div>

                  <div className="flex gap-2">
                    <span className="px-2 py-1 rounded-lg text-[10px] font-bold" style={{ background: tc.bg + '22', color: tc.bg }}>
                      {TYPE_LABELS[p.policy_type]}
                    </span>
                    {isExpiringSoon && <span className="px-2 py-1 rounded-lg text-[10px] font-bold bg-rose-500/15 text-rose-400">⚠ Expires in {daysToExpiry}d</span>}
                  </div>
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-4">
                  <div className="bg-[#1E2D40] rounded-lg p-3">
                    <div className="text-[9px] text-slate-500 uppercase tracking-wider mb-1">Sum Assured</div>
                    <div className="text-[13px] font-bold font-mono text-[#00C9A7]">{lSym}{(Number(p.sum_assured ?? 0)/100000).toFixed(0)}L</div>
                  </div>
                  <div className="bg-[#1E2D40] rounded-lg p-3">
                    <div className="text-[9px] text-slate-500 uppercase tracking-wider mb-1">Annual Premium</div>
                    <div className="text-[13px] font-bold font-mono text-white">{lSym}{Number(p.annual_premium).toLocaleString('en-IN')}</div>
                  </div>
                  <div className="bg-[#1E2D40] rounded-lg p-3">
                    <div className="text-[9px] text-slate-500 uppercase tracking-wider mb-1">Expiry Date</div>
                    <div className={`text-[13px] font-bold ${isExpiringSoon ? 'text-rose-400' : 'text-white'}`}>{p.expiry_date}</div>
                  </div>
                  <div className={`rounded-lg p-3 ${isPremiumSoon ? 'bg-[#F4A535]/10 border border-[#F4A535]/20' : 'bg-[#1E2D40]'}`}>
                    <div className="text-[9px] text-slate-500 uppercase tracking-wider mb-1">Next Premium</div>
                    <div className={`text-[13px] font-bold ${isPremiumSoon ? 'text-[#F4A535]' : 'text-white'}`}>
                      {p.next_premium_date ?? '—'}
                      {daysToPremium !== null && <span className="text-[10px] ml-1 opacity-70">({daysToPremium}d)</span>}
                    </div>
                  </div>
                </div>

                {p.insured_members?.length > 0 && (
                  <div className="mt-3 flex flex-wrap gap-1.5">
                    {p.insured_members.map((m: string, j: number) => (
                      <span key={j} className="bg-white/6 text-slate-400 text-[10px] px-2 py-0.5 rounded-full">{m}</span>
                    ))}
                  </div>
                )}

                {p.key_benefits?.length > 0 && (
                  <div className="mt-2 text-[10px] text-slate-500">
                    <strong className="text-slate-400">Benefits: </strong>
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
