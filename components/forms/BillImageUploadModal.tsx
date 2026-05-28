'use client'
import { useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { X, Image as ImageIcon, Loader2, CheckCircle2, AlertCircle } from 'lucide-react'
import { useDropzone } from 'react-dropzone'

interface Props { onClose: () => void; defaultType?: 'expense' | 'income' }

const inputStyle = { background: 'var(--bg2)', border: '1px solid var(--border)', color: 'var(--text)' }
const inputClass = 'wl-input'

export default function BillImageUploadModal({ onClose, defaultType = 'expense' }: Props) {
  const [file, setFile]         = useState<File | null>(null)
  const [preview, setPreview]   = useState<string | null>(null)
  const [status, setStatus]     = useState<'idle' | 'parsing' | 'review' | 'saving' | 'done' | 'error'>('idle')
  const [parsed, setParsed]     = useState<any>({})
  const [errorMsg, setErrorMsg] = useState('')
  const router = useRouter()
  const supabase = createClient()

  const onDrop = useCallback((accepted: File[]) => {
    const f = accepted[0]
    if (!f) return
    setFile(f)
    setPreview(URL.createObjectURL(f))
  }, [])

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: { 'image/*': ['.png','.jpg','.jpeg','.webp','.heic'] },
    maxFiles: 1,
  })

  async function parse() {
    if (!file) return
    setStatus('parsing')
    try {
      const formData = new FormData()
      formData.append('file', file)
      formData.append('fileType', defaultType === 'income' ? 'income_receipt' : 'expense_bill')

      const res = await fetch('/api/parse-bill-image', { method: 'POST', body: formData })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Parsing failed')
      setParsed(data.transaction ?? {})
      setStatus('review')
    } catch (e: any) {
      setErrorMsg(e.message)
      setStatus('error')
    }
  }

  async function save() {
    setStatus('saving')
    try {
      const { data: { user } } = await supabase.auth.getUser()
      const res = await fetch('/api/transactions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...parsed, user_id: user!.id, source: 'bill_upload' }),
      })
      if (!res.ok) throw new Error('Save failed')
      setStatus('done')
      router.refresh()
      setTimeout(onClose, 1500)
    } catch (e: any) {
      setErrorMsg(e.message)
      setStatus('error')
    }
  }

  function updateField(key: string, value: string) {
    setParsed((p: any) => ({ ...p, [key]: value }))
  }

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
      <div className="rounded-2xl p-6 w-full max-w-md max-h-[90vh] overflow-y-auto"
        style={{ background: '#fff', border: '1px solid var(--border)', boxShadow: '0 8px 32px rgba(0,0,0,0.12)' }}>
        <div className="flex justify-between items-center mb-5">
          <h2 className="text-[15px] font-bold" style={{ color: 'var(--text)' }}>Upload Bill / Receipt</h2>
          <button onClick={onClose} style={{ color: 'var(--text3)' }}><X size={18} /></button>
        </div>

        {status === 'idle' && (
          <>
            <div {...getRootProps()} className="border-2 border-dashed rounded-xl p-6 text-center cursor-pointer transition-all mb-4"
              style={{ borderColor: isDragActive ? 'var(--sage)' : 'var(--border)', background: isDragActive ? 'var(--sage-bg)' : 'var(--bg2)' }}>
              <input {...getInputProps()} />
              {preview ? (
                <img src={preview} alt="preview" className="max-h-40 mx-auto rounded-lg object-contain" />
              ) : (
                <>
                  <ImageIcon size={28} className="mx-auto mb-2" style={{ color: 'var(--text3)' }} />
                  <div className="text-[13px] font-semibold" style={{ color: 'var(--text)' }}>
                    {isDragActive ? 'Drop your image here' : 'Drag & drop or click to select'}
                  </div>
                  <div className="text-[11px] mt-1" style={{ color: 'var(--text3)' }}>
                    Bill, receipt or screenshot (PNG, JPG, HEIC)
                  </div>
                </>
              )}
            </div>

            {file && (
              <div className="flex items-center gap-2 mb-4 text-[11px]" style={{ color: 'var(--text3)' }}>
                <ImageIcon size={13} style={{ color: 'var(--sage)' }} />
                <span className="flex-1 truncate">{file.name}</span>
                <button onClick={() => { setFile(null); setPreview(null) }}><X size={13} /></button>
              </div>
            )}

            <div className="flex gap-3">
              <button onClick={onClose} className="flex-1 py-2.5 rounded-lg border text-[12px] font-semibold"
                style={{ borderColor: 'var(--border)', color: 'var(--text3)', background: 'var(--bg2)' }}>
                Cancel
              </button>
              <button onClick={parse} disabled={!file}
                className="flex-1 py-2.5 rounded-lg text-white text-[12px] font-bold disabled:opacity-40"
                style={{ background: 'var(--sage)' }}>
                Extract with AI
              </button>
            </div>
          </>
        )}

        {status === 'parsing' && (
          <div className="flex flex-col items-center py-12 gap-3">
            <Loader2 size={32} className="animate-spin" style={{ color: 'var(--sage)' }} />
            <div className="text-[13px] font-semibold" style={{ color: 'var(--text)' }}>Reading your bill…</div>
          </div>
        )}

        {status === 'review' && (
          <>
            <div className="text-[12px] font-semibold mb-3" style={{ color: 'var(--text2)' }}>Review & edit before saving:</div>
            <div className="space-y-3">
              {[
                { key: 'txn_date', label: 'Date', type: 'date' },
                { key: 'merchant', label: 'Merchant / Payee', type: 'text' },
                { key: 'amount', label: 'Amount', type: 'number' },
                { key: 'currency', label: 'Currency', type: 'text' },
                { key: 'category', label: 'Category', type: 'text' },
                { key: 'description', label: 'Description', type: 'text' },
              ].map(({ key, label, type }) => (
                <div key={key}>
                  <label className="block text-[10px] uppercase tracking-wider font-semibold mb-1" style={{ color: 'var(--text3)' }}>{label}</label>
                  <input type={type} value={parsed[key] ?? ''} onChange={e => updateField(key, e.target.value)}
                    className={inputClass} style={inputStyle}
                    onFocus={e => (e.target.style.borderColor = 'var(--sage)')}
                    onBlur={e => (e.target.style.borderColor = 'var(--border)')} />
                </div>
              ))}
            </div>
            <div className="flex gap-3 mt-4">
              <button onClick={() => setStatus('idle')} className="flex-1 py-2.5 rounded-lg border text-[12px] font-semibold"
                style={{ borderColor: 'var(--border)', color: 'var(--text3)', background: 'var(--bg2)' }}>
                Re-upload
              </button>
              <button onClick={save} className="flex-1 py-2.5 rounded-lg text-white text-[12px] font-bold"
                style={{ background: 'var(--sage)' }}>
                Save Transaction
              </button>
            </div>
          </>
        )}

        {status === 'saving' && (
          <div className="flex flex-col items-center py-12 gap-3">
            <Loader2 size={32} className="animate-spin" style={{ color: 'var(--sage)' }} />
            <div className="text-[13px]" style={{ color: 'var(--text)' }}>Saving…</div>
          </div>
        )}

        {status === 'done' && (
          <div className="flex flex-col items-center py-12 gap-3">
            <CheckCircle2 size={36} style={{ color: 'var(--income)' }} />
            <div className="text-[14px] font-bold" style={{ color: 'var(--text)' }}>Transaction saved!</div>
          </div>
        )}

        {status === 'error' && (
          <div className="flex flex-col items-center py-10 gap-3">
            <AlertCircle size={32} style={{ color: 'var(--rose)' }} />
            <div className="text-[13px] font-semibold" style={{ color: 'var(--text)' }}>Something went wrong</div>
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
