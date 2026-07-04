'use client'
import { X } from 'lucide-react'

// Popup that lists the individual transactions behind a summed amount in a report.
export default function TxnDrillModal({
  title, subtitle, items, amt, money, onClose,
}: {
  title: string
  subtitle?: string
  items: any[]
  amt: (t: any) => number
  money: (n: number) => string
  onClose: () => void
}) {
  const sorted = [...items].sort((a, b) => (a.txn_date < b.txn_date ? 1 : -1))
  const total = sorted.reduce((a, t) => a + amt(t), 0)
  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div className="rounded-2xl w-full max-w-lg max-h-[80vh] flex flex-col" onClick={e => e.stopPropagation()}
        style={{ background: '#fff', border: '1px solid var(--border)', boxShadow: '0 8px 40px rgba(0,0,0,0.15)' }}>
        <div className="flex items-center justify-between px-5 py-4 border-b flex-shrink-0" style={{ borderColor: 'var(--border)' }}>
          <div className="min-w-0">
            <div className="text-[13px] font-bold truncate" style={{ color: 'var(--text)' }}>{title}</div>
            <div className="text-[11px]" style={{ color: 'var(--text3)' }}>
              {subtitle ? `${subtitle} · ` : ''}{sorted.length} transaction{sorted.length !== 1 ? 's' : ''} · <b style={{ color: 'var(--text)' }}>{money(total)}</b>
            </div>
          </div>
          <button onClick={onClose} className="flex-shrink-0" style={{ color: 'var(--text3)' }}><X size={16} /></button>
        </div>
        <div className="overflow-y-auto">
          {sorted.length === 0 ? (
            <p className="text-[12px] p-6 text-center" style={{ color: 'var(--text3)' }}>No transactions</p>
          ) : (
            <table className="w-full text-[12px]">
              <thead>
                <tr style={{ background: 'var(--bg2)', borderBottom: '1px solid var(--border)' }}>
                  {['Date', 'Merchant / Source', 'Category', 'Amount'].map(h => (
                    <th key={h} className="px-4 py-2 text-left text-[10px] uppercase tracking-wider font-bold" style={{ color: 'var(--text3)' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {sorted.map((t, i) => (
                  <tr key={t.id ?? i} style={{ borderBottom: '1px solid var(--border)' }} className="hover:bg-stone-50">
                    <td className="px-4 py-2 font-mono whitespace-nowrap" style={{ color: 'var(--text3)' }}>{t.txn_date}</td>
                    <td className="px-4 py-2 truncate" style={{ color: 'var(--text)', maxWidth: 180 }}>{t.merchant}{t.description && t.description !== t.merchant ? <span className="text-[10px]" style={{ color: 'var(--text3)' }}> · {t.description}</span> : ''}</td>
                    <td className="px-4 py-2 text-[11px]" style={{ color: 'var(--text3)' }}>{t.category}</td>
                    <td className="px-4 py-2 text-right font-mono font-semibold whitespace-nowrap" style={{ color: 'var(--text)' }}>{money(amt(t))}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr style={{ background: 'var(--bg2)', borderTop: '2px solid var(--border)', position: 'sticky', bottom: 0 }}>
                  <td colSpan={3} className="px-4 py-2 font-bold text-[11px] uppercase tracking-wider" style={{ color: 'var(--text)' }}>Total</td>
                  <td className="px-4 py-2 text-right font-mono font-bold" style={{ color: 'var(--text)' }}>{money(total)}</td>
                </tr>
              </tfoot>
            </table>
          )}
        </div>
      </div>
    </div>
  )
}
