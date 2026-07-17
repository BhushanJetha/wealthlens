'use client'
import { useState, useRef, useEffect } from 'react'
import { useViewStore } from '@/store/viewStore'
import { ArrowLeftRight, User, ChevronLeft, ChevronRight, Calendar, X, Upload, Menu } from 'lucide-react'
import NotificationsPanel from './NotificationsPanel'
import BankStatementUploadModal from '@/components/forms/BankStatementUploadModal'
import { useUiStore } from '@/store/uiStore'

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
    <div className="absolute top-full left-0 mt-2 z-50 rounded-2xl shadow-2xl overflow-hidden"
      style={{ background: '#fff', border: '1px solid var(--border)', minWidth: 320, width: 340 }}>

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
  const { view, setView, fromMonth, toMonth, setDateRange, fxRate, setFxRate } = useViewStore()
  const { setSidebarOpen } = useUiStore()
  const [pickerOpen,  setPickerOpen]  = useState(false)
  const [showUpload,  setShowUpload]  = useState(false)
  const wrapRef = useRef<HTMLDivElement>(null)

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
    function handler(e: MouseEvent) {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setPickerOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [pickerOpen])

  const views = [
    { key: 'uae',          label: '🇦🇪 UAE' },
    { key: 'india',        label: '🇮🇳 India' },
    { key: 'consolidated', label: '🌐 All' },
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

  return (
    <>
    <header className="px-3 sm:px-5 py-3 flex items-center gap-2 sm:gap-3 flex-wrap min-h-[52px]"
      style={{ background: 'var(--card)', borderBottom: '1px solid var(--border)' }}>

      {/* Mobile menu toggle */}
      <button onClick={() => setSidebarOpen(true)}
        className="md:hidden p-1.5 rounded-lg flex-shrink-0" style={{ color: 'var(--text2)', background: 'var(--bg2)' }}
        aria-label="Open menu">
        <Menu size={18} />
      </button>

      {/* Month Range Picker trigger */}
      <div ref={wrapRef} className="relative flex items-center">
        <div className="flex items-center rounded-lg border overflow-hidden"
          style={{ borderColor: 'var(--border)', background: 'var(--bg2)' }}>
          <button onClick={() => shiftRange(-1)}
            className="px-2 py-1.5 transition-colors hover:bg-gray-100"
            style={{ color: 'var(--text3)' }}>
            <ChevronLeft size={13} />
          </button>

          <button onClick={() => setPickerOpen(p => !p)}
            className="flex items-center gap-1.5 px-2 py-1.5 transition-colors hover:bg-gray-100"
            style={{ minWidth: 130 }}>
            <Calendar size={12} style={{ color: 'var(--sage)' }} />
            <span className="text-[11px] font-semibold" style={{ color: 'var(--text)' }}>
              {formatRange(fromMonth, toMonth)}
            </span>
            {!isSingleMonth && (
              <button onClick={e => { e.stopPropagation(); const m = new Date().toISOString().slice(0,7); setDateRange(m,m) }}
                className="ml-0.5 opacity-50 hover:opacity-100" style={{ color: 'var(--text3)' }}>
                <X size={10} />
              </button>
            )}
          </button>

          <button onClick={() => shiftRange(1)}
            className="px-2 py-1.5 transition-colors hover:bg-gray-100"
            style={{ color: 'var(--text3)' }}>
            <ChevronRight size={13} />
          </button>
        </div>

        {pickerOpen && (
          <MonthRangePicker
            from={fromMonth}
            to={toMonth}
            onApply={(f, t) => setDateRange(f, t)}
            onClose={() => setPickerOpen(false)}
          />
        )}
      </div>

      {/* View toggle — full-width segmented control on mobile (own row), inline on desktop */}
      <div className="flex gap-1 order-last w-full md:order-none md:w-auto">
        {views.map(v => (
          <button key={v.key} onClick={() => setView(v.key)}
            className="flex-1 md:flex-none px-3 py-2 md:py-1.5 rounded-lg text-[11px] font-semibold transition-all border"
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

      <div className="hidden sm:flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-[11px]"
        style={{ background: 'var(--bg2)', border: '1px solid var(--border)' }}>
        <ArrowLeftRight size={11} style={{ color: 'var(--text3)' }} />
        <span style={{ color: 'var(--text3)' }}>1 AED =</span>
        <span className="font-bold font-mono" style={{ color: 'var(--gold)' }}>₹{fxRate.toFixed(2)}</span>
        <span className="text-[9px] px-1 py-0.5 rounded font-semibold" style={{ background: '#D1FAE5', color: '#065F46' }}>Live</span>
      </div>

      <div className="ml-auto flex items-center gap-2 sm:gap-3">
        {/* Universal Import Statement button — updates all sections */}
        <button
          onClick={() => setShowUpload(true)}
          className="flex items-center gap-1.5 px-2 sm:px-3 py-1.5 rounded-lg text-[11px] font-semibold border transition-all"
          style={{ background: 'var(--sage-bg)', borderColor: 'var(--sage)', color: 'var(--sage)' }}
          title="Import bank statement — updates expenses, income, loans & fixed deposits">
          <Upload size={12} /> <span className="hidden sm:inline">Import Statement</span>
        </button>
        <NotificationsPanel />
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0" style={{ background: 'var(--sage-bg)' }}>
            <User size={13} style={{ color: 'var(--sage)' }} />
          </div>
          <span className="hidden sm:inline text-[12px] font-medium" style={{ color: 'var(--text2)' }}>
            {user?.full_name?.split(' ')[0] ?? 'User'}
          </span>
        </div>
      </div>
    </header>

    {showUpload && <BankStatementUploadModal onClose={() => setShowUpload(false)} />}
  </>
  )
}
