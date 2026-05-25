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
      setTimeout(() => setToasts(p => p.filter(t => t.id !== id)), 4000)
    }
  }, [])

  return (
    <div className="fixed bottom-20 right-6 z-[200] flex flex-col gap-2">
      {toasts.map(t => (
        <div key={t.id} className={`flex items-center gap-3 px-4 py-3 rounded-xl shadow-xl text-[13px] font-medium animate-fade-up border ${
          t.type === 'success' ? 'bg-[#162032] border-[#00C9A7]/30 text-white' : 'bg-[#162032] border-rose-500/30 text-white'
        }`}>
          {t.type === 'success' ? <CheckCircle size={15} className="text-[#00C9A7]" /> : <AlertCircle size={15} className="text-rose-400" />}
          {t.message}
          <button onClick={() => setToasts(p => p.filter(x => x.id !== t.id))} className="ml-2 text-slate-500 hover:text-white">
            <X size={13} />
          </button>
        </div>
      ))}
    </div>
  )
}
