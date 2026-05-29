'use client'
import { Search, X, ChevronDown } from 'lucide-react'

interface Chip { value: string; label: string; color?: string }
interface SortOpt { value: string; label: string }

interface FilterBarProps {
  search: string
  onSearch: (v: string) => void
  sort: string
  onSort: (v: string) => void
  sortOptions: SortOpt[]
  chips?: Chip[]
  activeChip?: string
  onChip?: (v: string) => void
  resultCount: number
  totalCount: number
  searchPlaceholder?: string
}

export default function FilterBar({
  search, onSearch, sort, onSort, sortOptions,
  chips, activeChip, onChip,
  resultCount, totalCount, searchPlaceholder = 'Search…',
}: FilterBarProps) {
  const isFiltered = !!search || !!activeChip

  return (
    <div className="space-y-2">
      <div className="flex gap-2">
        {/* Search */}
        <div className="flex-1 relative">
          <Search size={12} className="absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none"
            style={{ color: 'var(--text3)' }} />
          <input
            value={search}
            onChange={e => onSearch(e.target.value)}
            placeholder={searchPlaceholder}
            className="wl-input w-full pl-8 pr-7 text-[12px]"
            style={{ height: 36 }}
          />
          {search && (
            <button onClick={() => onSearch('')}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 p-0.5 rounded"
              style={{ color: 'var(--text3)' }}>
              <X size={11} />
            </button>
          )}
        </div>

        {/* Sort */}
        <div className="relative">
          <select
            value={sort}
            onChange={e => onSort(e.target.value)}
            className="wl-input text-[11px] pr-7 appearance-none cursor-pointer"
            style={{ height: 36, minWidth: 130 }}>
            {sortOptions.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
          <ChevronDown size={11} className="absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none"
            style={{ color: 'var(--text3)' }} />
        </div>
      </div>

      {/* Type chips */}
      {chips && chips.length > 0 && (
        <div className="flex gap-1.5 flex-wrap">
          <button
            onClick={() => onChip?.('')}
            className="px-2.5 py-1 rounded-lg text-[10px] font-semibold transition-all"
            style={{
              background: !activeChip ? 'var(--sage)' : 'var(--bg2)',
              color: !activeChip ? '#fff' : 'var(--text3)',
              border: `1px solid ${!activeChip ? 'var(--sage)' : 'var(--border)'}`,
            }}>
            All
          </button>
          {chips.map(c => (
            <button key={c.value}
              onClick={() => onChip?.(activeChip === c.value ? '' : c.value)}
              className="px-2.5 py-1 rounded-lg text-[10px] font-semibold transition-all capitalize"
              style={{
                background: activeChip === c.value ? (c.color || 'var(--blue)') : 'var(--bg2)',
                color: activeChip === c.value ? '#fff' : 'var(--text3)',
                border: `1px solid ${activeChip === c.value ? (c.color || 'var(--blue)') : 'var(--border)'}`,
              }}>
              {c.label}
            </button>
          ))}
        </div>
      )}

      {/* Result count when filtered */}
      {isFiltered && (
        <div className="flex items-center gap-2 text-[10px]" style={{ color: 'var(--text3)' }}>
          <span>Showing {resultCount} of {totalCount}</span>
          <button onClick={() => { onSearch(''); onChip?.('') }}
            className="flex items-center gap-0.5 font-semibold"
            style={{ color: 'var(--sage)' }}>
            <X size={9} /> Clear
          </button>
        </div>
      )}
    </div>
  )
}
