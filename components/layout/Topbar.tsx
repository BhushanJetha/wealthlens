'use client'
import { useState, useRef, useEffect } from 'react'
import { useViewStore } from '@/store/viewStore'
import { usePathname } from 'next/navigation'
import { ChevronLeft, ChevronRight, Calendar, X, Search } from 'lucide-react'
import NotificationsPanel from './NotificationsPanel'
import HolderChips from './HolderChips'
import BankStatementUploadModal from '@/components/forms/BankStatementUploadModal'
import { useUiStore } from '@/store/uiStore'
import { resolveNav } from '@/lib/nav'

const MONTH_NAMES = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']
const MONTH_NAMES_LONG = ['January','February','March','April','May','June','July','August','September','October','November','December']

function ym(year: number, month: number) {
  return `${year}-${String(month).padStart(2, '0')}`
}

function parseYM(s: string): [number, number] {
  return [Number(s.slice(0, 4)), Number(s.slice(5, 7))]
}

function addMonths(ym_str: string, delta: number): string {
  const [y, m] = parseYM(ym_str)
  const d = new Date(y, m - 1 + delta, 1)
  return ym(d.getFullYear(), d.getMonth() + 1)
}

function formatRange(from: string, to: string): string {
  const [fy, fm] = parseYM(from)
  const [ty, tm] = parseYM(to)
  if (from === to) return `${MONTH_NAMES_LONG[fm - 1]} ${fy}`
  if (fy === ty) return `${MONTH_NAMES[fm - 1]} – ${MONTH_NAMES[tm - 1]} ${fy}`
  return `${MONTH_NAMES[fm - 1]} ${fy} – ${MONTH_NAMES[tm - 1]} ${ty}`
}

function MonthRangePicker({ from, to, onApply, onClose }: {
  from: string; to: string;
  onApply: (from: string, to: string) => void;
  onClose: () => void;
}) {
  const [pickYear, setPickYear] = useState(parseYM(to)[0])
  const [draft, setDraft] = useState<{ from: string; to: string | null }>({ from, to })
  const [selecting, setSelecting] = useState<'from' | 'to'>('from')
  const [hovered, setHovered] = useState<string | null>(null)

  function clickMonth(m: string) {
    if (selecting === 'from') {
      setDraft({ from: m, to: null })
      setSelecting('to')
    } else {
      const [a, b] = m < draft.from ? [m, draft.from] : [draft.from, m]
      setDraft({ from: a, to: b })
      setSelecting('from')
    }
  }

  function isInRange(m: string): boolean {
    const endPoint = draft.to ?? hovered ?? draft.from
    const lo = draft.from < endPoint ? draft.from : endPoint
    const hi = draft.from < endPoint ? endPoint : draft.from
    return m >= lo && m <= hi
  }

  function isEdge(m: string): boolean {
    const endPoint = draft.to ?? hovered ?? draft.from
    const lo = draft.from < endPoint ? draft.from : endPoint
    const hi = draft.from < endPoint ? endPoint : draft.from
    return m === lo || m === hi
  }

  function apply() {
    const finalTo = draft.to ?? draft.from
    onApply(draft.from, finalTo)
    onClose()
  }

  function selectPreset(months: number) {
    const now = new Date().toISOString().slice(0, 7)
    const start = addMonths(now, -(months - 1))
    setDraft({ from: start, to: now })
    setPickYear(parseYM(now)[0])
    setSelecting('from')
  }

  return (
    <div className="absolute top-full left-0 mt-2 z-50 rounded-2xl shadow-2xl overflow-hidden w-[340px] max-md:fixed max-md:left-3 max-md:right-3 max-md:top-16 max-md:mt-0 max-md:w-auto"
      style={{ background: '#fff', border: '1px solid var(--border)' }}>

      {/* Presets */}
      <div className="flex gap-1.5 p-3 pb-0">
        {[['This month', 1], ['Last 3M', 3], ['Last 6M', 6], ['This year', 12]].map(([label, n]) => (
          <button key={label} onClick={() => selectPreset(Number(n))}
            className="flex-1 py-1.5 rounded-lg text-[10px] font-semibold border transition-all"
            style={{ borderColor: 'var(--border)', color: 'var(--text3)', background: 'var(--bg2)' }}
            onMouseEnter={e => { e.currentTarget.style.background = 'var(--sage-bg)'; e.currentTarget.style.color = 'var(--sage)' }}
            onMouseLeave={e => { e.currentTarget.style.background = 'var(--bg2)'; e.currentTarget.style.color = 'var(--text3)' }}>
            {label}
          </button>
        ))}
      </div>

      {/* Year navigation */}
      <div className="flex items-center justify-between px-4 pt-3 pb-1">
        <button onClick={() => setPickYear(y => y - 1)}
          className="p-1 rounded-lg hover:bg-gray-100 transition-colors"
          style={{ color: 'var(--text3)' }}>
          <ChevronLeft size={14} />
        </button>
        <span className="text-[13px] font-bold" style={{ color: 'var(--text)' }}>{pickYear}</span>
        <button onClick={() => setPickYear(y => y + 1)}
          className="p-1 rounded-lg hover:bg-gray-100 transition-colors"
          style={{ color: 'var(--text3)' }}>
          <ChevronRight size={14} />
        </button>
      </div>

      {/* Month grid */}
      <div className="grid grid-cols-4 gap-1 px-3 pb-3">
        {MONTH_NAMES.map((name, idx) => {
          const mStr = ym(pickYear, idx + 1)
          const inRange = isInRange(mStr)
          const edge = isEdge(mStr)
          return (
            <button key={name}
              onClick={() => clickMonth(mStr)}
              onMouseEnter={() => setHovered(mStr)}
              onMouseLeave={() => setHovered(null)}
              className="py-2 rounded-lg text-[12px] font-semibold transition-all"
              style={edge
                ? { background: 'var(--sage)', color: '#fff' }
                : inRange
                  ? { background: 'var(--sage-bg)', color: 'var(--sage)' }
                  : { background: 'transparent', color: 'var(--text2)' }}>
              {name}
            </button>
          )
        })}
      </div>

      {/* Status + actions */}
      <div className="px-3 pb-3 space-y-2">
        <div className="flex items-center gap-2 text-[11px] p-2 rounded-lg" style={{ background: 'var(--bg2)' }}>
          <Calendar size={12} style={{ color: 'var(--sage)' }} />
          <span style={{ color: 'var(--text3)' }}>
            {selecting === 'to' && !draft.to
              ? 'Now click an end month'
              : draft.to
                ? formatRange(draft.from, draft.to)
                : `${MONTH_NAMES_LONG[parseYM(draft.from)[1] - 1]} ${parseYM(draft.from)[0]}`}
          </span>
        </div>
        <div className="flex gap-2">
          <button onClick={onClose} className="flex-1 py-2 rounded-lg border text-[11px] font-semibold"
            style={{ borderColor: 'var(--border)', color: 'var(--text3)', background: 'var(--bg2)' }}>
            Cancel
          </button>
          <button onClick={apply}
            className="flex-1 py-2 rounded-lg text-white text-[11px] font-bold"
            style={{ background: 'var(--sage)' }}>
            Apply
          </button>
        </div>
      </div>
    </div>
  )
}

