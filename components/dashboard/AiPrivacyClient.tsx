'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Check, X, Eye, Loader2, KeyRound, ShieldCheck, Camera, ExternalLink } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { toast } from '@/components/ui/toaster'
import { PageHeader } from '@/components/ui/kit'

const SENT = [
  'Shares and percentages: savings rate, spending by category, your investment mix, card use of limit',
  'Months: how long your bank balance would last, time left on each goal',
  'Fund and share names, each as a % of what you hold, with its return',
  'Your question, with names and numbers hidden',
  'Amounts only as placeholders like [A1]; the real figure is filled in on your server',
]
const NEVER = [
  'Your name and your family’s names',
  'Bank, account, card and loan names',
  'Account, card, IBAN and phone numbers, and emails',
  'Any amount: net worth, balances, salary, investments, loans',
  'How many accounts, cards or loans you have',
  'PDF statements (always read in the app, never by AI)',
]

function Switch({ on, onChange, disabled, label }: { on: boolean; onChange: (v: boolean) => void; disabled?: boolean; label: string }) {
  return (
    <button role="switch" aria-checked={on} aria-label={label} disabled={disabled} onClick={() => onChange(!on)}
      className="relative w-[46px] h-[26px] rounded-full flex-shrink-0 transition-colors disabled:opacity-40"
      style={{ background: on ? 'var(--accent)' : '#CBD0DC' }}>
      <span className="absolute top-[3px] w-5 h-5 rounded-full bg-white shadow transition-[left]" style={{ left: on ? 23 : 3 }} />
    </button>
  )
}

