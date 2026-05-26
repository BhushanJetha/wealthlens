'use client'
import { useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { X, Upload, Loader2, CheckCircle2, AlertCircle, FileText } from 'lucide-react'
import { useDropzone } from 'react-dropzone'

type InvType = 'mutual_fund' | 'stock' | 'fixed_deposit' | 'recurring_deposit' | 'nps' | 'lic' | 'gold' | 'bond' | 'etf'

const TYPE_LABEL: Record<InvType, string> = {
  mutual_fund: 'Mutual Fund', stock: 'Stock', fixed_deposit: 'Fixed Deposit',
  recurring_deposit: 'Recurring Deposit', nps: 'NPS', lic: 'LIC Policy',
  gold: 'Gold', bond: 'Bond', etf: 'ETF',
}

interface Props { onClose: () => void; investmentType: InvType }

export function PdfUploadModal({ onClose, investmentType }: Props) {
  const [file, setFile]         = useState<File | null>(null)
  const [status, setStatus]     = useState<'idle' | 'parsing' | 'review' | 'saving' | 'done' | 'error'>('idle')
  const [parsed, setParsed]     = useState<any[]>([])
  const [errorMsg, setErrorMsg] = useState('')
  const router = useRouter()
  const supabase = createClient()

  const onDrop = useCallback((accepted: File[]) => {
    if (accepted[0]) setFile(accepted[0])
  }, [])

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: { 'application/pdf': ['.pdf'], 'image/*': ['.png','.jpg','.jpeg'] },
    maxFiles: 1,
  })

  async function parse() {
    if (!file) return
    setStatus('parsing')
    try {
      const formData = new FormData()
      formData.append('file', file)
      formData.append('investmentType', investmentType)

      const res = await fetch('/api/parse-investment', { method: 'POST', body: formData })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Parsing failed')
      setParsed(data.investments ?? [])
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
          <h2 className="text-[15px] font-bold" style={{ color: 'var(--text)' }}>
            Upload PDF — {TYPE_LABEL[investmentType]}
          </h2>
          <button onClick={onClose} style={{ color: 'var(--text3)' }}><X size={18} /></button>
        </div>

        {status === 'idle' && (
          <>
            <div {...getRootProps()} className="border-2 border-dashed rounded-xl p-8 text-center cursor-pointer transition-all"
              style={{ borderColor: isDragActive ? 'var(--sage)' : 'var(--border)', background: isDragActive ? 'var(--sage-bg)' : 'var(--bg2)' }}>
              <input {...getInputProps()} />
              <Upload size={28} className="mx-auto mb-2" style={{ color: 'var(--text3)' }} />
              <div className="text-[13px] font-semibold" style={{ color: 'var(--text)' }}>
                {isDragActive ? 'Drop your file here' : 'Drag & drop or click to select'}
              </div>
              <div className="text-[11px] mt-1" style={{ color: 'var(--text3)' }}>PDF or image of your investment statement</div>
            </div>
            {file && (
              <div className="flex items-center gap-2 mt-3 p-3 rounded-lg" style={{ background: 'var(--bg2)' }}>
                <FileText size={16} style={{ color: 'var(--sage)' }} />
                <span className="text-[12px] font-medium flex-1" style={{ color: 'var(--text)' }}>{file.name}</span>
                <button onClick={() => setFile(null)} style={{ color: 'var(--text3)' }}><X size={14} /></button>
              </div>
            )}
            <div className="flex gap-3 mt-4">
              <button onClick={onClose} className="flex-1 py-2.5 rounded-lg border text-[12px] font-semibold" style={{ borderColor:'var(--border)', color:'var(--text3)' }}>Cancel</button>
              <button onClick={parse} disabled={!file} className="flex-1 py-2.5 rounded-lg text-white text-[12px] font-bold disabled:opacity-40"
                style={{ background: 'var(--sage)' }}>
                Parse with AI
              </button>
            </div>
          </>
        )}

        {status === 'parsing' && (
          <div className="flex flex-col items-center py-12 gap-3">
            <Loader2 size={32} className="animate-spin" style={{ color: 'var(--sage)' }} />
            <div className="text-[13px] font-semibold" style={{ color: 'var(--text)' }}>AI is reading your statement…</div>
            <div className="text-[11px]" style={{ color: 'var(--text3)' }}>This may take a few seconds</div>
          </div>
        )}

        {status === 'review' && (
          <>
            <div className="text-[12px] font-semibold mb-3" style={{ color: 'var(--text2)' }}>
              Found {parsed.length} investment{parsed.length !== 1 ? 's' : ''}. Review before saving:
            </div>
            <div className="space-y-2 max-h-[300px] overflow-y-auto">
              {parsed.map((p, i) => (
                <div key={i} className="p-3 rounded-lg border text-[11px]" style={{ borderColor:'var(--border)', background:'var(--bg2)' }}>
                  {Object.entries(p).map(([k,v]) => (
                    <div key={k} className="flex justify-between">
                      <span style={{ color:'var(--text3)' }}>{k}:</span>
                      <span className="font-medium" style={{ color:'var(--text)' }}>{String(v)}</span>
                    </div>
                  ))}
                </div>
              ))}
            </div>
            <div className="flex gap-3 mt-4">
              <button onClick={() => setStatus('idle')} className="flex-1 py-2.5 rounded-lg border text-[12px] font-semibold" style={{ borderColor:'var(--border)', color:'var(--text3)' }}>Re-upload</button>
              <button onClick={saveAll} className="flex-1 py-2.5 rounded-lg text-white text-[12px] font-bold" style={{ background:'var(--sage)' }}>
                Save All
              </button>
            </div>
          </>
        )}

        {status === 'saving' && (
          <div className="flex flex-col items-center py-12 gap-3">
            <Loader2 size={32} className="animate-spin" style={{ color: 'var(--sage)' }} />
            <div className="text-[13px]" style={{ color: 'var(--text)' }}>Saving investments…</div>
          </div>
        )}

        {status === 'done' && (
          <div className="flex flex-col items-center py-12 gap-3">
            <CheckCircle2 size={36} style={{ color: 'var(--income)' }} />
            <div className="text-[14px] font-bold" style={{ color: 'var(--text)' }}>Saved successfully!</div>
          </div>
        )}

        {status === 'error' && (
          <div className="flex flex-col items-center py-10 gap-3">
            <AlertCircle size={32} style={{ color: 'var(--rose)' }} />
            <div className="text-[13px] font-semibold" style={{ color: 'var(--text)' }}>Parsing failed</div>
            <div className="text-[11px]" style={{ color: 'var(--text3)' }}>{errorMsg}</div>
            <button onClick={() => setStatus('idle')} className="px-4 py-2 rounded-lg text-white text-[12px] font-semibold" style={{ background:'var(--sage)' }}>Try Again</button>
          </div>
        )}
      </div>
    </div>
  )
}
