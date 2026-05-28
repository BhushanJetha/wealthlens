'use client'
import { useState, useRef, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { X, Mic, MicOff, Loader2, CheckCircle2, AlertCircle } from 'lucide-react'

interface Props { onClose: () => void; defaultType?: 'expense' | 'income' }

const inputStyle = { background: 'var(--bg2)', border: '1px solid var(--border)', color: 'var(--text)' }
const inputClass = 'wl-input'

const HINTS: Record<string, string> = {
  expense: 'e.g. "Paid 450 rupees at McDonald\'s for lunch today" or "Spent AED 120 on groceries at Carrefour on 15th"',
  income:  'e.g. "Received salary of 1.5 lakh rupees" or "Got 5000 rupee dividend from Reliance shares yesterday"',
}

export default function TransactionVoiceModal({ onClose, defaultType = 'expense' }: Props) {
  const [recording, setRecording] = useState(false)
  const [transcript, setTranscript] = useState('')
  const [status, setStatus] = useState<'idle' | 'recording' | 'parsing' | 'review' | 'saving' | 'done' | 'error'>('idle')
  const [parsed, setParsed] = useState<any>({})
  const [errorMsg, setErrorMsg] = useState('')
  const recogRef = useRef<any>(null)
  const router = useRouter()
  const supabase = createClient()

  useEffect(() => { return () => { recogRef.current?.stop() } }, [])

  function startRecording() {
    const SpeechRecognition = (window as any).SpeechRecognition ?? (window as any).webkitSpeechRecognition
    if (!SpeechRecognition) { setErrorMsg('Voice input not supported. Please use Chrome.'); setStatus('error'); return }
    const recog = new SpeechRecognition()
    recog.lang = 'en-IN'
    recog.continuous = true
    recog.interimResults = true
    recog.onresult = (e: any) => {
      const text = Array.from(e.results).map((r: any) => r[0].transcript).join(' ')
      setTranscript(text)
    }
    recog.onend = () => setRecording(false)
    recogRef.current = recog
    recog.start()
    setRecording(true)
    setStatus('recording')
  }

  function stopRecording() {
    recogRef.current?.stop()
    setRecording(false)
  }

  async function parse() {
    if (!transcript.trim()) return
    setStatus('parsing')
    try {
      const res = await fetch('/api/parse-voice-transaction', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: transcript, defaultType }),
      })
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
      const res = await fetch('/api/transactions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...parsed, source: 'voice' }),
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
          <h2 className="text-[15px] font-bold" style={{ color: 'var(--text)' }}>Voice Entry</h2>
          <button onClick={onClose} style={{ color: 'var(--text3)' }}><X size={18} /></button>
        </div>

        {(status === 'idle' || status === 'recording') && (
          <>
            <div className="text-[11px] mb-4 p-3 rounded-lg" style={{ background: 'var(--bg2)', color: 'var(--text3)' }}>
              {HINTS[defaultType]}
            </div>

            <div className="flex flex-col items-center gap-4 py-6">
              <button onClick={recording ? stopRecording : startRecording}
                className="w-20 h-20 rounded-full flex items-center justify-center transition-all"
                style={{ background: recording ? 'var(--rose-bg)' : 'var(--sage-bg)', border: `3px solid ${recording ? 'var(--rose)' : 'var(--sage)'}` }}>
                {recording
                  ? <MicOff size={32} style={{ color: 'var(--rose)' }} />
                  : <Mic size={32} style={{ color: 'var(--sage)' }} />}
              </button>
              <div className="text-[12px] font-semibold" style={{ color: recording ? 'var(--rose)' : 'var(--text3)' }}>
                {recording ? '● Recording… tap to stop' : 'Tap to start speaking'}
              </div>
            </div>

            {transcript && (
              <div className="p-3 rounded-lg mb-4 text-[12px]" style={{ background: 'var(--bg2)', color: 'var(--text)' }}>
                <div className="text-[10px] uppercase tracking-wider mb-1" style={{ color: 'var(--text3)' }}>Transcript:</div>
                {transcript}
              </div>
            )}

            {transcript && !recording && (
              <div className="flex gap-3">
                <button onClick={() => { setTranscript(''); setStatus('idle') }} className="flex-1 py-2.5 rounded-lg border text-[12px] font-semibold"
                  style={{ borderColor: 'var(--border)', color: 'var(--text3)', background: 'var(--bg2)' }}>
                  Clear
                </button>
                <button onClick={parse} className="flex-1 py-2.5 rounded-lg text-white text-[12px] font-bold"
                  style={{ background: 'var(--sage)' }}>
                  Parse with AI
                </button>
              </div>
            )}
          </>
        )}

        {status === 'parsing' && (
          <div className="flex flex-col items-center py-12 gap-3">
            <Loader2 size={32} className="animate-spin" style={{ color: 'var(--sage)' }} />
            <div className="text-[13px]" style={{ color: 'var(--text)' }}>Understanding your transaction…</div>
          </div>
        )}

        {status === 'review' && (
          <>
            <div className="text-[12px] font-semibold mb-3" style={{ color: 'var(--text2)' }}>Review & edit before saving:</div>
            <div className="space-y-3">
              {[
                { key: 'txn_date', label: 'Date', type: 'date' },
                { key: 'merchant', label: 'Merchant / Source', type: 'text' },
                { key: 'amount', label: 'Amount', type: 'number' },
                { key: 'currency', label: 'Currency', type: 'text' },
                { key: 'category', label: 'Category', type: 'text' },
                { key: 'txn_type', label: 'Type (expense / income)', type: 'text' },
                { key: 'description', label: 'Notes', type: 'text' },
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
              <button onClick={() => { setTranscript(''); setStatus('idle') }} className="flex-1 py-2.5 rounded-lg border text-[12px] font-semibold"
                style={{ borderColor: 'var(--border)', color: 'var(--text3)', background: 'var(--bg2)' }}>
                Re-record
              </button>
              <button onClick={save} className="flex-1 py-2.5 rounded-lg text-white text-[12px] font-bold"
                style={{ background: 'var(--sage)' }}>
                Save
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
            <div className="text-[14px] font-bold" style={{ color: 'var(--text)' }}>Saved!</div>
          </div>
        )}

        {status === 'error' && (
          <div className="flex flex-col items-center py-10 gap-3">
            <AlertCircle size={32} style={{ color: 'var(--rose)' }} />
            <div className="text-[13px]" style={{ color: 'var(--text)' }}>Something went wrong</div>
            <div className="text-[11px] text-center" style={{ color: 'var(--text3)' }}>{errorMsg}</div>
            <button onClick={() => setStatus('idle')} className="px-4 py-2 rounded-lg text-white text-[12px] font-semibold"
              style={{ background: 'var(--sage)' }}>
              Retry
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
