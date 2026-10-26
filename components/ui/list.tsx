'use client'
import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Search, AlertTriangle, ChevronRight, MoreHorizontal, type LucideIcon } from 'lucide-react'

// Design v2 lists (transactions, holdings, loans). One row layout for both
// sizes: desktop = 4 columns + action icons, phone = avatar · title ·
// "tag · meta" · amount. A row with its own page (href) opens it on tap at
// both sizes; its other actions sit behind a ⋯ button on phones. A row
// without a page opens its actions in a bottom sheet on tap.

// Columns: main | tag | meta | amount | actions
const COLS = 'md:grid md:grid-cols-[minmax(0,2.4fr)_minmax(0,1.3fr)_minmax(0,.9fr)_minmax(0,1fr)_84px] md:gap-3 md:items-center'

export interface RowAction { label: string; icon: LucideIcon; onClick: () => void; danger?: boolean; disabled?: boolean }

export function ListCard({ title, sub, right, toolbar, head, children, footer, empty, className = '' }: {
  title: React.ReactNode; sub?: React.ReactNode; right?: React.ReactNode
  toolbar?: React.ReactNode            // search / filters, under the title
  head?: [string, string, string, string]   // desktop column labels
  children?: React.ReactNode; footer?: React.ReactNode; empty?: React.ReactNode; className?: string
}) {
  return (
    <section className={`wl-card overflow-hidden ${className}`}>
      <div className="px-4 md:px-5 pt-3.5 md:pt-[18px] pb-2.5 flex flex-col gap-2.5">
        <div className="flex items-center justify-between gap-2">
          <div className="min-w-0">
            <h2 className="text-[14px] md:text-[15px] font-semibold" style={{ color: 'var(--text)' }}>{title}</h2>
            {sub && <div className="text-[11.5px] md:text-[12px] mt-0.5" style={{ color: 'var(--text3)' }}>{sub}</div>}
          </div>
          {right}
        </div>
        {toolbar}
      </div>
      {head && (
        <div className={`hidden ${COLS} px-5 py-2 text-[10.5px] font-semibold uppercase tracking-[0.05em]`}
          style={{ color: 'var(--text4)', borderTop: '1px solid var(--line)', borderBottom: '1px solid var(--line)', background: '#FAFAFE' }}>
          <span>{head[0]}</span><span>{head[1]}</span><span>{head[2]}</span><span className="text-right">{head[3]}</span><span />
        </div>
      )}
      {empty ?? <div className="max-md:border-t max-md:border-[var(--line)]">{children}</div>}
      {footer}
    </section>
  )
}

