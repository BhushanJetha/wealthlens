'use client'
import { useState, useRef, useEffect } from 'react'
import { X, ArrowUp } from 'lucide-react'
import { useUiStore } from '@/store/uiStore'

interface Message { role: 'user' | 'assistant'; content: string; ts: number }

const SUGGESTIONS = [
  'Why did my spending rise?',
  'Can I prepay my home loan?',
  'Is my portfolio balanced?',
  'Can I afford a ₹5L car loan?',
  'How can I save tax this year?',
]

// AI advisor — docked right of the content on desktop (330px, per the design),
// full-screen sheet on phones. Opened from the Topbar "Ask AI", Home, or the
// palette via useUiStore; `advisorPrompt` is sent automatically on open.
export default function ChatPanel() {
  const { advisorOpen, advisorPrompt, closeAdvisor, clearAdvisorPrompt } = useUiStore()
  const [messages, setMessages] = useState<Message[]>([
    { role: 'assistant', content: 'Hi — I can see your full portfolio, read-only. Ask me anything about your money.', ts: Date.now() }
  ])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const bottomRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: 'smooth' }) }, [messages, loading])
  useEffect(() => { if (advisorOpen) setTimeout(() => inputRef.current?.focus(), 50) }, [advisorOpen])
  useEffect(() => {
    if (advisorOpen && advisorPrompt) { send(advisorPrompt); clearAdvisorPrompt() }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [advisorOpen, advisorPrompt])

  async function send(text?: string) {
    const msg = (text ?? input).trim()
    if (!msg || loading) return
    setInput('')
    const userMsg: Message = { role: 'user', content: msg, ts: Date.now() }
    setMessages(prev => [...prev, userMsg])
    setLoading(true)

    try {
      const res = await fetch('/api/ai-advisor', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: msg, history: messages.slice(-10) })
      })
      if (!res.ok) {
        const errText = await res.text().catch(() => '')
        let errMsg = 'Something went wrong. Please try again.'
        try { const j = JSON.parse(errText); errMsg = j.details || j.error || errMsg } catch { /* ignore */ }
        setMessages(prev => [...prev, { role: 'assistant', content: errMsg, ts: Date.now() }])
      } else {
        const data = await res.json()
        setMessages(prev => [...prev, { role: 'assistant', content: data.response ?? 'No response received.', ts: Date.now() }])
      }
    } catch {
      setMessages(prev => [...prev, { role: 'assistant', content: 'Network error — please check your connection and try again.', ts: Date.now() }])
    }
    setLoading(false)
  }

  if (!advisorOpen) return null
  const asked = new Set(messages.filter(m => m.role === 'user').map(m => m.content))
  const asks = SUGGESTIONS.filter(s => !asked.has(s)).slice(0, 3)

  return (
    <aside aria-label="AI advisor"
      className="fixed inset-0 z-50 md:static md:z-auto md:w-[330px] md:flex-shrink-0 flex flex-col animate-slide-right"
      style={{ background: '#fff', borderLeft: '1px solid var(--line)' }}>
      <div className="h-[52px] flex items-center justify-between px-4 flex-shrink-0 safe-top" style={{ borderBottom: '1px solid var(--border)' }}>
        <div className="text-[14px] font-semibold" style={{ color: 'var(--text)' }}>✦ AI advisor</div>
        <button onClick={closeAdvisor} aria-label="Close AI advisor" className="w-8 h-8 rounded-lg flex items-center justify-center hover:bg-slate-50" style={{ color: 'var(--text3)' }}>
          <X size={16} />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-3.5 flex flex-col gap-2.5" aria-live="polite">
        {messages.map((m, i) => (
          <div key={i} className="text-[13px] leading-relaxed whitespace-pre-wrap px-3 py-2.5 max-w-[92%]"
            style={m.role === 'user'
              ? { alignSelf: 'flex-end', background: 'var(--accent)', color: '#fff', borderRadius: '12px 12px 3px 12px' }
              : { background: '#F1F5F9', color: 'var(--text)', borderRadius: '12px 12px 12px 3px' }}>
            {m.content}
          </div>
        ))}
        {loading && (
          <div className="px-3 py-2.5 text-[13px] flex gap-1.5 items-center" style={{ background: '#F1F5F9', borderRadius: '12px 12px 12px 3px', color: 'var(--text3)', alignSelf: 'flex-start' }}>
            {[0, 1, 2].map(i => <span key={i} className="w-1.5 h-1.5 rounded-full bg-slate-400 typing-dot" />)}
          </div>
        )}
        <div ref={bottomRef} />
      </div>

      <div className="p-3.5 pt-2.5 flex flex-col gap-1.5 safe-bottom" style={{ borderTop: '1px solid #F1F5F9' }}>
        {asks.map(q => (
          <button key={q} onClick={() => send(q)} disabled={loading}
            className="text-left rounded-full px-3 py-[7px] text-[12px] font-medium disabled:opacity-50"
            style={{ border: '1px solid var(--accent-border)', background: 'var(--accent-bg)', color: 'var(--accent2)' }}>
            {q}
          </button>
        ))}
        <div className="flex gap-1.5 mt-1">
          <input ref={inputRef} value={input} onChange={e => setInput(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && !e.shiftKey && send()}
            placeholder="Ask about your money…" aria-label="Ask about your money" disabled={loading}
            className="flex-1 h-[38px] rounded-[9px] px-3 text-[13px] outline-none disabled:opacity-60"
            style={{ border: '1px solid var(--accent-border)', background: '#fff', color: 'var(--text)' }} />
          <button onClick={() => send()} disabled={loading || !input.trim()} aria-label="Send"
            className="w-[38px] h-[38px] rounded-[9px] flex items-center justify-center text-white disabled:opacity-40"
            style={{ background: 'var(--accent)' }}>
            <ArrowUp size={16} />
          </button>
        </div>
        <p className="text-[10.5px] text-center mt-0.5" style={{ color: 'var(--text4)' }}>Read-only access · educational guidance, not regulated advice</p>
      </div>
    </aside>
  )
}
