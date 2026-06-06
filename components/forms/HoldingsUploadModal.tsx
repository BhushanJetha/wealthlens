'use client'
import { useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import {
  X, Upload, Loader2, CheckCircle2, AlertCircle,
  FileText, Lock, Eye, EyeOff, TrendingUp, Activity, Trash2,
} from 'lucide-react'
import { useDropzone } from 'react-dropzone'

type Kind  = 'stocks' | 'mutual_funds'
type Stage = 'idle' | 'detecting' | 'needs-password' | 'parsing' | 'review' | 'saving' | 'done' | 'error'

interface Props { onClose: () => void; kind: Kind }

interface MfRow {
  fund_name:       string
  fund_type:       string
  folio_number:    string | null
  units:           number
  avg_nav:         number
  current_nav:     number | null
  invested_amount: number
  current_value:   number | null
  currency:        string
  has_sip?:        boolean
  sip_amount?:     number | null
  sip_date?:       number | null
  registrar?:      string | null
  selected:        boolean
  existingId:      string | null
}

interface StockRow {
  symbol:        string
  name:          string
  exchange:      string
  quantity:      number
  avg_buy_price: number
  current_price: number | null
  sector:        string | null
  currency:      string
  selected:      boolean
  existingId:    string | null
}

const FUND_TYPES = ['equity', 'debt', 'hybrid', 'elss', 'index', 'liquid']

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, '')

