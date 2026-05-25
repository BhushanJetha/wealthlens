const CAT_COLORS: Record<string, string> = {
  Food: '#F4A535', Shopping: '#4A90D9', Utilities: '#7C5CBF',
  Transport: '#00C9A7', Health: '#3CC68A', Entertainment: '#E8556D',
  Travel: '#FF8C42', Education: '#A0B0C0', Other: '#6A7F92',
}

export function RecentActivity({ transactions, view }: { transactions: any[]; view: string }) {
  const filtered = view === 'uae'
    ? transactions.filter(t => t.currency === 'AED' || t.country === 'UAE')
    : view === 'india'
    ? transactions.filter(t => t.currency === 'INR' || t.country === 'India')
    : transactions

  return (
    <div className="bg-[#162032] border border-white/7 rounded-xl p-4">
      <div className="text-[11px] font-bold text-slate-400 uppercase tracking-wider mb-3">Recent Transactions</div>
      {filtered.length === 0
        ? <div className="text-sm text-slate-600 text-center py-8">No transactions yet. Upload a bank statement to get started.</div>
        : (
          <div className="space-y-2.5">
            {filtered.slice(0, 7).map((t: any, i: number) => (
              <div key={i} className="flex items-center gap-3">
                <div className="w-7 h-7 rounded-lg flex items-center justify-center text-[10px] font-bold flex-shrink-0"
                  style={{ background: (CAT_COLORS[t.category] ?? '#6A7F92') + '22', color: CAT_COLORS[t.category] ?? '#6A7F92' }}>
                  {t.category?.slice(0, 2).toUpperCase() ?? '??'}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-[12px] font-semibold text-white truncate">{t.merchant}</div>
                  <div className="text-[10px] text-slate-500">{t.txn_date} · {t.category}</div>
                </div>
                <div className={`text-[12px] font-bold font-mono flex-shrink-0 ${t.txn_type === 'income' ? 'text-[#3CC68A]' : 'text-[#E8556D]'}`}>
                  {t.txn_type === 'income' ? '+' : '-'}{t.currency === 'AED' ? 'AED ' : '₹'}{Number(t.amount).toLocaleString('en-IN')}
                </div>
              </div>
            ))}
          </div>
        )
      }
    </div>
  )
}
