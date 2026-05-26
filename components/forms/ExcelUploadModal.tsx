'use client'
import { useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { X, FileSpreadsheet, Loader2, CheckCircle2, AlertCircle, Download } from 'lucide-react'
import { useDropzone } from 'react-dropzone'

type InvType = 'mutual_fund' | 'stock' | 'fixed_deposit' | 'recurring_deposit' | 'nps' | 'lic' | 'gold' | 'bond' | 'etf'

const TEMPLATES: Record<InvType, string[]> = {
  mutual_fund:        ['fund_name','fund_type','units','avg_nav','invested_amount','currency'],
  stock:              ['name','symbol','exchange','quantity','avg_buy_price','sector','currency'],
  fixed_deposit:      ['name','bank_name','principal','interest_rate','start_date','maturity_date','currency'],
  recurring_deposit:  ['name','bank_name','monthly_amount','interest_rate','tenure_months','start_date','maturity_date','currency'],
  nps:                ['name','pran_number','tier','corpus_amount','invested_amount','equity_allocation','fund_manager'],
  lic:                ['name','policy_number','plan_name','sum_assured','annual_premium','premium_frequency','policy_term_years','start_date','maturity_date','total_paid'],
  gold:               ['name','gold_type','quantity_grams','buy_price_per_gram','invested_amount','purchase_date','currency'],
  bond:               ['name','bond_type','face_value','quantity','coupon_rate','invested_amount','purchase_date','maturity_date','currency'],
  etf:                ['etf_name','symbol','exchange','units','avg_buy_price','etf_type','invested_amount','purchase_date','currency'],
}

interface Props { onClose: () => void; investmentType: InvType }

export function ExcelUploadModal({ onClose, investmentType }: Props) {
  const [file, setFile]         = useState<File | null>(null)
  const [status, setStatus]     = useState<'idle' | 'parsing' | 'review' | 'saving' | 'done' | 'error'>('idle')
  const [parsed, setParsed]     = useState<any[]>([])
  const [errorMsg, setErrorMsg] = useState('')
  const router = useRouter()
  const supabase = createClient()

  const onDrop = useCallback((accepted: File[]) => { if (accepted[0]) setFile(accepted[0]) }, [])
  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: { 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': ['.xlsx'], 'text/csv': ['.csv'] },
    maxFiles: 1,
  })

  function downloadTemplate() {
    const headers = TEMPLATES[investmentType].join(',')
    const sampleRow = TEMPLATES[investmentType].map(h => {
      if (h.includes('date')) return '2024-01-01'
      if (h.includes('amount') || h.includes('principal') || h.includes('assured') || h.includes('premium') || h.includes('corpus')) return '100000'
      if (h.includes('rate') || h.includes('allocation')) return '7.5'
      if (h.includes('units') || h.includes('quantity') || h.includes('months') || h.includes('years')) return '10'
      if (h === 'currency') return 'INR'
      if (h === 'tier') return 'Tier I'
      if (h === 'fund_type') return 'equity'
      if (h === 'exchange') return 'NSE'
      if (h === 'premium_frequency') return 'Annually'
      return 'Sample'
    }).join(',')
    const blob = new Blob([headers + '\n' + sampleRow], { type: 'text/csv' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a'); a.href = url; a.download = `${investmentType}_template.csv`; a.click()
    URL.revokeObjectURL(url)
  }

  async function upload() {
    if (!file) return
    setStatus('parsing')
    try {
      const formData = new FormData()
      formData.append('file', file)
      formData.append('investmentType', investmentType)
      const res = await fetch('/api/parse-investment-excel', { method: 'POST', body: formData })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Parsing failed')
      setParsed(data.rows ?? [])
      setStatus('review')
    } catch (e: any) {
      setErrorMsg(e.message)
      setStatus('error')
    }
  }

  async function saveAll() {
    setStatus('saving')
    const { data: { user } } = await supabase.auth.getUser()
    const table = investmentType === 'stock' ? 'stocks' : investmentType === 'mutual_fund' ? 'mutual_funds'
      : investmentType === 'fixed_deposit' ? 'fixed_deposits' : investmentType === 'recurring_deposit' ? 'recurring_deposits'
      : investmentType === 'nps' ? 'nps_accounts' : 'lic_policies'
    await supabase.from(table).insert(parsed.map(p => ({ ...p, user_id: user!.id })))
    setStatus('done')
    router.refresh()
    setTimeout(onClose, 1500)
  }

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
      <div className="wl-card p-6 w-full max-w-lg max-h-[90vh] overflow-y-auto">
        <div className="flex justify-between items-center mb-5">
          <h2 className="text-[15px] font-bold" style={{ color:'var(--text)' }}>Upload Excel / CSV</h2>
          <button onClick={onClose} style={{ color:'var(--text3)' }}><X size={18} /></button>
        </div>

        {status === 'idle' && (
          <>
            <button onClick={downloadTemplate} className="flex items-center gap-2 text-[11px] font-semibold mb-4 px-3 py-2 rounded-lg border w-full justify-center"
              style={{ borderColor:'var(--border)', color:'var(--sage)', background:'var(--sage-bg)' }}>
              <Download size={13} /> Download Template CSV
            </button>

            <div {...getRootProps()} className="border-2 border-dashed rounded-xl p-8 text-center cursor-pointer transition-all"
              style={{ borderColor: isDragActive?'var(--sage)':'var(--border)', background: isDragActive?'var(--sage-bg)':'var(--bg2)' }}>
              <input {...getInputProps()} />
              <FileSpreadsheet size={28} className="mx-auto mb-2" style={{ color:'var(--text3)' }} />
              <div className="text-[13px] font-semibold" style={{ color:'var(--text)' }}>
                {isDragActive ? 'Drop your file here' : 'Drag & drop or click to select'}
              </div>
              <div className="text-[11px] mt-1" style={{ color:'var(--text3)' }}>.xlsx or .csv files</div>
            </div>

            {file && (
              <div className="flex items-center gap-2 mt-3 p-3 rounded-lg" style={{ background:'var(--bg2)' }}>
                <FileSpreadsheet size={16} style={{ color:'var(--sage)' }} />
                <span className="text-[12px] flex-1 font-medium" style={{ color:'var(--text)' }}>{file.name}</span>
                <button onClick={()=>setFile(null)} style={{ color:'var(--text3)' }}><X size={14}/></button>
              </div>
            )}

            <div className="flex gap-3 mt-4">
              <button onClick={onClose} className="flex-1 py-2.5 rounded-lg border text-[12px] font-semibold" style={{ borderColor:'var(--border)', color:'var(--text3)' }}>Cancel</button>
              <button onClick={upload} disabled={!file} className="flex-1 py-2.5 rounded-lg text-white text-[12px] font-bold disabled:opacity-40"
                style={{ background:'var(--sage)' }}>Upload & Import</button>
            </div>
          </>
        )}

        {status === 'parsing' && (
          <div className="flex flex-col items-center py-12 gap-3">
            <Loader2 size={32} className="animate-spin" style={{ color:'var(--sage)' }} />
            <div className="text-[13px]" style={{ color:'var(--text)' }}>Reading your file…</div>
          </div>
        )}

        {status === 'review' && (
          <>
            <div className="text-[12px] font-semibold mb-3" style={{ color:'var(--text2)' }}>
              {parsed.length} rows found. Review before importing:
            </div>
            <div className="overflow-x-auto rounded-lg border mb-4" style={{ borderColor:'var(--border)' }}>
              <table className="w-full text-[10px]">
                <thead>
                  <tr style={{ background:'var(--bg2)' }}>
                    {Object.keys(parsed[0] ?? {}).map(h => (
                      <th key={h} className="px-3 py-2 text-left font-bold uppercase tracking-wider" style={{ color:'var(--text3)' }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {parsed.slice(0,5).map((row, i) => (
                    <tr key={i} style={{ borderTop:'1px solid var(--border)' }}>
                      {Object.values(row).map((v:any, j) => (
                        <td key={j} className="px-3 py-2" style={{ color:'var(--text2)' }}>{String(v)}</td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
              {parsed.length > 5 && <div className="text-center py-2 text-[10px]" style={{ color:'var(--text3)' }}>…and {parsed.length-5} more rows</div>}
            </div>
            <div className="flex gap-3">
              <button onClick={()=>setStatus('idle')} className="flex-1 py-2.5 rounded-lg border text-[12px] font-semibold" style={{ borderColor:'var(--border)', color:'var(--text3)' }}>Re-upload</button>
              <button onClick={saveAll} className="flex-1 py-2.5 rounded-lg text-white text-[12px] font-bold" style={{ background:'var(--sage)' }}>Import All</button>
            </div>
          </>
        )}

        {status === 'saving' && (
          <div className="flex flex-col items-center py-12 gap-3">
            <Loader2 size={32} className="animate-spin" style={{ color:'var(--sage)' }} />
            <div className="text-[13px]" style={{ color:'var(--text)' }}>Saving…</div>
          </div>
        )}

        {status === 'done' && (
          <div className="flex flex-col items-center py-12 gap-3">
            <CheckCircle2 size={36} style={{ color:'var(--income)' }} />
            <div className="text-[14px] font-bold" style={{ color:'var(--text)' }}>Imported successfully!</div>
          </div>
        )}

        {status === 'error' && (
          <div className="flex flex-col items-center py-10 gap-3">
            <AlertCircle size={32} style={{ color:'var(--rose)' }} />
            <div className="text-[13px]" style={{ color:'var(--text)' }}>{errorMsg}</div>
            <button onClick={()=>setStatus('idle')} className="px-4 py-2 rounded-lg text-white text-[12px]" style={{ background:'var(--sage)' }}>Retry</button>
          </div>
        )}
      </div>
    </div>
  )
}
