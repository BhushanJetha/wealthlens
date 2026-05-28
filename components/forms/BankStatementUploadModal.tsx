'use client'
import { useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { X, Upload, Loader2, CheckCircle2, AlertCircle, FileText } from 'lucide-react'
import { useDropzone } from 'react-dropzone'

interface Props { onClose: () => void }

export default function BankStatementUploadModal({ onClose }: Props) {
  const [file, setFile]         = useState<File | null>(null)
  const [bankHint, setBankHint] = useState('')
  const [status, setStatus]     = useState<'idle' | 'uploading' | 'done' | 'error'>('idle')
  const [result, setResult]     = useState<any>(null)
  const [errorMsg, setErrorMsg] = useState('')
  const router = useRouter()

  const onDrop = useCallback((accepted: File[]) => { if (accepted[0]) setFile(accepted[0]) }, [])
  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: { 'application/pdf': ['.pdf'], 'image/*': ['.png','.jpg','.jpeg'] },
    maxFiles: 1,
  })

  async function upload() {
    if (!file) return
    setStatus('uploading')
    try {
      const formData = new FormData()
      formData.append('file', file)
      formData.append('fileType', 'bank_statement')
      if (bankHint) formData.append('bankHint', bankHint)

      const res = await fetch('/api/parse-statement', { method: 'POST', body: formData })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Upload failed')
      setResult(data)
      setStatus('done')
      router.refresh()
    } catch (e: any) {
      setErrorMsg(e.message)
      setStatus('error')
    }
  }

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
      <div className="rounded-2xl p-6 w-full max-w-md"
        style={{ background: '#fff', border: '1px solid var(--border)', boxShadow: '0 8px 32px rgba(0,0,0,0.12)' }}>
        <div className="flex justify-between items-center mb-5">
          <h2 className="text-[15px] font-bold" style={{ color: 'var(--text)' }}>Upload Bank Statement</h2>
          <button onClick={onClose} style={{ color: 'var(--text3)' }}><X size={18} /></button>
        </div>

        {status === 'idle' && (
          <>
            <div className="mb-4">
              <label className="block text-[10px] uppercase tracking-wider font-semibold mb-1.5" style={{ color: 'var(--text3)' }}>
                Bank Name (optional)
              </label>
              <input value={bankHint} onChange={e => setBankHint(e.target.value)}
                placeholder="e.g. HDFC, ICICI, Emirates NBD"
                className="wl-input" style={{ background: 'var(--bg2)', border: '1px solid var(--border)', color: 'var(--text)' }}
                onFocus={e => (e.target.style.borderColor = 'var(--sage)')}
                onBlur={e => (e.target.style.borderColor = 'var(--border)')} />
            </div>

            <div {...getRootProps()} className="border-2 border-dashed rounded-xl p-8 text-center cursor-pointer transition-all mb-4"
              style={{ borderColor: isDragActive ? 'var(--sage)' : 'var(--border)', background: isDragActive ? 'var(--sage-bg)' : 'var(--bg2)' }}>
              <input {...getInputProps()} />
              <Upload size={28} className="mx-auto mb-2" style={{ color: 'var(--text3)' }} />
              <div className="text-[13px] font-semibold" style={{ color: 'var(--text)' }}>
                {isDragActive ? 'Drop your statement here' : 'Drag & drop or click to select'}
              </div>
              <div className="text-[11px] mt-1" style={{ color: 'var(--text3)' }}>PDF or image of your bank statement</div>
            </div>

            {file && (
              <div className="flex items-center gap-2 mb-4 p-3 rounded-lg" style={{ background: 'var(--bg2)' }}>
                <FileText size={16} style={{ color: 'var(--sage)' }} />
                <span className="text-[12px] font-medium flex-1 truncate" style={{ color: 'var(--text)' }}>{file.name}</span>
                <button onClick={() => setFile(null)} style={{ color: 'var(--text3)' }}><X size={14} /></button>
              </div>
            )}

            <div className="flex gap-3">
              <button onClick={onClose} className="flex-1 py-2.5 rounded-lg border text-[12px] font-semibold"
                style={{ borderColor: 'var(--border)', color: 'var(--text3)', background: 'var(--bg2)' }}>
                Cancel
              </button>
              <button onClick={upload} disabled={!file}
                className="flex-1 py-2.5 rounded-lg text-white text-[12px] font-bold flex items-center justify-center gap-2 disabled:opacity-40"
                style={{ background: 'var(--sage)' }}>
                Parse with AI
              </button>
            </div>
          </>
        )}

        {status === 'uploading' && (
          <div className="flex flex-col items-center py-12 gap-3">
            <Loader2 size={32} className="animate-spin" style={{ color: 'var(--sage)' }} />
            <div className="text-[13px] font-semibold" style={{ color: 'var(--text)' }}>AI is reading your statement…</div>
            <div className="text-[11px]" style={{ color: 'var(--text3)' }}>This may take 10–20 seconds</div>
          </div>
        )}

        {status === 'done' && result && (
          <div className="flex flex-col items-center py-8 gap-3">
            <CheckCircle2 size={40} style={{ color: 'var(--income)' }} />
            <div className="text-[15px] font-bold" style={{ color: 'var(--text)' }}>Statement Imported!</div>
            <div className="rounded-xl p-4 w-full text-[12px] space-y-1.5" style={{ background: 'var(--bg2)' }}>
              <div className="flex justify-between">
                <span style={{ color: 'var(--text3)' }}>Bank</span>
                <span className="font-semibold" style={{ color: 'var(--text)' }}>{result.bank_name ?? '—'}</span>
              </div>
              <div className="flex justify-between">
                <span style={{ color: 'var(--text3)' }}>Currency</span>
                <span className="font-semibold" style={{ color: 'var(--text)' }}>{result.currency ?? '—'}</span>
              </div>
              <div className="flex justify-between">
                <span style={{ color: 'var(--text3)' }}>Transactions parsed</span>
                <span className="font-bold" style={{ color: 'var(--income)' }}>{result.transactions_count ?? 0}</span>
              </div>
              {result.period && (
                <div className="flex justify-between">
                  <span style={{ color: 'var(--text3)' }}>Period</span>
                  <span className="font-semibold" style={{ color: 'var(--text)' }}>{result.period.from} → {result.period.to}</span>
                </div>
              )}
            </div>
            <button onClick={onClose}
              className="mt-2 px-6 py-2.5 rounded-lg text-white text-[12px] font-bold"
              style={{ background: 'var(--sage)' }}>
              Done
            </button>
          </div>
        )}

        {status === 'error' && (
          <div className="flex flex-col items-center py-10 gap-3">
            <AlertCircle size={32} style={{ color: 'var(--rose)' }} />
            <div className="text-[13px] font-semibold" style={{ color: 'var(--text)' }}>Parsing failed</div>
            <div className="text-[11px] text-center" style={{ color: 'var(--text3)' }}>{errorMsg}</div>
            <button onClick={() => setStatus('idle')} className="px-4 py-2 rounded-lg text-white text-[12px] font-semibold"
              style={{ background: 'var(--sage)' }}>
              Try Again
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
