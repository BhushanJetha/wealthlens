'use client'
import { useState, useEffect } from 'react'
import { X, MessageSquareText, Sparkles, ClipboardPaste } from 'lucide-react'
import AddTransactionModal from './AddTransactionModal'
import { parseBankMessage, type ParsedMessage } from '@/lib/messageParser'

// "Add from message" — paste (or share on Android) a bank SMS/email alert; we
// parse it locally and hand off to the normal review/save form pre-filled.
export default function MessageParseModal({ onClose, initialText = '' }: {
  onClose: () => void
  initialText?: string
}) {
  const [text, setText] = useState(initialText)
  const [defaults, setDefaults] = useState<Record<string, string> | null>(null)
  const [error, setError] = useState('')
  const [tried, setTried] = useState(false)

  function toDefaults(r: ParsedMessage): Record<string, string> {
    const src = [r.bank, r.last4 ? `••${r.last4}` : null].filter(Boolean).join(' ')
    return {
      txn_type:    r.direction,
      amount:      String(r.amount),
      currency:    r.currency,
      merchant:    r.merchant,
      category:    r.category,
      txn_date:    r.date,
      description: src ? `From ${src}` : '',
    }
  }

  function doParse(src?: string) {
    const t = (src ?? text).trim()
    setTried(true)
    if (!t) { setError('Paste a bank SMS or email first.'); return }
    const r = parseBankMessage(t)
    if (!r) { setError("Couldn't find a transaction amount in that message. You can add it manually instead."); return }
    setError('')
    setDefaults(toDefaults(r))
  }

  // Auto-parse when opened via the Android share sheet (text already present)
  useEffect(() => { if (initialText.trim()) doParse(initialText) }, []) // eslint-disable-line react-hooks/exhaustive-deps

  async function pasteFromClipboard() {
    try {
      const t = await navigator.clipboard.readText()
      if (t) { setText(t); doParse(t) }
      else setError('Clipboard is empty.')
    } catch {
      setError('Clipboard blocked — long-press the box and paste manually.')
    }
  }

  // Once parsed (or "add manually"), reuse the standard transaction form
  if (defaults) return <AddTransactionModal defaults={defaults} onClose={onClose} onAdded={onClose} />

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
      <div className="rounded-2xl p-6 w-full max-w-md" style={{ background: '#fff', border: '1px solid var(--border)', boxShadow: '0 8px 32px rgba(0,0,0,0.12)' }}>
        <div className="flex justify-between items-center mb-2">
          <h2 className="text-[15px] font-bold flex items-center gap-2" style={{ color: 'var(--text)' }}>
            <MessageSquareText size={16} style={{ color: 'var(--sage)' }} /> Add from message
          </h2>
          <button onClick={onClose} style={{ color: 'var(--text3)' }}><X size={18} /></button>
        </div>
        <p className="text-[11px] mb-4 leading-snug" style={{ color: 'var(--text3)' }}>
          Paste a bank SMS or email alert — or on Android, long-press the SMS → <strong>Share</strong> → WealthLens.
          We read the amount, merchant and date locally; you review before saving. Nothing leaves your device.
        </p>

        {error && (
          <div className="rounded-lg p-3 text-[12px] mb-3" style={{ background: 'var(--rose-bg)', border: '1px solid var(--rose)', color: 'var(--rose)' }}>
            {error}
          </div>
        )}

        <textarea value={text} onChange={e => setText(e.target.value)} rows={5}
          placeholder="e.g. Spent Rs.450 on HDFC Card 1518 at SWIGGY on 07-06-26. Avl bal Rs.12,500"
          className="wl-input w-full" style={{ background: 'var(--bg2)', resize: 'vertical', minHeight: 96 }} />

        <div className="flex gap-2 mt-3">
          <button onClick={pasteFromClipboard}
            className="flex items-center justify-center gap-1.5 px-3 py-2.5 rounded-lg text-[12px] font-semibold border"
            style={{ borderColor: 'var(--border)', color: 'var(--text3)', background: 'var(--bg2)' }}>
            <ClipboardPaste size={13} /> Paste
          </button>
          <button onClick={() => doParse()}
            className="flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-lg text-white text-[12px] font-bold"
            style={{ background: 'var(--sage)' }}>
            <Sparkles size={13} /> Read message
          </button>
        </div>

        {tried && error && (
          <button onClick={() => setDefaults({})}
            className="w-full mt-2 py-2 rounded-lg text-[12px] font-semibold border"
            style={{ borderColor: 'var(--border)', color: 'var(--text3)', background: 'transparent' }}>
            Add manually instead
          </button>
        )}
      </div>
    </div>
  )
}
