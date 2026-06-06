'use client'
import { ChevronLeft, ChevronRight } from 'lucide-react'

interface Props {
  total: number
  page: number
  pageSize: number
  onPage: (p: number) => void
  onPageSize: (s: number) => void
  pageSizeOptions?: number[]
}

export default function Pagination({
  total, page, pageSize, onPage, onPageSize, pageSizeOptions = [10, 20, 50],
}: Props) {
  const totalPages = Math.max(1, Math.ceil(total / pageSize))
  const start = Math.min((page - 1) * pageSize + 1, total)
  const end   = Math.min(page * pageSize, total)

  if (total === 0) return null

  const pageNums: number[] = []
  if (totalPages <= 5) {
    for (let i = 1; i <= totalPages; i++) pageNums.push(i)
  } else {
    let lo = Math.max(1, page - 2)
    let hi = lo + 4
    if (hi > totalPages) { hi = totalPages; lo = hi - 4 }
    for (let i = lo; i <= hi; i++) pageNums.push(i)
  }

  const btn = "w-7 h-7 flex items-center justify-center rounded-lg border text-[11px] font-semibold transition-all"

  return (
    <div className="flex items-center justify-between px-4 py-3" style={{ borderTop: '1px solid var(--border)' }}>
      <div className="flex items-center gap-2 text-[12px]" style={{ color: 'var(--text3)' }}>
        Show
        <select
          value={pageSize}
          onChange={e => { onPageSize(Number(e.target.value)); onPage(1) }}
          className="wl-input py-1 px-2 text-[12px]"
          style={{ width: 'auto', background: 'var(--bg2)' }}
          onFocus={e => (e.target.style.borderColor = 'var(--sage)')}
          onBlur={e => (e.target.style.borderColor = 'var(--border)')}>
          {pageSizeOptions.map(n => <option key={n} value={n}>{n} rows</option>)}
        </select>
        <span>· {start}–{end} of {total}</span>
      </div>

      <div className="flex items-center gap-1">
        <button
          onClick={() => onPage(page - 1)} disabled={page <= 1}
          className={btn}
          style={{ borderColor: 'var(--border)', color: 'var(--text3)', background: 'var(--bg2)' }}>
          <ChevronLeft size={13} />
        </button>

        {pageNums.map(p => (
          <button key={p} onClick={() => onPage(p)}
            className={btn}
            style={p === page
              ? { borderColor: 'var(--sage)', color: 'var(--sage)', background: 'var(--sage-bg)' }
              : { borderColor: 'var(--border)', color: 'var(--text3)', background: 'var(--bg2)' }}>
            {p}
          </button>
        ))}

        <button
          onClick={() => onPage(page + 1)} disabled={page >= totalPages}
          className={btn}
          style={{ borderColor: 'var(--border)', color: 'var(--text3)', background: 'var(--bg2)' }}>
          <ChevronRight size={13} />
        </button>
      </div>
    </div>
  )
}
