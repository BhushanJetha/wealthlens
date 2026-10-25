'use client'
import { useState } from 'react'
import { Route, HeartPulse } from 'lucide-react'

// Financial Health = the personal Freedom Check (stage, checklist, plan) plus
// the original Health Score & learning page.
export default function FinancialHealthTabs({ check, score }: { check: React.ReactNode; score: React.ReactNode }) {
  const [tab, setTab] = useState<'check' | 'score'>('check')
  const TABS = [
    { key: 'check' as const, label: 'Freedom Check', icon: Route },
    { key: 'score' as const, label: 'Health Score', icon: HeartPulse },
  ]
  return (
    <div className="space-y-5 animate-fade-up">
      <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-3">
        <div>
          <h1 className="text-[22px] md:text-[24px] font-bold tracking-[-0.01em]" style={{ color: 'var(--text)' }}>Financial Health</h1>
          <p className="text-[12px] mt-0.5" style={{ color: 'var(--text3)' }}>Where you stand today, and the next steps to financial freedom</p>
        </div>
        <div className="flex gap-1 p-1 rounded-xl w-fit wl-tabs" style={{ background: 'var(--bg2)', border: '1px solid var(--border)' }}>
          {TABS.map(({ key, label, icon: Icon }) => (
            <button key={key} onClick={() => setTab(key)}
              className="flex items-center gap-1.5 px-4 py-1.5 rounded-lg text-[12px] font-bold transition-all"
              style={tab === key ? { background: '#fff', color: 'var(--text)', boxShadow: '0 1px 3px rgba(0,0,0,0.08)' } : { color: 'var(--text3)' }}>
              <Icon size={13} /> {label}
            </button>
          ))}
        </div>
      </div>
      {tab === 'check' ? check : score}
    </div>
  )
}
