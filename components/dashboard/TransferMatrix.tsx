'use client'
import { useMemo, useState } from 'react'
import { ChevronRight } from 'lucide-react'

interface T { txn_date: string; amount: string | number }
export interface MatrixCol { key: string; label: string; sym: string; color: string; txns: T[] }

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

function fmt(n: number, sym: string) {
  if (n === 0) return '—'
  return `${sym}${Math.round(n).toLocaleString('en-IN')}`
}

export default function TransferMatrix({ cols }: { cols: MatrixCol[] }) {
  const [openYear, setOpenYear] = useState<string | null>(null)

  const years = useMemo(() => {
    const s = new Set<string>()
    cols.forEach(c => c.txns.forEach(t => { if (t.txn_date) s.add(t.txn_date.slice(0, 4)) }))
    return Array.from(s).sort().reverse()
  }, [cols])

  const yearSum  = (c: MatrixCol, y: string) =>
    c.txns.filter(t => t.txn_date?.slice(0, 4) === y).reduce((a, t) => a + Number(t.amount), 0)
  const monthSum = (c: MatrixCol, y: string, m: number) =>
    c.txns.filter(t => t.txn_date?.slice(0, 4) === y && parseInt(t.txn_date.slice(5, 7)) - 1 === m).reduce((a, t) => a + Number(t.amount), 0)

  const th: React.CSSProperties = { color: 'var(--text3)', fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.04em', fontWeight: 700 }

  if (years.length === 0) {
    return <div className="text-[12px] text-center py-6" style={{ color: 'var(--text3)' }}>No transfers recorded yet.</div>
  }

  return (
    <div className="overflow-x-auto rounded-xl border" style={{ borderColor: 'var(--border)' }}>
      <table className="w-full text-[12px]" style={{ borderCollapse: 'collapse' }}>
        <thead>
          <tr style={{ background: 'var(--bg2)' }}>
            <th className="px-4 py-2.5 text-left" style={th}>Year</th>
            {cols.map(c => (
              <th key={c.key} className="px-4 py-2.5 text-right" style={{ ...th, color: c.color }}>{c.label}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {years.map(y => {
            const isOpen = openYear === y
            const monthsWithData = MONTHS.map((_, m) => m).filter(m => cols.some(c => monthSum(c, y, m) !== 0))
            return [
              <tr key={y} className="cursor-pointer transition-colors hover:brightness-95"
                style={{ borderTop: '1px solid var(--border)', background: isOpen ? 'var(--bg2)' : 'transparent' }}
                onClick={() => setOpenYear(isOpen ? null : y)}>
                <td className="px-4 py-2.5 font-bold" style={{ color: 'var(--text)' }}>
                  <span className="inline-flex items-center gap-1.5">
                    <ChevronRight size={13} style={{ transform: isOpen ? 'rotate(90deg)' : 'none', transition: 'transform .15s', color: 'var(--text3)' }} />
                    {y}
                  </span>
                </td>
                {cols.map(c => (
                  <td key={c.key} className="px-4 py-2.5 text-right font-mono font-semibold" style={{ color: yearSum(c, y) > 0 ? c.color : 'var(--text3)' }}>
                    {fmt(yearSum(c, y), c.sym)}
                  </td>
                ))}
              </tr>,

              isOpen && (
                <tr key={`${y}-m`} style={{ background: 'var(--bg2)' }}>
                  <td colSpan={cols.length + 1} className="px-3 py-3">
                    <table className="w-full text-[11px]" style={{ borderCollapse: 'collapse' }}>
                      <thead>
                        <tr>
                          <th className="px-3 py-1.5 text-left" style={th}>Month</th>
                          {cols.map(c => <th key={c.key} className="px-3 py-1.5 text-right" style={{ ...th, color: c.color }}>{c.label}</th>)}
                        </tr>
                      </thead>
                      <tbody>
                        {monthsWithData.length === 0 ? (
                          <tr><td colSpan={cols.length + 1} className="px-3 py-2 text-center" style={{ color: 'var(--text3)' }}>No monthly detail</td></tr>
                        ) : monthsWithData.map(m => (
                          <tr key={m} style={{ borderTop: '1px solid var(--border)' }}>
                            <td className="px-3 py-1.5 font-semibold" style={{ color: 'var(--text2)' }}>{MONTHS[m]} {y}</td>
                            {cols.map(c => (
                              <td key={c.key} className="px-3 py-1.5 text-right font-mono" style={{ color: monthSum(c, y, m) > 0 ? c.color : 'var(--text3)' }}>
                                {fmt(monthSum(c, y, m), c.sym)}
                              </td>
                            ))}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </td>
                </tr>
              ),
            ]
          })}
        </tbody>
      </table>
    </div>
  )
}
