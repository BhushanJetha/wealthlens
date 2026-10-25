'use client'
import { useEffect, useState } from 'react'
import { CheckCircle, AlertCircle, X } from 'lucide-react'

interface Toast { id: number; message: string; type: 'success' | 'error' }
let addToast: (msg: string, type?: 'success' | 'error') => void = () => {}

export function toast(msg: string, type: 'success' | 'error' = 'success') { addToast(msg, type) }

export function Toaster() {
  const [toasts, setToasts] = useState<Toast[]>([])
  useEffect(() => {
    addToast = (message, type = 'success') => {
      const id = Date.now()
      setToasts(p => [...p, { id, message, type }])
      setTimeout(() => setToasts(p => p.filter(t => t.id !== id)), type === 'error' ? 4000 : 2200)
    }
  }, [])

  return (
    <div className="fixed left-1/2 -translate-x-1/2 bottom-[calc(env(safe-area-inset-bottom,0px)+84px)] md:bottom-7 z-[200] flex flex-col items-center gap-2 pointer-events-none" role="status" aria-live="polite">
      {toasts.map(t => (
        <div key={t.id} className="pointer-events-auto flex items-center gap-2 pl-4 pr-2.5 py-2.5 rounded-full text-[13px] font-medium animate-fade-up max-w-[92vw]"
          style={{ background: t.type === 'success' ? '#0F172A' : '#B4231A', color: '#fff', boxShadow: '0 8px 24px rgba(15,23,42,.3)' }}>
          {t.type === 'success' ? <CheckCircle size={15} style={{ color: '#4ADE80' }} /> : <AlertCircle size={15} />}
          <span className="truncate">{t.message}</span>
          <button onClick={() => setToasts(p => p.filter(x => x.id !== t.id))} aria-label="Dismiss" className="ml-1 opacity-60 hover:opacity-100">
            <X size={13} />
          </button>
        </div>
      ))}
    </div>
  )
}