export default function AiPrivacyClient({ on, photos, keySet }: { on: boolean; photos: boolean; keySet: boolean }) {
  const router = useRouter()
  const [ai, setAi] = useState(on)
  const [pics, setPics] = useState(photos)
  const [busy, setBusy] = useState(false)
  const [preview, setPreview] = useState<string | null>(null)
  const [peeking, setPeeking] = useState(false)

  async function save(patch: { ai?: 'on' | 'off'; ai_photos?: 'on' | 'off' }, msg: string) {
    setBusy(true)
    const supabase = createClient()
    const { error } = await supabase.auth.updateUser({ data: patch })
    // A new sign-in token carries the change to every page straight away
    if (!error) await supabase.auth.refreshSession()
    setBusy(false)
    if (error) { toast(error.message, 'error'); return false }
    toast(msg); router.refresh(); return true
  }
  async function flipAi(v: boolean) {
    setAi(v); if (!v) setPreview(null)
    if (!await save(v ? { ai: 'on' } : { ai: 'off', ai_photos: 'off' }, v ? 'AI is on — names and amounts stay hidden' : 'AI is off — nothing is sent')) setAi(!v)
    else if (!v) setPics(false)
  }
  async function flipPics(v: boolean) {
    setPics(v)
    if (!await save({ ai_photos: v ? 'on' : 'off' }, v ? 'Bill photos can be read by AI' : 'Bill photos stay off')) setPics(!v)
  }
  async function peek() {
    setPeeking(true)
    try {
      const res = await fetch('/api/ai-advisor')
      const j = await res.json()
      setPreview(res.ok ? j.context : (j.details ?? j.error ?? 'Could not build the preview'))
    } catch { setPreview('Network error — try again.') }
    setPeeking(false)
  }

  return (
    <div className="flex flex-col gap-4 animate-fade-up">
      <PageHeader title="AI & privacy" sub="Choose whether WealthLens uses Claude, and see exactly what it gets" />

      <div className="grid md:grid-cols-2 gap-4 wl-even">
        <div className="flex flex-col gap-4">
          <section className="wl-card p-4">
            <div className="flex items-center gap-3">
              <span className="w-9 h-9 rounded-full flex items-center justify-center flex-shrink-0" style={{ background: 'var(--accent-bg)', color: 'var(--accent)' }}><ShieldCheck size={17} /></span>
              <div className="flex-1 min-w-0">
                <div className="text-[14px] font-semibold" style={{ color: 'var(--text)' }}>Use AI</div>
                <div className="text-[12px]" style={{ color: 'var(--text3)' }}>Advisor, “Explain this page”, voice entry and the market view</div>
              </div>
              <Switch on={ai} onChange={flipAi} disabled={busy} label="Use AI" />
            </div>
            <p className="text-[12.5px] mt-3 leading-snug" style={{ color: 'var(--text2)' }}>
              {ai ? 'On. Before anything leaves, names become *** and amounts become placeholders; the answer gets your real figures back on your server.'
                : 'Off. Nothing is sent to Claude. Everything else in WealthLens works the same, and PDF statements are always read in the app.'}
            </p>
            <div className="mt-3 flex items-center gap-1.5 text-[12px]" style={{ color: keySet ? '#0F7B4B' : '#9A5B00' }}>
              <KeyRound size={13} />{keySet ? 'Claude key is set on the server' : 'No Claude key yet — AI needs one to answer (steps below)'}
            </div>
          </section>

          <section className="wl-card p-4">
            <div className="flex items-center gap-3">
              <span className="w-9 h-9 rounded-full flex items-center justify-center flex-shrink-0" style={{ background: 'var(--accent-bg)', color: 'var(--accent)' }}><Camera size={17} /></span>
              <div className="flex-1 min-w-0">
                <div className="text-[14px] font-semibold" style={{ color: 'var(--text)' }}>Read bill photos</div>
                <div className="text-[12px]" style={{ color: 'var(--text3)' }}>Off unless you turn it on</div>
              </div>
              <Switch on={pics} onChange={flipPics} disabled={busy || !ai} label="Read bill photos" />
            </div>
            <p className="text-[12.5px] mt-3 leading-snug" style={{ color: 'var(--text2)' }}>A photo can’t be masked: Claude sees the whole picture, including the amount and anything printed on it. Leave this off to add bills by hand.</p>
          </section>


          <section className="wl-card p-4">
            <div className="text-[14px] font-semibold" style={{ color: 'var(--text)' }}>Add your Claude key</div>
            <ol className="mt-2 flex flex-col gap-2 text-[12.5px] leading-snug list-decimal pl-5" style={{ color: 'var(--text2)' }}>
              <li>Open <a href="https://console.anthropic.com" target="_blank" rel="noreferrer noopener" className="underline inline-flex items-center gap-0.5" style={{ color: 'var(--accent2)' }}>console.anthropic.com<ExternalLink size={11} /></a> and sign up or sign in.</li>
              <li>Go to <b>Billing</b> and add credit (pay as you go). Under <b>Limits</b>, set a monthly spend limit.</li>
              <li>Go to <b>API keys</b> › <b>Create key</b>, name it “WealthLens”, and copy it. It starts with <code>sk-ant-</code> and is shown only once.</li>
              <li>On your computer: open the <code>.env.local</code> file in the WealthLens folder and add the line <code>ANTHROPIC_API_KEY=sk-ant-…</code>. Stop and start <code>npm run dev</code>.</li>
              <li>For the live app: in Vercel, open the project › <b>Settings</b> › <b>Environment Variables</b>, add <code>ANTHROPIC_API_KEY</code> for Production, save, then <b>Redeploy</b>.</li>
              <li>Come back here and turn on <b>Use AI</b>.</li>
            </ol>
            <p className="text-[11.5px] mt-3 leading-snug" style={{ color: 'var(--text4)' }}>The key stays on the server: it’s never in the app’s code, the browser or GitHub (<code>.env.local</code> is never uploaded). If it ever leaks, delete it in the Console and make a new one.</p>
          </section>
        </div>

        <div className="flex flex-col gap-4">
          <section className="wl-card p-4">
            <div className="text-[14px] font-semibold" style={{ color: 'var(--text)' }}>What Claude gets</div>
            <ul className="mt-2 flex flex-col gap-1.5">{SENT.map(s => <li key={s} className="flex gap-2 text-[12.5px] leading-snug" style={{ color: 'var(--text2)' }}><Check size={14} className="flex-shrink-0 mt-[2px]" style={{ color: '#0F7B4B' }} />{s}</li>)}</ul>
            <div className="text-[14px] font-semibold mt-4" style={{ color: 'var(--text)' }}>Never sent</div>
            <ul className="mt-2 flex flex-col gap-1.5">{NEVER.map(s => <li key={s} className="flex gap-2 text-[12.5px] leading-snug" style={{ color: 'var(--text2)' }}><X size={14} className="flex-shrink-0 mt-[2px]" style={{ color: '#B4231A' }} />{s}</li>)}</ul>
            <p className="text-[11.5px] mt-3 leading-snug" style={{ color: 'var(--text4)' }}>Questions about markets, funds or tax rules can make Claude search the web; the search words come from your question, with the same things hidden. A number you say in words (“two lakh”) can’t always be spotted, so say it in digits.</p>
          </section>

          <section className="wl-card p-4 wl-grow flex flex-col">
            <div className="flex items-center justify-between gap-3">
              <div>
                <div className="text-[14px] font-semibold" style={{ color: 'var(--text)' }}>See exactly what’s shared</div>
                <div className="text-[12px]" style={{ color: 'var(--text3)' }}>The advisor’s view of your money, word for word. Nothing is sent to see it.</div>
              </div>
              <button onClick={peek} disabled={!ai || peeking} className="wl-btn flex-shrink-0 disabled:opacity-50" style={{ height: 34 }}>
                {peeking ? <Loader2 size={14} className="animate-spin" /> : <Eye size={14} />}Show
              </button>
            </div>
            {!preview && (
              <div className="mt-3 flex-1 rounded-lg p-3 text-[12px] leading-relaxed" style={{ background: '#F5F6FA', color: 'var(--text3)', border: '1px dashed var(--border)' }}>
                {ai ? 'Press Show to see the exact text.' : 'Turn AI on to see it.'} Its lines read like “spending is 64% of income (usually 58%)” or “net worth [A1]”; a placeholder like [A1] turns back into your figure only on your screen.
              </div>
            )}
            {preview && <pre className="mt-3 flex-1 min-h-[160px] max-h-[520px] overflow-auto rounded-lg p-3 text-[11.5px] leading-relaxed whitespace-pre-wrap" style={{ background: '#F5F6FA', color: 'var(--text2)', border: '1px solid var(--border)' }}>{preview}</pre>}
          </section>
        </div>
      </div>
    </div>
  )
}
