'use client'
import { useViewStore } from '@/store/viewStore'

const VIEWS = [
  { key: 'uae',          label: 'UAE · AED',    short: 'UAE' },
  { key: 'india',        label: 'India · INR',  short: 'India' },
  { key: 'consolidated', label: 'Consolidated', short: 'All' },
] as const

// UAE / India / Consolidated. Desktop: compact pill group in the app bar.
// `segmented`: the phone design's full-width segmented control.
export default function ViewSwitch({ segmented, className = '' }: { segmented?: boolean; className?: string }) {
  const { view, setView } = useViewStore()
  return (
    <div role="radiogroup" aria-label="Country view"
      className={`flex flex-shrink-0 ${segmented ? 'p-[3px] rounded-[10px]' : 'p-0.5 rounded-lg'} ${className}`}
      style={segmented ? { background: '#E8EAF0' } : { background: 'var(--bg2)', border: '1px solid var(--border)' }}>
      {VIEWS.map(v => {
        const on = view === v.key
        return (
          <button key={v.key} onClick={() => setView(v.key)} role="radio" aria-checked={on}
            className={segmented
              ? 'flex-1 h-[30px] rounded-lg text-[13px] whitespace-nowrap transition-all'
              : 'px-3 h-7 rounded-md text-[12px] whitespace-nowrap transition-all'}
            style={on
              ? { background: '#fff', color: 'var(--text)', fontWeight: 600, boxShadow: '0 1px 2px rgba(15,23,42,0.12)' }
              : { color: 'var(--text3)', fontWeight: 500 }}>
            {segmented ? v.short : <><span className="hidden xl:inline">{v.label}</span><span className="xl:hidden">{v.short}</span></>}
          </button>
        )
      })}
    </div>
  )
}
