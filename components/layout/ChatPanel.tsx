'use client'
import { useState, useRef, useEffect } from 'react'
import { Sparkles, X, Send, Bot, User } from 'lucide-react'

interface Message { role: 'user' | 'assistant'; content: string; ts: number }

const SUGGESTIONS = [
  'Review my credit card utilization',
  'Am I on track with my monthly budget?',
  'How is my net worth trending?',
  'Which loan should I prepay first?',
  'Summarize my investment returns',
]

export default function ChatPanel({ userId }: { userId: string }) {
  const [open, setOpen] = useState(false)
  const [messages, setMessages] = useState<Message[]>([
    { role: 'assistant', content: "👋 Hi! I'm your WealthLens AI advisor, powered by Gemini. I have read-only access to your complete financial portfolio across UAE and India. Ask me anything — budget analysis, investment review, loan strategy, or credit optimization.", ts: Date.now() }
  ])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const bottomRef = useRef<HTMLDivElement>(null)

  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: 'smooth' }) }, [messages])

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
    } catch (e: any) {
      setMessages(prev => [...prev, { role: 'assistant', content: 'Network error — please check your connection and try again.', ts: Date.now() }])
    }
    setLoading(false)
  }

  return (
    <>
      {/* Toggle button */}
      <button onClick={() => setOpen(!open)}
        className="fixed bottom-6 right-6 z-50 w-12 h-12 rounded-full flex items-center justify-center text-black shadow-lg transition-transform hover:scale-105"
        style={{ background: 'linear-gradient(135deg,#7C5CBF,#00C9A7)' }}>
        {open ? <X size={18} /> : <Sparkles size={18} />}
      </button>

      {/* Panel */}
      <div className={`fixed right-0 top-0 bottom-0 w-[340px] bg-[#162032] border-l border-white/7 flex flex-col z-40 transition-transform duration-300 ${open ? 'translate-x-0' : 'translate-x-full'}`}>
        {/* Header */}
        <div className="p-4 border-b border-white/7 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-lg flex items-center justify-center" style={{ background: 'linear-gradient(135deg,#7C5CBF,#00C9A7)' }}>
              <Sparkles size={13} className="text-white" />
            </div>
            <div>
              <div className="text-[12px] font-bold text-[#00C9A7]">WealthLens AI</div>
              <div className="text-[9px] text-slate-500 uppercase tracking-wider">Powered by Gemini</div>
            </div>
          </div>
          <button onClick={() => setOpen(false)} className="text-slate-500 hover:text-white transition-colors">
            <X size={16} />
          </button>
        </div>

        {/* Messages */}
        <div className="flex-1 overflow-y-auto p-4 space-y-3">
          {messages.map((m, i) => (
            <div key={i} className={`flex gap-2 ${m.role === 'user' ? 'flex-row-reverse' : ''}`}>
              <div className={`w-6 h-6 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5 ${m.role === 'user' ? 'bg-[#4A90D9]/20' : 'bg-[#00C9A7]/15'}`}>
                {m.role === 'user' ? <User size={11} className="text-[#4A90D9]" /> : <Bot size={11} className="text-[#00C9A7]" />}
              </div>
              <div className={`max-w-[82%] px-3 py-2.5 rounded-xl text-[12px] leading-relaxed whitespace-pre-wrap ${
                m.role === 'user'
                  ? 'bg-[#00C9A7] text-black font-medium rounded-br-sm'
                  : 'bg-[#1E2D40] text-slate-200 rounded-bl-sm border border-white/6'
              }`}>
                {m.content}
              </div>
            </div>
          ))}

          {loading && (
            <div className="flex gap-2">
              <div className="w-6 h-6 rounded-full bg-[#00C9A7]/15 flex items-center justify-center flex-shrink-0">
                <Bot size={11} className="text-[#00C9A7]" />
              </div>
              <div className="bg-[#1E2D40] border border-white/6 rounded-xl rounded-bl-sm px-4 py-3 flex gap-1.5">
                {[0,1,2].map(i => (
                  <div key={i} className="w-2 h-2 rounded-full bg-slate-500 typing-dot" style={{ animationDelay: `${i*0.2}s` }} />
                ))}
              </div>
            </div>
          )}

          {/* Suggestions (show only at start) */}
          {messages.length <= 1 && !loading && (
            <div className="space-y-2 mt-2">
              <p className="text-[10px] text-slate-500 uppercase tracking-wider font-semibold">Quick questions</p>
              {SUGGESTIONS.map(s => (
                <button key={s} onClick={() => send(s)}
                  className="w-full text-left text-[11px] text-slate-400 bg-[#1E2D40] hover:bg-[#1E2D40]/80 border border-white/6 rounded-lg px-3 py-2 transition-colors hover:text-slate-200">
                  {s}
                </button>
              ))}
            </div>
          )}
          <div ref={bottomRef} />
        </div>

        {/* Input */}
        <div className="p-3 border-t border-white/7">
          <div className="flex gap-2">
            <input
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && !e.shiftKey && send()}
              placeholder="Ask your financial advisor…"
              disabled={loading}
              className="flex-1 bg-[#1E2D40] border border-white/10 rounded-lg px-3 py-2.5 text-[12px] text-white placeholder-slate-600 focus:outline-none focus:border-[#00C9A7] transition-colors disabled:opacity-50"
            />
            <button onClick={() => send()} disabled={loading || !input.trim()}
              className="w-9 h-9 rounded-lg flex items-center justify-center text-black disabled:opacity-40 transition-all"
              style={{ background: 'linear-gradient(135deg,#00C9A7,#4A90D9)' }}>
              <Send size={14} />
            </button>
          </div>
          <p className="text-[9px] text-slate-600 text-center mt-1.5">Read-only access to your data · End-to-end encrypted</p>
        </div>
      </div>
    </>
  )
}