export default function HoldingsUploadModal({ onClose, kind }: Props) {
  const [file, setFile]               = useState<File | null>(null)
  const [stage, setStage]             = useState<Stage>('idle')
  const [password, setPassword]       = useState('')
  const [showPwd, setShowPwd]         = useState(false)
  const [pwdHint, setPwdHint]         = useState('')
  const [wrongPwd, setWrongPwd]       = useState(false)
  const [errorMsg, setErrorMsg]       = useState('')
  const [parseWarning, setParseWarning] = useState<string | undefined>()
  const [rawPreview, setRawPreview]   = useState<string | undefined>()
  const [allTxns, setAllTxns]         = useState<any[]>([])
  const [mfRows, setMfRows]           = useState<MfRow[]>([])
  const [stockRows, setStockRows]     = useState<StockRow[]>([])
  const [savedNew, setSavedNew]       = useState(0)
  const [savedUpd, setSavedUpd]       = useState(0)
  const [saveError, setSaveError]     = useState<string | null>(null)

  const router   = useRouter()
  const supabase = createClient()

  const accent = kind === 'stocks' ? 'var(--blue)' : 'var(--sage)'
  const Icon   = kind === 'stocks' ? Activity : TrendingUp

  const onDrop = useCallback((accepted: File[]) => {
    if (accepted[0]) { setFile(accepted[0]); setStage('idle') }
  }, [])

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: { 'application/pdf': ['.pdf'] },
    maxFiles: 1,
  })

  async function submit(withPassword?: string) {
    if (!file) return
    setStage(withPassword ? 'parsing' : 'detecting')
    setWrongPwd(false)

    const fd = new FormData()
    fd.append('file', file)
    fd.append('kind', kind)
    if (withPassword) fd.append('password', withPassword)

    try {
      const res  = await fetch('/api/parse-holdings', { method: 'POST', body: fd })
      const data = await res.json()

      if (data.encrypted)     { setPwdHint(data.hint ?? 'Usually your PAN in uppercase'); setStage('needs-password'); return }
      if (data.wrongPassword) { setWrongPwd(true); setStage('needs-password'); return }
      if (!res.ok)            throw new Error(data.error ?? 'Parsing failed')

      const { data: { user } } = await supabase.auth.getUser()

      // Match parsed mutual funds against existing holdings.
      // A single CAMS folio holds MANY schemes, so folio alone is NOT unique —
      // match on folio+scheme-name first, then fall back to name only.
      const parsedMf: any[] = data.mutual_funds ?? []
      if (parsedMf.length > 0) {
        const { data: existing } = await supabase
          .from('mutual_funds').select('id, folio_number, fund_name').eq('user_id', user!.id)
        const folioName = new Map<string, string>()  // `${folio}|${name}` → id
        const byName    = new Map<string, string>()  // name → id (fallback)
        ;(existing ?? []).forEach(e => {
          const nn = norm(e.fund_name)
          if (e.folio_number) folioName.set(`${String(e.folio_number).trim()}|${nn}`, e.id)
          byName.set(nn, e.id)
        })
        setMfRows(parsedMf.map(m => {
          const nn = norm(m.fund_name)
          const existingId =
            (m.folio_number && folioName.get(`${String(m.folio_number).trim()}|${nn}`)) ||
            byName.get(nn) || null
          return { ...m, selected: true, existingId }
        }))
      } else setMfRows([])

      // Match parsed stocks against existing holdings (by symbol)
      const parsedStocks: any[] = data.stocks ?? []
      if (parsedStocks.length > 0) {
        const { data: existing } = await supabase
          .from('stocks').select('id, symbol').eq('user_id', user!.id)
        const bySymbol = new Map((existing ?? []).map(e => [String(e.symbol).toUpperCase().trim(), e.id]))
        setStockRows(parsedStocks.map(s => ({
          ...s,
          selected:   true,
          existingId: bySymbol.get(String(s.symbol).toUpperCase().trim()) ?? null,
        })))
      } else setStockRows([])

      setAllTxns(Array.isArray(data.transactions) ? data.transactions : [])
      setParseWarning(data.parseWarning)
      setRawPreview(data._rawPreview)
      setStage('review')
    } catch (e: any) {
      setErrorMsg(e.message); setStage('error')
    }
  }

  function setMf(i: number, patch: Partial<MfRow>)       { setMfRows(prev => prev.map((r, idx) => idx === i ? { ...r, ...patch } : r)) }
  function setStock(i: number, patch: Partial<StockRow>) { setStockRows(prev => prev.map((r, idx) => idx === i ? { ...r, ...patch } : r)) }

  async function save() {
    setStage('saving')
    setSaveError(null)
    const { data: { user } } = await supabase.auth.getUser()

    let newCount = 0, updCount = 0

    // Persist a fund's parsed CAMS transaction history (best-effort; the
    // investment_transactions table may not exist until migration 012 is run).
    async function storeFundTxns(assetId: string, m: MfRow) {
      const fundTxns = allTxns.filter(t =>
        (m.folio_number && t.folio && String(t.folio).trim() === String(m.folio_number).trim()) ||
        norm(t.fund_name ?? '') === norm(m.fund_name),
      )
      if (fundTxns.length === 0) return
      try {
        await supabase.from('investment_transactions')
          .delete().eq('user_id', user!.id).eq('asset_id', assetId).eq('source', 'cas_import')
        await supabase.from('investment_transactions').insert(fundTxns.map(t => ({
          user_id:      user!.id,
          asset_type:   'mutual_fund',
          asset_id:     assetId,
          asset_name:   m.fund_name,
          folio_number: m.folio_number,
          txn_date:     t.date,
          txn_type:     t.type ?? 'purchase',
          amount:       t.amount ?? 0,
          units:        t.units ?? null,
          nav:          t.nav ?? null,
          currency:     m.currency,
          source:       'cas_import',
        })))
      } catch { /* table missing — skip history, holdings still saved */ }
    }

    try {
      // Resilient write: strips a column & retries if it doesn't exist yet (migration not run).
      // Sets `source` on BOTH insert and update so re-uploads tag existing funds too.
      const mfWrite = async (payload: any, existingId: string | null): Promise<string | null> => {
        let p = payload
        for (let t = 0; t < 4; t++) {
          const { data, error } = existingId
            ? await supabase.from('mutual_funds').update(p).eq('id', existingId).select('id').single()
            : await supabase.from('mutual_funds').insert(p).select('id').single()
          if (!error) return existingId ?? (data?.id ?? null)
          const col = error.message?.match(/'([a-zA-Z_]+)' column/)?.[1] ?? error.message?.match(/column "?([a-zA-Z_]+)"?/i)?.[1]
          if (col && (error.code === 'PGRST204' || /column/i.test(error.message))) { const c = { ...p }; delete c[col]; p = c; continue }
          throw new Error(error.message)
        }
        return existingId
      }

      // ── Mutual funds ──────────────────────────────────────────────────
      for (const m of mfRows.filter(r => r.selected)) {
        const country = m.currency === 'AED' ? 'UAE' : 'India'
        const avgNav  = m.units > 0 ? m.invested_amount / m.units : m.avg_nav
        const common: any = {
          units:           m.units,
          avg_nav:         avgNav,
          invested_amount: m.invested_amount,
          ...(m.current_nav != null ? { current_nav: m.current_nav } : {}),
          ...(m.has_sip ? { has_sip: true, sip_amount: m.sip_amount, sip_date: m.sip_date } : {}),
          ...(m.registrar ? { source: m.registrar } : {}),
        }
        let assetId: string | null
        if (m.existingId) {
          assetId = await mfWrite(common, m.existingId)
          updCount++
        } else {
          assetId = await mfWrite({
            user_id: user!.id, fund_name: m.fund_name, fund_type: m.fund_type,
            folio_number: m.folio_number, currency: m.currency, country, ...common,
          }, null)
          newCount++
        }
        if (assetId) await storeFundTxns(assetId, m)
      }

      // ── Stocks ────────────────────────────────────────────────────────
      const stockInserts: any[] = []
      for (const s of stockRows.filter(r => r.selected)) {
        const country = s.currency === 'AED' ? 'UAE' : 'India'
        if (s.existingId) {
          const { error } = await supabase.from('stocks').update({
            quantity:      s.quantity,
            avg_buy_price: s.avg_buy_price,
            ...(s.current_price != null ? { current_price: s.current_price } : {}),
            ...(s.sector ? { sector: s.sector } : {}),
          }).eq('id', s.existingId)
          if (error) throw new Error(error.message)
          updCount++
        } else {
          stockInserts.push({
            user_id:       user!.id,
            symbol:        s.symbol,
            name:          s.name || s.symbol,
            exchange:      s.exchange || 'NSE',
            quantity:      s.quantity,
            avg_buy_price: s.avg_buy_price,
            ...(s.current_price != null ? { current_price: s.current_price } : {}),
            sector:        s.sector,
            currency:      s.currency,
            country,
          })
        }
      }
      if (stockInserts.length > 0) {
        const { error } = await supabase.from('stocks').insert(stockInserts)
        if (error) throw new Error(error.message)
        newCount += stockInserts.length
      }
    } catch (e: any) {
      setSaveError(e.message ?? 'Could not save holdings.')
      setStage('error')
      return
    }

    setSavedNew(newCount)
    setSavedUpd(updCount)
    setStage('done')
    router.refresh()
  }

  const sym           = (c: string) => (c === 'AED' ? 'AED ' : '₹')
  const selectedCount = mfRows.filter(r => r.selected).length + stockRows.filter(r => r.selected).length

  // Show the page's own kind first
  const showMfFirst = kind === 'mutual_funds'

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
      <div className="rounded-2xl w-full max-w-2xl max-h-[90vh] flex flex-col"
        style={{ background: '#fff', border: '1px solid var(--border)', boxShadow: '0 8px 40px rgba(0,0,0,0.15)' }}>

        {/* Header */}
        <div className="flex justify-between items-center px-6 py-4 border-b flex-shrink-0" style={{ borderColor: 'var(--border)' }}>
          <div className="flex items-center gap-2">
            <Icon size={18} style={{ color: accent }} />
            <h2 className="text-[15px] font-bold" style={{ color: 'var(--text)' }}>
              Import {kind === 'stocks' ? 'Stock Holdings' : 'Mutual Fund'} Statement
            </h2>
          </div>
          <button onClick={onClose} style={{ color: 'var(--text3)' }}><X size={18} /></button>
        </div>

        <div className="flex-1 overflow-y-auto p-6">

          {/* IDLE */}
          {stage === 'idle' && (
            <div className="space-y-4">
              <div {...getRootProps()}
                className="border-2 border-dashed rounded-xl p-8 text-center cursor-pointer transition-all"
                style={{ borderColor: isDragActive ? accent : 'var(--border)', background: isDragActive ? 'var(--bg2)' : 'var(--bg2)' }}>
                <input {...getInputProps()} />
                <Icon size={28} className="mx-auto mb-2" style={{ color: 'var(--text3)' }} />
                <div className="text-[13px] font-semibold" style={{ color: 'var(--text)' }}>
                  {isDragActive ? 'Drop your statement here' : 'Drag & drop or click to select PDF'}
                </div>
                <div className="text-[11px] mt-1" style={{ color: 'var(--text3)' }}>
                  {kind === 'stocks'
                    ? 'Broker / CDSL / NSDL holdings statement · password-protected PDFs supported'
                    : 'CAS (CAMS / KFintech) or fund account statement · password-protected PDFs supported'}
                </div>
              </div>

              {file && (
                <div className="flex items-center gap-2 p-3 rounded-lg" style={{ background: 'var(--bg2)' }}>
                  <FileText size={16} style={{ color: accent }} />
                  <span className="text-[12px] font-medium flex-1 truncate" style={{ color: 'var(--text)' }}>{file.name}</span>
                  <button onClick={() => setFile(null)} style={{ color: 'var(--text3)' }}><X size={14} /></button>
                </div>
              )}

              <div className="flex gap-3">
                <button onClick={onClose}
                  className="flex-1 py-2.5 rounded-lg border text-[12px] font-semibold"
                  style={{ borderColor: 'var(--border)', color: 'var(--text3)', background: 'var(--bg2)' }}>Cancel</button>
                <button onClick={() => submit()} disabled={!file}
                  className="flex-1 py-2.5 rounded-lg text-white text-[12px] font-bold flex items-center justify-center gap-2 disabled:opacity-40"
                  style={{ background: accent }}>
                  <Upload size={14} /> Upload & Parse
                </button>
              </div>
            </div>
          )}

          {/* DETECTING / PARSING */}
          {(stage === 'detecting' || stage === 'parsing') && (
            <div className="flex flex-col items-center py-12 gap-3">
              <Loader2 size={32} className="animate-spin" style={{ color: accent }} />
              <div className="text-[13px] font-semibold" style={{ color: 'var(--text)' }}>
                {stage === 'detecting' ? 'Checking PDF…' : 'Reading your holdings…'}
              </div>
              {stage === 'parsing' && <div className="text-[11px]" style={{ color: 'var(--text3)' }}>AI is extracting holdings from the statement</div>}
            </div>
          )}

          {/* NEEDS PASSWORD */}
          {stage === 'needs-password' && (
            <div className="space-y-4">
              <div className="flex items-start gap-3 p-4 rounded-xl" style={{ background: '#FEF3C7', border: '1px solid #FCD34D' }}>
                <Lock size={20} style={{ color: '#D97706', flexShrink: 0, marginTop: 1 }} />
                <div>
                  <div className="text-[13px] font-semibold" style={{ color: '#92400E' }}>This statement is password-protected</div>
                  <div className="text-[11px] mt-1" style={{ color: '#92400E' }}><strong>Hint:</strong> {pwdHint}</div>
                </div>
              </div>
              <div>
                <label className="block text-[10px] uppercase tracking-wider font-semibold mb-1.5" style={{ color: 'var(--text3)' }}>PDF Password</label>
                <div className="relative">
                  <input type={showPwd ? 'text' : 'password'} value={password}
                    onChange={e => setPassword(e.target.value)}
                    onKeyDown={e => e.key === 'Enter' && password && submit(password)}
                    placeholder="Enter PDF password…" autoFocus
                    className="wl-input w-full pr-10"
                    style={{ background: 'var(--bg2)', border: `1px solid ${wrongPwd ? 'var(--rose)' : 'var(--border)'}`, color: 'var(--text)' }} />
                  <button type="button" onClick={() => setShowPwd(p => !p)} className="absolute right-3 top-1/2 -translate-y-1/2" style={{ color: 'var(--text3)' }}>
                    {showPwd ? <EyeOff size={15} /> : <Eye size={15} />}
                  </button>
                </div>
                {wrongPwd && <div className="text-[11px] mt-1" style={{ color: 'var(--rose)' }}>Incorrect password — please try again.</div>}
              </div>
              <div className="flex gap-3">
                <button onClick={() => { setStage('idle'); setPassword('') }}
                  className="flex-1 py-2.5 rounded-lg border text-[12px] font-semibold"
                  style={{ borderColor: 'var(--border)', color: 'var(--text3)', background: 'var(--bg2)' }}>Change File</button>
                <button onClick={() => submit(password)} disabled={!password}
                  className="flex-1 py-2.5 rounded-lg text-white text-[12px] font-bold flex items-center justify-center gap-2 disabled:opacity-40"
                  style={{ background: accent }}>
                  <Lock size={14} /> Unlock & Parse
                </button>
              </div>
            </div>
          )}

          {/* REVIEW */}
          {stage === 'review' && (
            <div className="space-y-5">
              {parseWarning && (
                <div className="flex items-start gap-2 p-3 rounded-lg text-[11px]"
                  style={{ background: '#FEF3C7', border: '1px solid #FCD34D', color: '#92400E' }}>
                  <span style={{ flexShrink: 0 }}>⚠️</span><span>{parseWarning}</span>
                </div>
              )}
              {mfRows.length === 0 && stockRows.length === 0 && (
                <div className="text-center py-10 text-[12px]" style={{ color: 'var(--text3)' }}>
                  No holdings were detected in this statement.
                </div>
              )}

              {[
                showMfFirst ? 'mf' : 'stocks',
                showMfFirst ? 'stocks' : 'mf',
              ].map(section => section === 'mf' ? (
                mfRows.length > 0 && (
                  <div key="mf" className="space-y-2">
                    <div className="flex items-center gap-2 flex-wrap">
                      <TrendingUp size={14} style={{ color: 'var(--sage)' }} />
                      <span className="text-[12px] font-bold" style={{ color: 'var(--text)' }}>Mutual Funds</span>
                      <span className="text-[10px] px-2 py-0.5 rounded-full font-medium" style={{ background: 'var(--sage-bg)', color: 'var(--sage)' }}>
                        {mfRows.length} found
                      </span>
                      {(() => {
                        const inv = mfRows.filter(r => r.selected).reduce((a, r) => a + (r.invested_amount || 0), 0)
                        const cur = mfRows.filter(r => r.selected).reduce((a, r) => a + ((r.current_value ?? r.invested_amount) || 0), 0)
                        if (inv <= 0) return null
                        return (
                          <span className="ml-auto text-[11px]" style={{ color: 'var(--text3)' }}>
                            Invested <strong style={{ color: 'var(--text)' }}>₹{Math.round(inv).toLocaleString('en-IN')}</strong>
                            {' · '}Current <strong style={{ color: cur >= inv ? 'var(--income)' : 'var(--rose)' }}>₹{Math.round(cur).toLocaleString('en-IN')}</strong>
                            {' '}<span style={{ color: cur >= inv ? 'var(--income)' : 'var(--rose)' }}>({cur >= inv ? '+' : ''}{(((cur - inv) / inv) * 100).toFixed(1)}%)</span>
                          </span>
                        )
                      })()}
                    </div>
                    <div className="rounded-xl overflow-hidden border" style={{ borderColor: 'var(--border)' }}>
                      <div className="overflow-y-auto" style={{ maxHeight: 260 }}>
                        <table className="w-full text-[11px]">
                          <thead className="sticky top-0" style={{ background: 'var(--bg2)' }}>
                            <tr>{['', 'Fund', 'Type', 'Units', 'Invested', 'Current', ''].map((h, i) => (
                              <th key={i} className="px-2 py-2 text-left font-semibold" style={{ color: 'var(--text3)' }}>{h}</th>
                            ))}</tr>
                          </thead>
                          <tbody>
                            {mfRows.map((m, i) => (
                              <tr key={i} className="border-t" style={{ borderColor: 'var(--border)', opacity: m.selected ? 1 : 0.4 }}>
                                <td className="px-2 py-2 text-center">
                                  <input type="checkbox" checked={m.selected} onChange={() => setMf(i, { selected: !m.selected })}
                                    className="cursor-pointer" style={{ accentColor: 'var(--sage)' }} />
                                </td>
                                <td className="px-2 py-2" style={{ maxWidth: 200 }}>
                                  <div className="flex items-center gap-1.5">
                                    <span className="truncate font-medium" style={{ color: 'var(--text)' }}>{m.fund_name}</span>
                                    <span className="text-[9px] px-1.5 py-0.5 rounded font-semibold flex-shrink-0"
                                      style={m.existingId
                                        ? { background: '#DBEAFE', color: '#1E40AF' }
                                        : { background: '#D1FAE5', color: '#065F46' }}>
                                      {m.existingId ? 'update' : 'new'}
                                    </span>
                                    {m.has_sip && (
                                      <span className="text-[9px] px-1.5 py-0.5 rounded font-semibold flex-shrink-0" style={{ background: '#EDE9FE', color: '#6D28D9' }}>
                                        SIP ₹{Number(m.sip_amount).toLocaleString('en-IN')}
                                      </span>
                                    )}
                                  </div>
                                  {m.folio_number && <div className="text-[10px]" style={{ color: 'var(--text3)' }}>Folio {m.folio_number}{m.has_sip && m.sip_date ? ` · SIP on ${m.sip_date}th` : ''}</div>}
                                </td>
                                <td className="px-2 py-2">
                                  <select value={m.fund_type} onChange={e => setMf(i, { fund_type: e.target.value })}
                                    className="text-[10px] px-1.5 py-1 rounded border" style={{ borderColor: 'var(--border)', background: 'var(--bg2)', color: 'var(--text)' }}>
                                    {FUND_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
                                  </select>
                                </td>
                                <td className="px-2 py-2">
                                  <input type="number" value={m.units} onChange={e => setMf(i, { units: Number(e.target.value) })}
                                    className="w-20 text-[10px] px-1.5 py-1 rounded border text-right" style={{ borderColor: 'var(--border)', background: 'var(--bg2)', color: 'var(--text)' }} />
                                </td>
                                <td className="px-2 py-2">
                                  <input type="number" value={m.invested_amount} onChange={e => setMf(i, { invested_amount: Number(e.target.value) })}
                                    className="w-24 text-[10px] px-1.5 py-1 rounded border text-right" style={{ borderColor: 'var(--border)', background: 'var(--bg2)', color: 'var(--text)' }} />
                                </td>
                                <td className="px-2 py-2 text-right whitespace-nowrap">
                                  {m.current_value != null ? (
                                    <>
                                      <div className="font-mono font-semibold" style={{ color: 'var(--text)' }}>{sym(m.currency)}{Math.round(m.current_value).toLocaleString('en-IN')}</div>
                                      {m.invested_amount > 0 && (
                                        <div className="text-[9px] font-mono" style={{ color: m.current_value >= m.invested_amount ? 'var(--income)' : 'var(--rose)' }}>
                                          {m.current_value >= m.invested_amount ? '+' : ''}{(((m.current_value - m.invested_amount) / m.invested_amount) * 100).toFixed(1)}%
                                        </div>
                                      )}
                                    </>
                                  ) : <span style={{ color: 'var(--text3)' }}>—</span>}
                                </td>
                                <td className="px-2 py-2">
                                  <button onClick={() => setMfRows(prev => prev.filter((_, idx) => idx !== i))} style={{ color: 'var(--rose)' }}><Trash2 size={13} /></button>
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  </div>
                )
              ) : (
                stockRows.length > 0 && (
                  <div key="stocks" className="space-y-2">
                    <div className="flex items-center gap-2">
                      <Activity size={14} style={{ color: 'var(--blue)' }} />
                      <span className="text-[12px] font-bold" style={{ color: 'var(--text)' }}>Stocks</span>
                      <span className="text-[10px] px-2 py-0.5 rounded-full font-medium" style={{ background: '#DBEAFE', color: '#1E40AF' }}>
                        {stockRows.length} found
                      </span>
                    </div>
                    <div className="rounded-xl overflow-hidden border" style={{ borderColor: 'var(--border)' }}>
                      <div className="overflow-y-auto" style={{ maxHeight: 260 }}>
                        <table className="w-full text-[11px]">
                          <thead className="sticky top-0" style={{ background: 'var(--bg2)' }}>
                            <tr>{['', 'Stock', 'Qty', 'Avg Buy', 'Sector', ''].map((h, i) => (
                              <th key={i} className="px-2 py-2 text-left font-semibold" style={{ color: 'var(--text3)' }}>{h}</th>
                            ))}</tr>
                          </thead>
                          <tbody>
                            {stockRows.map((s, i) => (
                              <tr key={i} className="border-t" style={{ borderColor: 'var(--border)', opacity: s.selected ? 1 : 0.4 }}>
                                <td className="px-2 py-2 text-center">
                                  <input type="checkbox" checked={s.selected} onChange={() => setStock(i, { selected: !s.selected })}
                                    className="cursor-pointer" style={{ accentColor: 'var(--blue)' }} />
                                </td>
                                <td className="px-2 py-2" style={{ maxWidth: 180 }}>
                                  <div className="flex items-center gap-1.5">
                                    <span className="font-bold" style={{ color: 'var(--text)' }}>{s.symbol}</span>
                                    <span className="text-[9px] px-1.5 py-0.5 rounded font-semibold flex-shrink-0"
                                      style={s.existingId
                                        ? { background: '#DBEAFE', color: '#1E40AF' }
                                        : { background: '#D1FAE5', color: '#065F46' }}>
                                      {s.existingId ? 'update' : 'new'}
                                    </span>
                                  </div>
                                  <div className="truncate text-[10px]" style={{ color: 'var(--text3)' }}>{s.name}</div>
                                </td>
                                <td className="px-2 py-2">
                                  <input type="number" value={s.quantity} onChange={e => setStock(i, { quantity: Number(e.target.value) })}
                                    className="w-16 text-[10px] px-1.5 py-1 rounded border text-right" style={{ borderColor: 'var(--border)', background: 'var(--bg2)', color: 'var(--text)' }} />
                                </td>
                                <td className="px-2 py-2">
                                  <input type="number" value={s.avg_buy_price} onChange={e => setStock(i, { avg_buy_price: Number(e.target.value) })}
                                    className="w-20 text-[10px] px-1.5 py-1 rounded border text-right" style={{ borderColor: 'var(--border)', background: 'var(--bg2)', color: 'var(--text)' }} />
                                </td>
                                <td className="px-2 py-2">
                                  <input type="text" value={s.sector ?? ''} onChange={e => setStock(i, { sector: e.target.value || null })}
                                    placeholder="—" className="w-20 text-[10px] px-1.5 py-1 rounded border" style={{ borderColor: 'var(--border)', background: 'var(--bg2)', color: 'var(--text)' }} />
                                </td>
                                <td className="px-2 py-2">
                                  <button onClick={() => setStockRows(prev => prev.filter((_, idx) => idx !== i))} style={{ color: 'var(--rose)' }}><Trash2 size={13} /></button>
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  </div>
                )
              ))}

              {(mfRows.length > 0 || stockRows.length > 0) && (
                <div className="flex gap-3">
                  <button onClick={() => { setStage('idle'); setMfRows([]); setStockRows([]); setFile(null) }}
                    className="flex-1 py-2.5 rounded-lg border text-[12px] font-semibold"
                    style={{ borderColor: 'var(--border)', color: 'var(--text3)', background: 'var(--bg2)' }}>Re-upload</button>
                  <button onClick={save} disabled={selectedCount === 0}
                    className="flex-1 py-2.5 rounded-lg text-white text-[12px] font-bold flex items-center justify-center gap-2 disabled:opacity-40"
                    style={{ background: accent }}>
                    <CheckCircle2 size={14} /> Save {selectedCount} Holding{selectedCount !== 1 ? 's' : ''}
                  </button>
                </div>
              )}
              {mfRows.length === 0 && stockRows.length === 0 && (
                <div className="space-y-3">
                  {rawPreview && (
                    <div>
                      <div className="text-[10px] font-semibold uppercase tracking-wider mb-1" style={{ color: 'var(--text3)' }}>
                        Extracted text (copy &amp; share this so support for your statement layout can be added)
                      </div>
                      <pre className="text-[9px] leading-snug p-3 rounded-lg overflow-auto whitespace-pre-wrap"
                        style={{ background: 'var(--bg2)', border: '1px solid var(--border)', color: 'var(--text2)', maxHeight: 220 }}>
                        {rawPreview}
                      </pre>
                    </div>
                  )}
                  <button onClick={() => { setStage('idle'); setFile(null) }}
                    className="w-full py-2.5 rounded-lg border text-[12px] font-semibold"
                    style={{ borderColor: 'var(--border)', color: 'var(--text3)', background: 'var(--bg2)' }}>Try Another File</button>
                </div>
              )}
            </div>
          )}

          {/* SAVING */}
          {stage === 'saving' && (
            <div className="flex flex-col items-center py-12 gap-3">
              <Loader2 size={32} className="animate-spin" style={{ color: accent }} />
              <div className="text-[13px]" style={{ color: 'var(--text)' }}>Saving…</div>
            </div>
          )}

          {/* DONE */}
          {stage === 'done' && (
            <div className="flex flex-col items-center py-10 gap-3">
              <CheckCircle2 size={40} style={{ color: 'var(--income)' }} />
              <div className="text-[15px] font-bold" style={{ color: 'var(--text)' }}>
                {savedNew > 0 || savedUpd > 0 ? 'Holdings Imported!' : 'Nothing to Save'}
              </div>
              <div className="text-[12px] text-center" style={{ color: 'var(--text3)' }}>
                {savedNew > 0 && <div>{savedNew} new holding{savedNew !== 1 ? 's' : ''} added</div>}
                {savedUpd > 0 && <div>{savedUpd} existing holding{savedUpd !== 1 ? 's' : ''} updated</div>}
              </div>
              <button onClick={onClose} className="mt-1 px-6 py-2.5 rounded-lg text-white text-[12px] font-bold" style={{ background: 'var(--income)' }}>Done</button>
            </div>
          )}

          {/* ERROR */}
          {stage === 'error' && (
            <div className="flex flex-col items-center py-10 gap-3">
              <AlertCircle size={32} style={{ color: 'var(--rose)' }} />
              <div className="text-[13px] font-semibold" style={{ color: 'var(--text)' }}>Something went wrong</div>
              <div className="text-[11px] text-center max-w-xs" style={{ color: 'var(--text3)' }}>{saveError ?? errorMsg}</div>
              <button onClick={() => { setStage('idle'); setSaveError(null) }}
                className="px-4 py-2 rounded-lg text-white text-[12px] font-semibold" style={{ background: accent }}>Try Again</button>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
