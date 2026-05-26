'use client'
import { useViewStore } from '@/store/viewStore'
import { ArrowLeftRight, User, Calendar } from 'lucide-react'
import NotificationsPanel from './NotificationsPanel'

const FX = process.env.NEXT_PUBLIC_AED_TO_INR ?? '22.80'

export default function Topbar({ user }: { user: any }) {
  const { view, setView } = useViewStore()

  const views = [
    { key: 'uae',          label: '🇦🇪 UAE' },
    { key: 'india',        label: '🇮🇳 India' },
    { key: 'consolidated', label: '🌐 All' },
  ] as const

  const now = new Date()
  const month = now.toLocaleDateString('en-GB', { month: 'long', year: 'numeric' })

  return (
    <header className="px-5 py-3 flex items-center gap-3 flex-wrap min-h-[52px]"
      style={{ background: 'var(--card)', borderBottom: '1px solid var(--border)' }}>

      <div className="flex items-center gap-1.5 text-[11px]" style={{ color: 'var(--text3)' }}>
        <Calendar size={13} />
        <span>{month}</span>
      </div>

      <div className="flex gap-1 ml-1">
        {views.map(v => (
          <button key={v.key} onClick={() => setView(v.key)}
            className="px-3 py-1.5 rounded-lg text-[11px] font-semibold transition-all border"
            style={view === v.key ? {
              background: 'var(--sage)',
              borderColor: 'var(--sage)',
              color: '#fff',
            } : {
              background: 'transparent',
              borderColor: 'var(--border)',
              color: 'var(--text3)',
            }}>
            {v.label}
          </button>
        ))}
      </div>

      <div className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-[11px]"
        style={{ background: 'var(--bg2)', border: '1px solid var(--border)' }}>
        <ArrowLeftRight size={11} style={{ color: 'var(--text3)' }} />
        <span style={{ color: 'var(--text3)' }}>1 AED =</span>
        <span className="font-bold font-mono" style={{ color: 'var(--gold)' }}>₹{FX}</span>
      </div>

      <div className="ml-auto flex items-center gap-3">
        <NotificationsPanel />
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 rounded-full flex items-center justify-center" style={{ background: 'var(--sage-bg)' }}>
            <User size={13} style={{ color: 'var(--sage)' }} />
          </div>
          <span className="text-[12px] font-medium" style={{ color: 'var(--text2)' }}>
            {user?.full_name?.split(' ')[0] ?? 'User'}
          </span>
        </div>
      </div>
    </header>
  )
}
