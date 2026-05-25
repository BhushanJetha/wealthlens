'use client'
import { useState, useCallback } from 'react'
import { useDropzone } from 'react-dropzone'
import { Upload, FileText, CheckCircle, AlertCircle, Loader2, X, Shield } from 'lucide-react'

type FileType = 'bank_statement' | 'credit_card_statement' | 'insurance_document'
type Status = 'idle' | 'uploading' | 'success' | 'error'

interface UploadResult {
  file: string
  bank?: string
  txns?: number
  period?: string
  policy?: string
  error?: string
}

export default function IngestPage() {
  const [fileType, setFileType] = useState<FileType>('bank_statement')
  const [bankHint, setBankHint] = useState('')
  const [status, setStatus] = useState<Status>('idle')
  const [result, setResult] = useState<UploadResult | null>(null)
  const [preview, setPreview] = useState<any[]>([])

  const onDrop = useCallback(async (accepted: File[]) => {
    if (!accepted.length) return
    const file = accepted[0]
    setStatus('uploading')
    setResult(null)
    setPreview([])

    const fd = new FormData()
    fd.append('file', file)
    fd.append('fileType', fileType)
    if (bankHint) fd.append('bankHint', bankHint)

    const endpoint = fileType === 'insurance_document' ? '/api/parse-insurance' : '/api/parse-statement'

    try {
      const res = await fetch(endpoint, { method: 'POST', body: fd })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Parse failed')

      setStatus('success')
      if (fileType === 'insurance_document') {
        setResult({ file: file.name, policy: data.policy?.policy_name })
      } else {
        setResult({ file: file.name, bank: data.bank_name, txns: data.transactions_count, period: `${data.period?.from} → ${data.period?.to}` })
        setPreview(data.transactions ?? [])
      }
    } catch (err: any) {
      setStatus('error')
      setResult({ file: file.name, error: err.message })
    }
  }, [fileType, bankHint])

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop, accept: { 'application/pdf': ['.pdf'], 'text/csv': ['.csv'], 'image/*': ['.jpg','.jpeg','.png'] },
    maxFiles: 1, maxSize: 20 * 1024 * 1024
  })

  const BANKS = ['HDFC Bank','SBI','ICICI Bank','Axis Bank','Emirates NBD','ADCB','FAB','Mashreq','Standard Chartered','Kotak','Other']

  return (
    <div className="max-w-3xl mx-auto space-y-5 animate-fade-up">
      <div>
        <h1 className="text-lg font-bold text-white">Upload Statements</h1>
        <p className="text-xs text-slate-500 mt-0.5">Gemini AI auto-extracts transactions from PDF statements and insurance documents</p>
      </div>

      <div className="flex items-center gap-2 bg-[#00C9A7]/6 border border-[#00C9A7]/18 rounded-xl px-4 py-3">
        <Shield size={14} className="text-[#00C9A7] flex-shrink-0" />
        <p className="text-[12px] text-slate-300">Files are encrypted at rest in Supabase Storage. Only you can access them. AI parsing happens server-side and raw file content is never stored in logs.</p>
      </div>

      {/* Options */}
      <div className="bg-[#162032] border border-white/7 rounded-xl p-5 space-y-4">
        <div>
          <label className="block text-[11px] font-bold text-slate-400 uppercase tracking-wider mb-2">Document Type</label>
          <div className="flex gap-2 flex-wrap">
            {([
              ['bank_statement', '🏦 Bank Statement'],
              ['credit_card_statement', '💳 Credit Card Statement'],
              ['insurance_document', '🛡️ Insurance Document'],
            ] as [FileType, string][]).map(([val, label]) => (
              <button key={val} onClick={() => setFileType(val)}
                className={`px-3 py-2 rounded-lg text-[12px] font-semibold border transition-all ${fileType === val ? 'bg-[#00C9A7] border-[#00C9A7] text-black' : 'bg-[#1E2D40] border-white/10 text-slate-400 hover:text-white'}`}>
                {label}
              </button>
            ))}
          </div>
        </div>

        {fileType !== 'insurance_document' && (
          <div>
            <label className="block text-[11px] font-bold text-slate-400 uppercase tracking-wider mb-2">Bank (optional — helps AI accuracy)</label>
            <select value={bankHint} onChange={e => setBankHint(e.target.value)}
              className="bg-[#1E2D40] border border-white/10 rounded-lg px-3 py-2 text-[13px] text-white focus:outline-none focus:border-[#00C9A7] transition-colors">
              <option value="">Select bank…</option>
              {BANKS.map(b => <option key={b} value={b}>{b}</option>)}
            </select>
          </div>
        )}
      </div>

      {/* Drop zone */}
      <div {...getRootProps()} className={`border-2 border-dashed rounded-xl p-10 text-center cursor-pointer transition-all ${isDragActive ? 'border-[#00C9A7] bg-[#00C9A7]/5' : 'border-white/10 hover:border-white/20 bg-[#162032]'}`}>
        <input {...getInputProps()} />
        <Upload size={28} className={`mx-auto mb-3 ${isDragActive ? 'text-[#00C9A7]' : 'text-slate-600'}`} />
        <p className="text-[13px] font-semibold text-slate-300 mb-1">
          {isDragActive ? 'Drop to upload…' : 'Drag & drop or click to select'}
        </p>
        <p className="text-[11px] text-slate-600">PDF, CSV, JPG, PNG · Max 20MB</p>
      </div>

      {/* Status */}
      {status === 'uploading' && (
        <div className="bg-[#162032] border border-white/7 rounded-xl p-5 flex items-center gap-4">
          <Loader2 size={22} className="animate-spin text-[#00C9A7]" />
          <div>
            <div className="text-[13px] font-semibold text-white">Parsing with Gemini AI…</div>
            <div className="text-[11px] text-slate-500">Extracting transactions from your statement</div>
          </div>
        </div>
      )}

      {status === 'success' && result && (
        <div className="bg-[#00C9A7]/8 border border-[#00C9A7]/20 rounded-xl p-5">
          <div className="flex items-start gap-3">
            <CheckCircle size={20} className="text-[#00C9A7] flex-shrink-0 mt-0.5" />
            <div className="flex-1">
              <div className="text-[13px] font-bold text-white mb-1">
                {result.policy ? `Insurance policy added: ${result.policy}` : `Successfully parsed ${result.txns} transactions`}
              </div>
              <div className="text-[11px] text-slate-400 space-y-0.5">
                {result.bank && <div>Bank: {result.bank}</div>}
                {result.period && <div>Period: {result.period}</div>}
              </div>
            </div>
            <button onClick={() => { setStatus('idle'); setResult(null); setPreview([]) }} className="text-slate-500 hover:text-white">
              <X size={16} />
            </button>
          </div>

          {preview.length > 0 && (
            <div className="mt-4">
              <div className="text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-2">Preview (first 5 transactions)</div>
              <div className="rounded-lg overflow-hidden border border-white/7">
                <table className="w-full text-[11px]">
                  <thead><tr className="bg-[#1E2D40]">
                    {['Date','Merchant','Category','Amount','Type'].map(h => <th key={h} className="px-3 py-2 text-left text-slate-500 font-semibold">{h}</th>)}
                  </tr></thead>
                  <tbody>{preview.map((t, i) => (
                    <tr key={i} className="border-t border-white/5 hover:bg-white/3">
                      <td className="px-3 py-2 text-slate-400">{t.date}</td>
                      <td className="px-3 py-2 text-white font-medium">{t.merchant}</td>
                      <td className="px-3 py-2"><span className="bg-[#00C9A7]/15 text-[#00C9A7] px-2 py-0.5 rounded text-[10px]">{t.category}</span></td>
                      <td className="px-3 py-2 font-mono font-bold text-[#E8556D]">{t.amount?.toLocaleString('en-IN')}</td>
                      <td className="px-3 py-2 text-slate-500 capitalize">{t.txn_type}</td>
                    </tr>
                  ))}</tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}

      {status === 'error' && result && (
        <div className="bg-rose-500/8 border border-rose-500/20 rounded-xl p-5 flex items-start gap-3">
          <AlertCircle size={18} className="text-rose-400 flex-shrink-0" />
          <div>
            <div className="text-[13px] font-bold text-rose-300">Parse failed</div>
            <div className="text-[11px] text-slate-400 mt-1">{result.error}</div>
          </div>
        </div>
      )}

      {/* Supported formats */}
      <div className="bg-[#162032] border border-white/7 rounded-xl p-4">
        <div className="text-[11px] font-bold text-slate-400 uppercase tracking-wider mb-3">Supported Banks & Formats</div>
        <div className="grid grid-cols-3 gap-2">
          {['HDFC Bank','SBI','ICICI Bank','Axis Bank','Emirates NBD','ADCB','FAB','Mashreq','Kotak','Standard Chartered','ENBD','Any Bank PDF'].map(b => (
            <div key={b} className="flex items-center gap-1.5 text-[11px] text-slate-400">
              <div className="w-1.5 h-1.5 rounded-full bg-[#00C9A7]" />{b}
            </div>
          ))}
        </div>
        <p className="text-[10px] text-slate-600 mt-3">Gemini AI can parse any standard bank statement PDF regardless of bank. Selecting your bank improves accuracy.</p>
      </div>
    </div>
  )
}
