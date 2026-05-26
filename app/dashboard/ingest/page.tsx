'use client'
import { useState, useCallback } from 'react'
import { useDropzone } from 'react-dropzone'
import { Upload, CheckCircle, AlertCircle, Loader2, X, Shield } from 'lucide-react'

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
    setStatus('uploading'); setResult(null); setPreview([])

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
    onDrop, accept: { 'application/pdf': ['.pdf'], 'text/csv': ['.csv'], 'image/*': ['.jpg', '.jpeg', '.png'] },
    maxFiles: 1, maxSize: 20 * 1024 * 1024,
  })

  const BANKS = ['HDFC Bank', 'SBI', 'ICICI Bank', 'Axis Bank', 'Emirates NBD', 'ADCB', 'FAB', 'Mashreq', 'Standard Chartered', 'Kotak', 'Other']

  return (
    <div className="max-w-3xl mx-auto space-y-5 animate-fade-up">
      <div>
        <h1 className="text-xl font-bold" style={{ color: 'var(--text)' }}>Upload Statements</h1>
        <p className="text-[12px] mt-0.5" style={{ color: 'var(--text3)' }}>AI auto-extracts transactions from PDF statements and insurance documents</p>
      </div>

      <div className="flex items-center gap-2 rounded-xl px-4 py-3"
        style={{ background: 'var(--sage-bg)', border: '1px solid var(--sage)' }}>
        <Shield size={14} className="flex-shrink-0" style={{ color: 'var(--sage)' }} />
        <p className="text-[12px]" style={{ color: 'var(--text2)' }}>Files are encrypted at rest. Only you can access them. AI parsing happens server-side and raw file content is never stored in logs.</p>
      </div>

      {/* Options */}
      <div className="wl-card p-5 space-y-4">
        <div>
          <label className="block text-[11px] font-bold uppercase tracking-wider mb-2" style={{ color: 'var(--text3)' }}>Document Type</label>
          <div className="flex gap-2 flex-wrap">
            {([
              ['bank_statement', '🏦 Bank Statement'],
              ['credit_card_statement', '💳 Credit Card Statement'],
              ['insurance_document', '🛡️ Insurance Document'],
            ] as [FileType, string][]).map(([val, label]) => (
              <button key={val} onClick={() => setFileType(val)}
                className="px-3 py-2 rounded-lg text-[12px] font-semibold border transition-all"
                style={fileType === val
                  ? { background: 'var(--sage)', borderColor: 'var(--sage)', color: '#fff' }
                  : { background: 'var(--bg2)', borderColor: 'var(--border)', color: 'var(--text3)' }}>
                {label}
              </button>
            ))}
          </div>
        </div>

        {fileType !== 'insurance_document' && (
          <div>
            <label className="block text-[11px] font-bold uppercase tracking-wider mb-2" style={{ color: 'var(--text3)' }}>Bank (optional — helps AI accuracy)</label>
            <select value={bankHint} onChange={e => setBankHint(e.target.value)}
              className="wl-input" style={{ width: 'auto', minWidth: '180px' }}
              onFocus={e => (e.target.style.borderColor = 'var(--sage)')}
              onBlur={e => (e.target.style.borderColor = 'var(--border)')}>
              <option value="">Select bank…</option>
              {BANKS.map(b => <option key={b} value={b}>{b}</option>)}
            </select>
          </div>
        )}
      </div>

      {/* Drop zone */}
      <div {...getRootProps()} className="border-2 border-dashed rounded-xl p-10 text-center cursor-pointer transition-all"
        style={isDragActive
          ? { borderColor: 'var(--sage)', background: 'var(--sage-bg)' }
          : { borderColor: 'var(--border2)', background: 'var(--bg2)' }}>
        <input {...getInputProps()} />
        <Upload size={28} className="mx-auto mb-3" style={{ color: isDragActive ? 'var(--sage)' : 'var(--border2)' }} />
        <p className="text-[13px] font-semibold mb-1" style={{ color: 'var(--text2)' }}>
          {isDragActive ? 'Drop to upload…' : 'Drag & drop or click to select'}
        </p>
        <p className="text-[11px]" style={{ color: 'var(--text3)' }}>PDF, CSV, JPG, PNG · Max 20MB</p>
      </div>

      {/* Status */}
      {status === 'uploading' && (
        <div className="wl-card p-5 flex items-center gap-4">
          <Loader2 size={22} className="animate-spin" style={{ color: 'var(--sage)' }} />
          <div>
            <div className="text-[13px] font-semibold" style={{ color: 'var(--text)' }}>Parsing with AI…</div>
            <div className="text-[11px]" style={{ color: 'var(--text3)' }}>Extracting transactions from your statement</div>
          </div>
        </div>
      )}

      {status === 'success' && result && (
        <div className="rounded-xl p-5"
          style={{ background: 'var(--income-bg)', border: '1px solid var(--income)' }}>
          <div className="flex items-start gap-3">
            <CheckCircle size={20} className="flex-shrink-0 mt-0.5" style={{ color: 'var(--income)' }} />
            <div className="flex-1">
              <div className="text-[13px] font-bold mb-1" style={{ color: 'var(--text)' }}>
                {result.policy ? `Insurance policy added: ${result.policy}` : `Successfully parsed ${result.txns} transactions`}
              </div>
              <div className="text-[11px] space-y-0.5" style={{ color: 'var(--text3)' }}>
                {result.bank && <div>Bank: {result.bank}</div>}
                {result.period && <div>Period: {result.period}</div>}
              </div>
            </div>
            <button onClick={() => { setStatus('idle'); setResult(null); setPreview([]) }}
              style={{ color: 'var(--text3)' }}><X size={16} /></button>
          </div>

          {preview.length > 0 && (
            <div className="mt-4">
              <div className="text-[10px] font-bold uppercase tracking-wider mb-2" style={{ color: 'var(--text3)' }}>
                Preview (first 5 transactions)
              </div>
              <div className="rounded-lg overflow-hidden" style={{ border: '1px solid var(--border)' }}>
                <table className="w-full text-[11px]">
                  <thead>
                    <tr style={{ background: 'var(--bg2)', borderBottom: '1px solid var(--border)' }}>
                      {['Date', 'Merchant', 'Category', 'Amount', 'Type'].map(h => (
                        <th key={h} className="px-3 py-2 text-left font-semibold" style={{ color: 'var(--text3)' }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {preview.map((t, i) => (
                      <tr key={i} style={{ borderBottom: '1px solid var(--border)' }}>
                        <td className="px-3 py-2" style={{ color: 'var(--text3)' }}>{t.date}</td>
                        <td className="px-3 py-2 font-medium" style={{ color: 'var(--text)' }}>{t.merchant}</td>
                        <td className="px-3 py-2">
                          <span className="px-2 py-0.5 rounded text-[10px] font-semibold"
                            style={{ background: 'var(--sage-bg)', color: 'var(--sage)' }}>{t.category}</span>
                        </td>
                        <td className="px-3 py-2 font-mono font-bold" style={{ color: 'var(--expense)' }}>{t.amount?.toLocaleString('en-IN')}</td>
                        <td className="px-3 py-2 capitalize" style={{ color: 'var(--text3)' }}>{t.txn_type}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}

      {status === 'error' && result && (
        <div className="rounded-xl p-5 flex items-start gap-3"
          style={{ background: 'var(--rose-bg)', border: '1px solid var(--rose)' }}>
          <AlertCircle size={18} className="flex-shrink-0" style={{ color: 'var(--rose)' }} />
          <div>
            <div className="text-[13px] font-bold" style={{ color: 'var(--rose)' }}>Parse failed</div>
            <div className="text-[11px] mt-1" style={{ color: 'var(--text3)' }}>{result.error}</div>
          </div>
        </div>
      )}

      {/* Supported formats */}
      <div className="wl-card p-4">
        <div className="text-[11px] font-bold uppercase tracking-wider mb-3" style={{ color: 'var(--text3)' }}>Supported Banks &amp; Formats</div>
        <div className="grid grid-cols-3 gap-2">
          {['HDFC Bank', 'SBI', 'ICICI Bank', 'Axis Bank', 'Emirates NBD', 'ADCB', 'FAB', 'Mashreq', 'Kotak', 'Standard Chartered', 'ENBD', 'Any Bank PDF'].map(b => (
            <div key={b} className="flex items-center gap-1.5 text-[11px]" style={{ color: 'var(--text3)' }}>
              <div className="w-1.5 h-1.5 rounded-full" style={{ background: 'var(--sage)' }} />{b}
            </div>
          ))}
        </div>
        <p className="text-[10px] mt-3" style={{ color: 'var(--text3)' }}>AI can parse any standard bank statement PDF. Selecting your bank improves accuracy.</p>
      </div>
    </div>
  )
}