export function ListRow({ initial, color, title, sub, tag, warn, meta, metaColor, amount, amountColor, amountSub, actions = [], href, onOpen }: {
  initial?: React.ReactNode; color: string            // hex; tints the avatar and tag
  title: React.ReactNode; sub?: React.ReactNode       // sub = desktop second line (account, bank…)
  tag?: string; warn?: string | null                  // tag = category / type pill; warn = tooltip for a ⚠
  meta?: React.ReactNode; metaColor?: string          // date, return %…
  amount: React.ReactNode; amountColor?: string; amountSub?: React.ReactNode
  actions?: RowAction[]; href?: string; onOpen?: () => void
}) {
  const [sheet, setSheet] = useState(false)
  const router = useRouter()
  const tint = `${color}1A`
  const open = () => {
    if (href) { router.push(href); return }
    const desktop = typeof window !== 'undefined' && window.matchMedia('(min-width: 768px)').matches
    if (!desktop && actions.length) setSheet(true)
    else onOpen?.()
  }
  // "Open details" is the row itself when it has a page — never listed twice
  const menu = href ? actions.filter(a => !/^open/i.test(a.label)) : actions
  const avatar = (
    <span className="w-9 h-9 md:w-[34px] md:h-[34px] rounded-[10px] flex items-center justify-center flex-shrink-0 text-[14px] font-bold"
      style={{ background: tint, color }}>{initial ?? String(title ?? '?').trim()[0]?.toUpperCase()}</span>
  )
  const warnIcon = warn && <span title={warn} aria-label={warn}><AlertTriangle size={12} style={{ color: '#D97706' }} /></span>

  const body = (
    <div className={`flex items-center gap-3 px-4 md:px-5 py-3 ${COLS}`}>
      {/* Main: avatar, title, phone sub-line */}
      <div className="flex items-center gap-3 min-w-0 flex-1">
        {avatar}
        <div className="min-w-0">
          <div className="text-[13.5px] md:text-[13px] font-semibold truncate" style={{ color: 'var(--text)' }}>{title}</div>
          <div className="md:hidden text-[11.5px] truncate flex items-center gap-1" style={{ color: 'var(--text3)' }}>
            {tag && <span className="font-medium" style={{ color }}>{tag}</span>}
            {warnIcon}
            {tag && meta != null && <span>·</span>}
            {meta != null && <span style={metaColor ? { color: metaColor, fontWeight: 600 } : undefined}>{meta}</span>}
          </div>
          {sub && <div className="hidden md:block text-[11.5px] truncate" style={{ color: 'var(--text3)' }}>{sub}</div>}
        </div>
      </div>
      {/* Desktop columns */}
      <div className="hidden md:flex items-center gap-1.5 min-w-0">
        {tag && <span className="rounded-full px-2 py-0.5 text-[11px] font-semibold truncate" style={{ background: tint, color }}>{tag}</span>}
        {warnIcon}
      </div>
      <div className="hidden md:block text-[12.5px] truncate" style={{ color: metaColor ?? 'var(--text3)', fontWeight: metaColor ? 600 : 400 }}>{meta}</div>
      {/* Amount (both sizes); on phones a page row shows › and its ⋯ menu */}
      <div className="flex items-center gap-1 flex-shrink-0">
        <div className="text-right">
          <div className="text-[13.5px] md:text-[13px] font-semibold tabular-nums whitespace-nowrap" style={{ color: amountColor ?? 'var(--text)' }}>{amount}</div>
          {amountSub && <div className="text-[11px] tabular-nums whitespace-nowrap" style={{ color: 'var(--text4)' }}>{amountSub}</div>}
        </div>
        {href && menu.length > 0 && (
          <button onClick={e => { e.stopPropagation(); setSheet(true) }} aria-label="More actions"
            className="md:hidden w-8 h-8 -mr-1.5 rounded-lg flex items-center justify-center" style={{ color: 'var(--text3)' }}><MoreHorizontal size={17} /></button>
        )}
        {href && !menu.length && <ChevronRight size={16} className="md:hidden" style={{ color: 'var(--text4)' }} />}
      </div>
      {/* Desktop actions */}
      <div className="hidden md:flex items-center justify-end gap-0.5">
        {menu.map(a => (
          <button key={a.label} onClick={e => { e.stopPropagation(); e.preventDefault(); a.onClick() }} disabled={a.disabled}
            title={a.label} aria-label={a.label}
            className="w-7 h-7 rounded-lg flex items-center justify-center opacity-60 group-hover:opacity-100 hover:bg-[var(--accent-bg)] disabled:opacity-30 transition"
            style={{ color: a.danger ? '#DC2626' : 'var(--text3)' }}>
            <a.icon size={14} />
          </button>
        ))}
        {href && <ChevronRight size={15} style={{ color: 'var(--text4)' }} />}
      </div>
    </div>
  )

  return (
    <div className="group [&+&]:border-t [&+&]:border-[var(--track)] hover:bg-[#FAFAFE] transition-colors">
      {href && !actions.length
        ? <Link href={href} className="block">{body}</Link>
        : <div role={onOpen || actions.length ? 'button' : undefined} tabIndex={onOpen || actions.length ? 0 : undefined}
            onClick={open} onKeyDown={e => { if (e.key === 'Enter') open() }} className={onOpen || actions.length ? 'cursor-pointer' : ''}>{body}</div>}

      {sheet && (
        <div className="md:hidden fixed inset-0 z-50 wl-sheet" onClick={() => setSheet(false)}>
          <div className="wl-sheet-panel bg-white pb-2" onClick={e => e.stopPropagation()}>
            <div className="flex items-center gap-3 px-4 py-3.5" style={{ borderBottom: '1px solid var(--line)' }}>
              {avatar}
              <div className="min-w-0 flex-1">
                <div className="text-[14px] font-semibold truncate" style={{ color: 'var(--text)' }}>{title}</div>
                <div className="text-[12px] truncate" style={{ color: 'var(--text3)' }}>{[tag, typeof meta === 'string' ? meta : null].filter(Boolean).join(' · ')}</div>
              </div>
              <div className="text-[14px] font-semibold tabular-nums" style={{ color: amountColor ?? 'var(--text)' }}>{amount}</div>
            </div>
            {href && (
              <Link href={href} className="w-full flex items-center gap-3 px-4 py-3.5 text-[14px] font-medium" style={{ color: 'var(--text)' }}>
                <ChevronRight size={17} style={{ color: 'var(--text3)' }} />Open details
              </Link>
            )}
            {menu.map(a => (
              <button key={a.label} disabled={a.disabled} onClick={() => { setSheet(false); a.onClick() }}
                className="w-full flex items-center gap-3 px-4 py-3.5 text-[14px] font-medium text-left disabled:opacity-40"
                style={{ color: a.danger ? '#DC2626' : 'var(--text)' }}>
                <a.icon size={17} style={{ color: a.danger ? '#DC2626' : 'var(--text3)' }} />{a.label}
              </button>
            ))}
            <button onClick={() => setSheet(false)} className="w-full px-4 py-3.5 text-[14px] font-semibold" style={{ color: 'var(--text3)', borderTop: '1px solid var(--line)' }}>Cancel</button>
          </div>
        </div>
      )}
    </div>
  )
}

// Search box + optional selects, for ListCard's toolbar
export function ListSearch({ value, onChange, placeholder, children }: {
  value: string; onChange: (v: string) => void; placeholder: string; children?: React.ReactNode
}) {
  return (
    <div className="flex gap-2 items-center">
      <div className="relative flex-1 min-w-0">
        <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2" style={{ color: 'var(--text4)' }} />
        <input value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder} aria-label={placeholder}
          className="wl-input pl-9 w-full" style={{ background: '#fff', height: 36 }} />
      </div>
      {children}
    </div>
  )
}

// One scrolling row of filter chips with counts (no wrapping wall of chips)
export function ChipFilter({ options, value, onChange, label, trailing }: {
  options: { key: string; label: string; count?: number; warn?: boolean }[]
  value: string; onChange: (k: string) => void; label: string
  trailing?: React.ReactNode            // e.g. a "Manage" chip after the options
}) {
  return (
    <div className="flex gap-1.5 overflow-x-auto no-scrollbar -mx-4 px-4 md:-mx-5 md:px-5" role="group" aria-label={label}>
      {options.map(o => (
        <button key={o.key} onClick={() => onChange(o.key)} aria-pressed={value === o.key} className="wl-chip flex-shrink-0 gap-1.5" style={{ height: 30 }}>
          {o.warn && <AlertTriangle size={11} style={{ color: '#DC2626' }} />}
          {o.label}
          {o.count != null && <span className="text-[10.5px] tabular-nums" style={{ color: value === o.key ? 'var(--accent)' : 'var(--text4)' }}>{o.count}</span>}
        </button>
      ))}
      {trailing}
    </div>
  )
}