export default function Topbar({ user }: { user: any }) {
  const { view, setView, fromMonth, toMonth, setDateRange, setFxRate } = useViewStore()
  const { uploadOpen, setUploadOpen, setPaletteOpen, advisorOpen, openAdvisor, closeAdvisor } = useUiStore()
  const [pickerOpen,  setPickerOpen]  = useState(false)
  const deskRef = useRef<HTMLDivElement>(null)
  const mobRef  = useRef<HTMLDivElement>(null)
  const pathname = usePathname()
  const { section, tab, sub } = resolveNav(pathname)
  const crumbs = [section?.label ?? 'WealthLens', tab && tab.label !== section?.label ? tab.label : null, sub && sub.label !== 'Overview' ? sub.label : null]
    .filter(Boolean) as string[]
  const firstName = (user?.full_name ?? '').split(' ')[0] || null

  // Fetch live AED→INR rate once on mount; store in viewStore so all pages share it
  useEffect(() => {
    fetch('/api/fx-rate')
      .then(r => r.json())
      .then(d => { if (d.rate && d.rate > 1) setFxRate(Number(d.rate)) })
      .catch(() => {})
  }, [])

  // Close picker when clicking outside
  useEffect(() => {
    if (!pickerOpen) return
    // The picker renders in both the desktop and mobile headers (one hidden)
    function handler(e: MouseEvent) {
      const t = e.target as Node
      if (!deskRef.current?.contains(t) && !mobRef.current?.contains(t)) setPickerOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [pickerOpen])

  const views = [
    { key: 'uae',          label: 'UAE · AED',    short: 'UAE' },
    { key: 'india',        label: 'India · INR',  short: 'India' },
    { key: 'consolidated', label: 'Consolidated', short: 'All' },
  ] as const

  const isSingleMonth = fromMonth === toMonth

  function shiftRange(delta: number) {
    if (isSingleMonth) {
      const m = addMonths(fromMonth, delta)
      setDateRange(m, m)
    } else {
      setDateRange(addMonths(fromMonth, delta), addMonths(toMonth, delta))
    }
  }

  const monthPicker = (ref: React.RefObject<HTMLDivElement>) => (
    <div ref={ref} className="relative flex items-center flex-shrink-0">
      <div className="flex items-center rounded-lg overflow-hidden h-8"
        style={{ border: '1px solid var(--border)', background: '#fff' }}>
        <button onClick={() => shiftRange(-1)} aria-label="Previous period"
          className="hidden sm:block px-1.5 h-full transition-colors hover:bg-slate-50" style={{ color: 'var(--text3)' }}>
          <ChevronLeft size={14} />
        </button>
        <button onClick={() => setPickerOpen(p => !p)} aria-haspopup="dialog" aria-expanded={pickerOpen}
          className="flex items-center gap-1.5 px-2 h-full transition-colors hover:bg-slate-50 sm:border-x"
          style={{ borderColor: 'var(--border)' }}>
          <Calendar size={13} style={{ color: 'var(--accent)' }} />
          <span className="text-[12.5px] font-semibold whitespace-nowrap" style={{ color: 'var(--text)' }}>
            {formatRange(fromMonth, toMonth)}
          </span>
        </button>
        {!isSingleMonth && (
          <button onClick={() => { const m = new Date().toISOString().slice(0, 7); setDateRange(m, m) }}
            aria-label="Back to this month" className="px-1 h-full opacity-60 hover:opacity-100" style={{ color: 'var(--text3)' }}>
            <X size={11} />
          </button>
        )}
        <button onClick={() => shiftRange(1)} aria-label="Next period"
          className="hidden sm:block px-1.5 h-full transition-colors hover:bg-slate-50" style={{ color: 'var(--text3)' }}>
          <ChevronRight size={14} />
        </button>
      </div>
      {pickerOpen && (
        <MonthRangePicker from={fromMonth} to={toMonth}
          onApply={(f, t) => setDateRange(f, t)} onClose={() => setPickerOpen(false)} />
      )}
    </div>
  )

  const viewSwitch = (
    <div role="radiogroup" aria-label="Country view" className="flex p-0.5 rounded-lg flex-shrink-0"
      style={{ background: 'var(--bg2)', border: '1px solid var(--border)' }}>
      {views.map(v => (
        <button key={v.key} onClick={() => setView(v.key)} role="radio" aria-checked={view === v.key}
          className="px-3 h-7 rounded-md text-[12px] whitespace-nowrap transition-all"
          style={view === v.key
            ? { background: '#fff', color: 'var(--text)', fontWeight: 600, boxShadow: '0 1px 2px rgba(15,23,42,0.12)' }
            : { color: 'var(--text3)', fontWeight: 500 }}>
          <span className="hidden xl:inline">{v.label}</span><span className="xl:hidden">{v.short}</span>
        </button>
      ))}
    </div>
  )

  const askAi = (
    <button onClick={() => advisorOpen ? closeAdvisor() : openAdvisor()} aria-pressed={advisorOpen}
      className="h-[34px] px-3.5 rounded-lg text-[12.5px] font-semibold flex items-center gap-1 flex-shrink-0 transition-colors"
      style={advisorOpen
        ? { background: 'var(--accent2)', color: '#fff' }
        : { background: 'var(--accent-bg)', color: 'var(--accent2)', border: '1px solid var(--accent-border)' }}>
      ✦ <span className="hidden sm:inline">Ask AI</span>
    </button>
  )

  return (
    <>
    {/* Desktop */}
    <header className="hidden md:flex items-center gap-3 flex-wrap px-6 py-3 min-h-[60px]"
      style={{ background: 'var(--card)', borderBottom: '1px solid var(--border)' }}>
      <nav aria-label="Breadcrumb" className="text-[13px] flex items-center gap-2 min-w-0" style={{ color: 'var(--text3)' }}>
        {crumbs.map((c, i) => (
          <span key={i} className="flex items-center gap-2 whitespace-nowrap">
            {i > 0 && <span aria-hidden>›</span>}
            <span style={i === crumbs.length - 1 ? { color: 'var(--text)', fontWeight: 500 } : undefined}>{c}</span>
          </span>
        ))}
      </nav>
      {monthPicker(deskRef)}
      <div className="ml-auto flex items-center gap-2.5 flex-wrap justify-end">
        <div className="pr-2.5" style={{ borderRight: '1px solid var(--border)' }}>
          <HolderChips firstName={firstName} />
        </div>
        {viewSwitch}
        <NotificationsPanel />
        {askAi}
      </div>
    </header>

    {/* Mobile */}
    <header className="md:hidden safe-top" style={{ background: 'var(--card)', borderBottom: '1px solid var(--border)' }}>
      <div className="flex items-center gap-2 px-4 h-14">
        <div className="text-[17px] font-bold truncate flex-1 min-w-0" style={{ color: 'var(--text)' }}>
          {section?.key === 'home' || !section ? 'WealthLens' : crumbs[crumbs.length - 1]}
        </div>
        {monthPicker(mobRef)}
        <button onClick={() => setPaletteOpen(true)} aria-label="Search"
          className="w-9 h-9 rounded-full flex items-center justify-center flex-shrink-0"
          style={{ border: '1px solid var(--border)', color: 'var(--text2)' }}>
          <Search size={16} />
        </button>
        <NotificationsPanel />
        <button onClick={() => openAdvisor()} aria-label="Ask AI"
          className="w-9 h-9 rounded-full flex items-center justify-center flex-shrink-0 text-[14px] font-semibold text-white"
          style={{ background: 'var(--accent)' }}>✦</button>
      </div>
      <div className="flex items-center gap-2 px-4 pb-2.5 overflow-x-auto no-scrollbar">
        {viewSwitch}
        <HolderChips firstName={firstName} />
      </div>
    </header>

    {uploadOpen && <BankStatementUploadModal onClose={() => setUploadOpen(false)} />}
  </>
  )
}
