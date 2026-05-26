const CAT_COLORS: Record<string, string> = {
  Food:'#D97706', Shopping:'#2563EB', Utilities:'#7C3AED',
  Transport:'#16A34A', Health:'#059669', Entertainment:'#E11D48',
  Travel:'#EA580C', Education:'#0284C7', Other:'#6B7280',
}

export function RecentActivity({ transactions, view }: { transactions: any[]; view: string }) {
  const filtered = view === 'uae'
    ? transactions.filter(t => t.currency === 'AED' || t.country === 'UAE')
    : view === 'india'
    ? transactions.filter(t => t.currency === 'INR' || t.country === 'India')
    : transactions

  return (
    <div className="wl-card p-4">
      <div className="text-[11px] font-bold uppercase tracking-wider mb-3" style={{ color: 'var(--text3)' }}>
        Recent Transactions
      </div>
      {filtered.length === 0
        ? <div className="text-center py-8 text-[13px]" style={{ color: 'var(--text3)' }}>
            No transactions yet. Upload a bank statement to get started.
          </div>
        : (
          <div className="space-y-2.5">
            {filtered.slice(0, 7).map((t: any, i: number) => {
              const color = CAT_COLORS[t.category] ?? '#6B7280'
              return (
                <div key={i} className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-lg flex items-center justify-center text-[10px] font-bold flex-shrink-0"
                    style={{ background: color + '18', color }}>
                    {t.category?.slice(0, 2).toUpperCase() ?? '??'}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-[12px] font-semibold truncate" style={{ color: 'var(--text)' }}>{t.merchant}</div>
                    <div className="text-[10px]" style={{ color: 'var(--text3)' }}>{t.txn_date} · {t.category}</div>
                  </div>
                  <div className="text-[12px] font-bold font-mono flex-shrink-0"
                    style={{ color: t.txn_type === 'income' ? 'var(--income)' : 'var(--expense)' }}>
                    {t.txn_type === 'income' ? '+' : '-'}{t.currency === 'AED' ? 'AED ' : '₹'}{Number(t.amount).toLocaleString('en-IN')}
                  </div>
                </div>
              )
            })}
          </div>
        )
      }
    </div>
  )
}
