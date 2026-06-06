'use client'
import { useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { X, Upload, Loader2, CheckCircle2, AlertCircle, FileText, Lock, Eye, EyeOff } from 'lucide-react'
import { useDropzone } from 'react-dropzone'

type InvType = 'mutual_fund' | 'stock' | 'fixed_deposit' | 'recurring_deposit' | 'nps' | 'lic' | 'gold' | 'bond' | 'etf'

const TYPE_LABEL: Record<InvType, string> = {
  mutual_fund: 'Mutual Fund', stock: 'Stock', fixed_deposit: 'Fixed Deposit',
  recurring_deposit: 'Recurring Deposit', nps: 'NPS', lic: 'LIC Policy',
  gold: 'Gold', bond: 'Bond', etf: 'ETF',
}

const TABLE_MAP: Record<InvType, string> = {
  stock: 'stocks', mutual_fund: 'mutual_funds', fixed_deposit: 'fixed_deposits',
  recurring_deposit: 'recurring_deposits', nps: 'nps_accounts', lic: 'lic_policies',
  gold: 'gold_investments', bond: 'bond_investments', etf: 'etf_investments',
}

type Stage = 'idle' | 'parsing' | 'needs-password' | 'review' | 'saving' | 'done' | 'error'

interface Props { onClose: () => void; investmentType: InvType }

export function PdfUploadModal({ onClose, investmentType }: Props) {
  const [file, setFile]         = useState<File | null>(null)
  const [status, setStatus]     = useState<Stage>('idle')
  const [parsed, setParsed]     = useState<any[]>([])
  const [errorMsg, setErrorMsg] = useState('')
  const [warning, setWarning]   = useState<string | undefined>()
  const [rawPreview, setRawPreview] = useState<string | undefined>()
  const [password, setPassword] = useState('')
  const [showPwd, setShowPwd]   = useState(false)
  const [pwdHint, setPwdHint]   = useState('')
  const [wrongPwd, setWrongPwd] = useState(false)
  const router = useRouter()
  const supabase = createClient()

  const onDrop = useCallback((accepted: File[]) => { if (accepted[0]) { setFile(accepted[0]); setStatus('idle') } }, [])
  const { getRootProps, getInputProps, isDragActive } = useDropzone({ onDrop, accept: { 'application/pdf': ['.pdf'] }, maxFiles: 1 })

  async function parse(withPassword?: string) {
    if (!file) return
    setStatus('parsing'); setWrongPwd(false)
    try {
      const fd = new FormData()
      fd.append('file', file)
      fd.append('investmentType', investmentType)
      if (withPassword) fd.append('password', withPassword)
      const res = await fetch('/api/parse-investment', { method: 'POST', body: fd })
      const data = await res.json()
      if (data.encrypted)     { setPwdHint(data.hint ?? 'Usually your date of birth (DDMMYYYY)'); setStatus('needs-password'); return }
      if (data.wrongPassword) { setWrongPwd(true); setStatus('needs-password'); return }
      if (!res.ok) throw new Error(data.error ?? 'Parsing failed')
      setParsed(data.investments ?? [])
      setWarning(data.parseWarning)
      setRawPreview(data._rawPreview)
      setStatus('review')
    } catch (e: any) { setErrorMsg(e.message); setStatus('error') }
  }

  async function saveAll() {
    setStatus('saving')
    const { data: { user } } = await supabase.auth.getUser()
    let rows = parsed.map(p => ({ ...p, user_id: user!.id }))
    // Insert; if a column doesn't exist yet (migration not run), strip it and retry
    for (let attempt = 0; attempt < 6; attempt++) {
      const { error } = await supabase.from(TABLE_MAP[investmentType]).insert(rows)
      if (!error) { setStatus('done'); router.refresh(); setTimeout(onClose, 1500); return }
      const col = error.message?.match(/'([a-zA-Z_]+)' column/)?.[1] ?? error.message?.match(/column "?([a-zA-Z_]+)"?/i)?.[1]
      if (col && (error.code === 'PGRST204' || /column/i.test(error.message ?? ''))) {
        rows = rows.map(r => { const c: any = { ...r }; delete c[col]; return c })
        continue
      }
      setErrorMsg(error.message); setStatus('error'); return
    }
    setStatus('done'); router.refresh(); setTimeout(onClose, 1500)
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
                {isDragActive ? 'Drop your file here' : 'Drag & drop or click to select PDF'}
              </div>
              <div className="text-[11px] mt-1" style={{ color: 'var(--text3)' }}>Read locally on the server · password-protected PDFs supported</div>
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
              <button onClick={() => parse()} disabled={!file} className="flex-1 py-2.5 rounded-lg text-white text-[12px] font-bold disabled:opacity-40" style={{ background: 'var(--sage)' }}>
                Upload &amp; Parse
              </button>
            </div>
          </>
        )}

        {status === 'parsing' && (
          <div className="flex flex-col items-center py-12 gap-3">
            <Loader2 size={32} className="animate-spin" style={{ color: 'var(--sage)' }} />
            <div className="text-[13px] font-semibold" style={{ color: 'var(--text)' }}>Reading your document…</div>
            <div className="text-[11px]" style={{ color: 'var(--text3)' }}>Parsed locally — nothing leaves your server</div>
          </div>
        )}

        {status === 'needs-password' && (
          <div className="space-y-4">
            <div className="flex items-start gap-3 p-4 rounded-xl" style={{ background: '#FEF3C7', border: '1px solid #FCD34D' }}>
              <Lock size={20} style={{ color: '#D97706', flexShrink: 0, marginTop: 1 }} />
              <div>
                <div className="text-[13px] font-semibold" style={{ color: '#92400E' }}>This PDF is password-protected</div>
                <div className="text-[11px] mt-1" style={{ color: '#92400E' }}><strong>Hint:</strong> {pwdHint}</div>
              </div>
            </div>
            <div className="relative">
              <input type={showPwd ? 'text' : 'password'} value={password} autoFocus
                onChange={e => setPassword(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && password && parse(password)}
                placeholder="Enter PDF password…"
                className="wl-input w-full pr-10"
                style={{ background: 'var(--bg2)', border: `1px solid ${wrongPwd ? 'var(--rose)' : 'var(--border)'}`, color: 'var(--text)' }} />
              <button type="button" onClick={() => setShowPwd(p => !p)} className="absolute right-3 top-1/2 -translate-y-1/2" style={{ color: 'var(--text3)' }}>
                {showPwd ? <EyeOff size={15} /> : <Eye size={15} />}
              </button>
            </div>
            {wrongPwd && <div className="text-[11px]" style={{ color: 'var(--rose)' }}>Incorrect password — please try again.</div>}
            <div className="flex gap-3">
              <button onClick={() => { setStatus('idle'); setPassword('') }} className="flex-1 py-2.5 rounded-lg border text-[12px] font-semibold" style={{ borderColor: 'var(--border)', color: 'var(--text3)', background: 'var(--bg2)' }}>Change File</button>
              <button onClick={() => parse(password)} disabled={!password} className="flex-1 py-2.5 rounded-lg text-white text-[12px] font-bold disabled:opacity-40" style={{ background: 'var(--sage)' }}>Unlock &amp; Parse</button>
            </div>
          </div>
        )}

        {status === 'review' && (
          <>
            {warning && (
              <div className="flex items-start gap-2 p-3 rounded-lg text-[11px] mb-3" style={{ background: '#FEF3C7', border: '1px solid #FCD34D', color: '#92400E' }}>
                <span style={{ flexShrink: 0 }}>⚠️</span><span>{warning}</span>
              </div>
            )}
            {parsed.length === 0 ? (
              <div className="space-y-3">
                {rawPreview && (
                  <div>
                    <div className="text-[10px] font-semibold uppercase tracking-wider mb-1" style={{ color: 'var(--text3)' }}>
                      Extracted text (copy &amp; share so this bank's layout can be added)
                    </div>
                    <pre className="text-[9px] leading-snug p-3 rounded-lg overflow-auto whitespace-pre-wrap"
                      style={{ background: 'var(--bg2)', border: '1px solid var(--border)', color: 'var(--text2)', maxHeight: 220 }}>
                      {rawPreview}
                    </pre>
                  </div>
                )}
                <div className="flex gap-3">
                  <button onClick={() => setStatus('idle')} className="flex-1 py-2.5 rounded-lg border text-[12px] font-semibold" style={{ borderColor:'var(--border)', color:'var(--text3)' }}>Try Another File</button>
                  <button onClick={onClose} className="flex-1 py-2.5 rounded-lg text-white text-[12px] font-bold" style={{ background:'var(--sage)' }}>Add Manually</button>
                </div>
              </div>
            ) : (
              <>
                <div className="text-[12px] font-semibold mb-3" style={{ color: 'var(--text2)' }}>
                  Found {parsed.length} {TYPE_LABEL[investmentType]}{parsed.length !== 1 ? 's' : ''}. Review before saving:
                </div>
                <div className="space-y-2 max-h-[300px] overflow-y-auto">
                  {parsed.map((p, i) => (
                    <div key={i} className="p-3 rounded-lg border text-[11px]" style={{ borderColor:'var(--border)', background:'var(--bg2)' }}>
                      {Object.entries(p).filter(([k]) => !['currency','country'].includes(k)).map(([k, v]) => (
                        v == null || v === '' ? null : (
                          <div key={k} className="flex justify-between gap-3">
                            <span style={{ color:'var(--text3)' }}>{k.replace(/_/g, ' ')}:</span>
                            <span className="font-medium text-right" style={{ color:'var(--text)' }}>{String(v)}</span>
                          </div>
                        )
                      ))}
                    </div>
                  ))}
                </div>
                <div className="text-[10px] mt-2" style={{ color: 'var(--text3)' }}>Anything wrong? Save, then use Edit on the item to fine-tune.</div>
                <div className="flex gap-3 mt-3">
                  <button onClick={() => setStatus('idle')} className="flex-1 py-2.5 rounded-lg border text-[12px] font-semibold" style={{ borderColor:'var(--border)', color:'var(--text3)' }}>Re-upload</button>
                  <button onClick={saveAll} className="flex-1 py-2.5 rounded-lg text-white text-[12px] font-bold" style={{ background:'var(--sage)' }}>Save {parsed.length}</button>
                </div>
              </>
            )}
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
            <div className="text-[14px] font-bold" style={{ color: 'var(--text)' }}>Saved successfully!</div>
          </div>
        )}

        {status === 'error' && (
          <div className="flex flex-col items-center py-10 gap-3">
            <AlertCircle size={32} style={{ color: 'var(--rose)' }} />
            <div className="text-[13px] font-semibold" style={{ color: 'var(--text)' }}>Couldn't parse</div>
            <div className="text-[11px] text-center max-w-xs" style={{ color: 'var(--text3)' }}>{errorMsg}</div>
            <button onClick={() => setStatus('idle')} className="px-4 py-2 rounded-lg text-white text-[12px] font-semibold" style={{ background:'var(--sage)' }}>Try Again</button>
          </div>
        )}
      </div>
    </div>
  )
}
