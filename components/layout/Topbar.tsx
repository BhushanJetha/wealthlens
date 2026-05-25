'use client'
import { useViewStore } from '@/store/viewStore'
import { ArrowLeftRight, Bell, User } from 'lucide-react'

const FX = process.env.NEXT_PUBLIC_AED_TO_INR ?? '22.80'

export default function Topbar({ user }: { user: any }) {
  const { view, setView } = useViewStore()

  const views = [
    { key: 'uae',          label: '🇦🇪 UAE (AED)' },
    { key: 'india',        label: '🇮🇳 India (INR)' },
    { key: 'consolidated', label: '🌐 Consolidated' },
  ] as const

  return (
    <header className="bg-[#162032] border-b border-white/7 px-5 py-2.5 flex items-center gap-3 flex-wrap min-h-[52px]">
      <span className="text-[10px] text-slate-500 uppercase tracking-widest font-semibold">View:</span>

      <div className="flex gap-1.5">
        {views.map(v => (
          <button key={v.key} onClick={() => setView(v.key)}
            className={`px-3 py-1.5 rounded-md text-[11px] font-semibold transition-all border ${
              view === v.key
                ? 'bg-[#00C9A7] border-[#00C9A7] text-black'
                : 'bg-transparent border-white/10 text-slate-400 hover:bg-white/5 hover:text-slate-200'
            }`}>
            {v.label}
          </button>
        ))}
      </div>

      <div className="flex items-center gap-1.5 bg-[#1E2D40] border border-white/10 rounded-lg px-3 py-1.5 text-[11px]">
        <ArrowLeftRight size={11} className="text-slate-500" />
        <span className="text-slate-400">1 AED =</span>
        <span className="text-[#F4A535] font-bold font-mono">₹{FX}</span>
      </div>

      <div className="ml-auto flex items-center gap-3">
        <button className="relative p-1.5 text-slate-400 hover:text-white transition-colors">
          <Bell size={16} />
          <span className="absolute top-0.5 right-0.5 w-2 h-2 bg-[#E8556D] rounded-full" />
        </button>
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 rounded-full bg-[#00C9A7]/20 flex items-center justify-center">
            <User size={13} className="text-[#00C9A7]" />
          </div>
          <span className="text-[12px] text-slate-300 font-medium">{user?.full_name?.split(' ')[0] ?? 'User'}</span>
        </div>
      </div>
    </header>
  )
}
