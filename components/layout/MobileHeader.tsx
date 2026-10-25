'use client'
import { usePathname } from 'next/navigation'
import { Search } from 'lucide-react'
import { useUiStore } from '@/store/uiStore'
import HolderChips from './HolderChips'
import ViewSwitch from './ViewSwitch'
import MonthPicker from './MonthPicker'
import NotificationsPanel from './NotificationsPanel'

// Phones only. The design has no app bar: family chips sit at the top of every
// screen and scroll with it; outside Home the view + period controls follow.
// (Home places its own greeting row and controls — see DashboardClient.)
export default function MobileHeader({ firstName }: { firstName: string | null }) {
  const pathname = usePathname()
  const own = pathname === '/dashboard' || pathname === '/dashboard/more' || pathname.startsWith('/dashboard/settings')
  return (
    <div className="md:hidden no-print flex flex-col gap-3 mb-3.5">
      <div className="-mx-4 px-4 overflow-x-auto no-scrollbar">
        <HolderChips firstName={firstName} />
      </div>
      {!own && <MobileControls />}
    </div>
  )
}

// Segmented UAE / India / All + period pill, optionally with bell and ✦
export function MobileControls({ actions = true }: { actions?: boolean }) {
  return (
    <div className="flex items-center gap-2">
      <ViewSwitch segmented className="flex-1 min-w-0" />
      <MonthPicker compact />
      {actions && <NotificationsPanel round />}
      {actions && <AskAiButton />}
    </div>
  )
}

export function RoundButton({ label, onClick, children }: { label: string; onClick: () => void; children: React.ReactNode }) {
  return (
    <button onClick={onClick} aria-label={label}
      className="w-9 h-9 rounded-full flex items-center justify-center flex-shrink-0"
      style={{ background: '#fff', border: '1px solid var(--border)', color: 'var(--text2)' }}>
      {children}
    </button>
  )
}

export function SearchButton() {
  const { setPaletteOpen } = useUiStore()
  return <RoundButton label="Search" onClick={() => setPaletteOpen(true)}><Search size={16} /></RoundButton>
}

export function AskAiButton({ wide }: { wide?: boolean }) {
  const { openAdvisor } = useUiStore()
  return (
    <button onClick={() => openAdvisor()} aria-label="Ask AI advisor"
      className={`h-9 rounded-full flex items-center justify-center flex-shrink-0 text-[12.5px] font-semibold text-white ${wide ? 'px-3' : 'w-9'}`}
      style={{ background: 'var(--accent)' }}>✦</button>
  )
}
