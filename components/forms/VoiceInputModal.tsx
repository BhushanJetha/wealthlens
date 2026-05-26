'use client'
import { useState, useRef, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { X, Mic, MicOff, Loader2, CheckCircle2, AlertCircle } from 'lucide-react'

type InvType = 'mutual_fund' | 'stock' | 'fixed_deposit' | 'recurring_deposit' | 'nps' | 'lic' | 'gold' | 'bond' | 'etf'

const VOICE_HINTS: Record<InvType, string> = {
  mutual_fund:        'e.g. "I have 500 units of Parag Parikh Flex Cap at NAV of 68 rupees, invested 35000"',
  stock:              'e.g. "I bought 10 shares of Reliance on NSE at 2500 rupees average price"',
  fixed_deposit:      'e.g. "HDFC FD of 5 lakhs at 7.1 percent, starts Jan 2024 matures Jan 2026"',
  recurring_deposit:  'e.g. "ICICI RD of 5000 per month for 24 months at 6.5 percent"',
  nps:                'e.g. "NPS Tier 1, corpus 3 lakhs, invested 2.5 lakhs, 60 percent equity"',
  lic:                'e.g. "LIC endowment plan, policy number 12345, sum assured 10 lakhs, premium 50000 annually"',
  gold:               'e.g. "I have 50 grams of physical gold bought at 5800 per gram"',
  bond:               'e.g. "RBI 7.75% taxable bond, 100 units of face value 1000 rupees"',
  etf:                'e.g. "500 units of Nifty BeES ETF on NSE, bought at 220 rupees average"',
}

interface Props { onClose: () => void; investmentType: InvType }

export function VoiceInputModal({ onClose, investmentType }: Props) {
  const [recording, setRecording] = useState(false)
  const [transcript, setTranscript] = useState('')
  const [status, setStatus]         = useState<'idle' | 'recording' | 'parsing' | 'review' | 'saving' | 'done' | 'error'>('idle')
  const [parsed, setParsed]         = useState<Record<string,any>>({})
  const [errorMsg, setErrorMsg]     = useState('')
  const recogRef = useRef<any>(null)
  const router = useRouter()
  const supabase = createClient()

  useEffect(() => { return () => { recogRef.current?.stop() } }, [])

  function startRecording() {
    const SpeechRecognition = (window as any).SpeechRecognition ?? (window as any).webkitSpeechRecognition
    if (!SpeechRecognition) { setErrorMsg('Voice input not supported in this browser. Please use Chrome.'); setStatus('error'); return }
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

  async function parseVoice() {
    if (!transcript.trim()) return
    setStatus('parsing')
    try {
      const res = await fetch('/api/parse-voice-investment', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: transcript, investmentType }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Parsing failed')
      setParsed(data.investment ?? {})
      setStatus('review')
    } catch (e: any) {
      setErrorMsg(e.message)
      setStatus('error')
    }
  }

  async function save() {
    setStatus('saving')
    const { data: { user } } = await supabase.auth.getUser()
    const table = investmentType === 'stock' ? 'stocks' : investmentType === 'mutual_fund' ? 'mutual_funds'
      : investmentType === 'fixed_deposit' ? 'fixed_deposits' : investmentType === 'recurring_deposit' ? 'recurring_deposits'
      : investmentType === 'nps' ? 'nps_accounts' : 'lic_policies'
    await supabase.from(table).insert({ ...parsed, user_id: user!.id })
    setStatus('done')
    router.refresh()
    setTimeout(onClose, 1500)
  }

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
      <div className="wl-card p-6 w-full max-w-md">
        <div className="flex justify-between items-center mb-5">
          <h2 className="text-[15px] font-bold" style={{ color: 'var(--text)' }}>Voice Input</h2>
          <button onClick={onClose} style={{ color: 'var(--text3)' }}><X size={18} /></button>
        </div>

        {(status === 'idle' || status === 'recording') && (
          <>
            <div className="text-[11px] mb-4 p-3 rounded-lg" style={{ background:'var(--bg2)', color:'var(--text3)' }}>
              {VOICE_HINTS[investmentType]}
            </div>

            <div className="flex flex-col items-center gap-4 py-6">
              <button
                onClick={recording ? stopRecording : startRecording}
                className="w-20 h-20 rounded-full flex items-center justify-center transition-all"
                style={{ background: recording ? 'var(--rose-bg)' : 'var(--sage-bg)', border: `3px solid ${recording ? 'var(--rose)' : 'var(--sage)'}` }}>
                {recording
                  ? <MicOff size={32} style={{ color:'var(--rose)' }} />
                  : <Mic size={32} style={{ color:'var(--sage)' }} />}
              </button>
              <div className="text-[12px] font-semibold" style={{ color: recording ? 'var(--rose)' : 'var(--text3)' }}>
                {recording ? '● Recording… tap to stop' : 'Tap to start speaking'}
              </div>
            </div>

            {transcript && (
              <div className="p-3 rounded-lg mb-4 text-[12px]" style={{ background:'var(--bg2)', color:'var(--text)' }}>
                <div className="text-[10px] uppercase tracking-wider mb-1" style={{ color:'var(--text3)' }}>Transcript:</div>
                {transcript}
              </div>
            )}

            {transcript && !recording && (
              <div className="flex gap-3">
                <button onClick={() => { setTranscript(''); setStatus('idle') }} className="flex-1 py-2.5 rounded-lg border text-[12px] font-semibold" style={{ borderColor:'var(--border)', color:'var(--text3)' }}>Clear</button>
                <button onClick={parseVoice} className="flex-1 py-2.5 rounded-lg text-white text-[12px] font-bold" style={{ background:'var(--sage)' }}>
                  Parse with AI
                </button>
              </div>
            )}
          </>
        )}

        {status === 'parsing' && (
          <div className="flex flex-col items-center py-12 gap-3">
            <Loader2 size={32} className="animate-spin" style={{ color:'var(--sage)' }} />
            <div className="text-[13px]" style={{ color:'var(--text)' }}>Parsing your input…</div>
          </div>
        )}

        {status === 'review' && (
          <>
            <div className="text-[12px] font-semibold mb-3" style={{ color:'var(--text2)' }}>Review extracted data:</div>
            <div className="space-y-2 p-3 rounded-lg border text-[11px]" style={{ borderColor:'var(--border)', background:'var(--bg2)' }}>
              {Object.entries(parsed).map(([k,v]) => (
                <div key={k} className="flex justify-between">
                  <span style={{ color:'var(--text3)' }}>{k}:</span>
                  <span className="font-medium" style={{ color:'var(--text)' }}>{String(v)}</span>
                </div>
              ))}
            </div>
            <div className="flex gap-3 mt-4">
              <button onClick={() => { setTranscript(''); setStatus('idle') }} className="flex-1 py-2.5 rounded-lg border text-[12px] font-semibold" style={{ borderColor:'var(--border)', color:'var(--text3)' }}>Re-record</button>
              <button onClick={save} className="flex-1 py-2.5 rounded-lg text-white text-[12px] font-bold" style={{ background:'var(--sage)' }}>Save</button>
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
            <div className="text-[14px] font-bold" style={{ color:'var(--text)' }}>Saved!</div>
          </div>
        )}

        {status === 'error' && (
          <div className="flex flex-col items-center py-10 gap-3">
            <AlertCircle size={32} style={{ color:'var(--rose)' }} />
            <div className="text-[13px]" style={{ color:'var(--text)' }}>Error</div>
            <div className="text-[11px]" style={{ color:'var(--text3)' }}>{errorMsg}</div>
            <button onClick={() => setStatus('idle')} className="px-4 py-2 rounded-lg text-white text-[12px]" style={{ background:'var(--sage)' }}>Retry</button>
          </div>
        )}
      </div>
    </div>
  )
}
