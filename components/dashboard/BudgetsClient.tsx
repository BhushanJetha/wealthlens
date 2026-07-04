'use client'
import { useState, useMemo, useEffect } from 'react'
import { useViewStore } from '@/store/viewStore'
import { createClient } from '@/lib/supabase/client'
import { Plus, BarChart2, BookOpen, CreditCard, TrendingUp, LayoutGrid, Sparkles, Lock, Unlock } from 'lucide-react'
import Link from 'next/link'

const MONTH_LABELS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']

const CATS = [
  'Food','Shopping','Utilities','Transport','Health','Personal Care','Entertainment',
  'Travel','Education','Subscription','Investment','EMI/Loan','Transfer','Other',
]

const CAT_COLORS: Record<string, string> = {
  Food: '#D97706', Shopping: '#2563EB', Utilities: '#7C3AED', Transport: '#16A34A',
  Health: '#059669', Entertainment: '#E11D48', Travel: '#EA580C', Education: '#0284C7',
  Subscription: '#EC4899', Investment: '#8B5CF6', 'EMI/Loan': '#DC2626',
  Transfer: '#3B7DD8', Other: '#6B7280',
}

function pctColor(pct: number): string {
  if (pct >= 100) return 'var(--rose)'
  if (pct >= 75)  return 'var(--gold)'
  return 'var(--income)'
}

function fmtAmt(n: number, sym: string): string {
  if (!n || n < 1) return '—'
  if (n >= 100000) return `${sym}${(n / 100000).toFixed(1)}L`
  if (n >= 1000)   return `${sym}${(n / 1000).toFixed(0)}K`
  return `${sym}${Math.round(n)}`
}

function cellBg(spent: number, cap: number | undefined): string {
  if (!spent || spent < 1) return 'transparent'
  if (!cap || cap < 1) return 'var(--bg2)'
  const pct = spent / cap * 100
  if (pct >= 100) return '#FFF1F2'
  if (pct >= 75)  return '#FFFBEB'
  return '#F0FDF4'
}

function cellColor(spent: number, cap: number | undefined): string {
  if (!spent || spent < 1) return 'var(--text3)'
  if (!cap || cap < 1) return 'var(--text2, var(--text))'
  const pct = spent / cap * 100
  if (pct >= 100) return 'var(--rose)'
  if (pct >= 75)  return '#B45309'
  return '#15803D'
}

const Lbl = ({ children }: { children: React.ReactNode }) => (
  <label className="block text-[10px] uppercase tracking-wider font-semibold mb-1"
    style={{ color: 'var(--text3)' }}>
    {children}
  </label>
)

export default function BudgetsClient({ budgets: initBudgets, transactions, incomeTransactions }: any) {
  const { view, fxRate: FX } = useViewStore()
  const [budgets,        setBudgets]        = useState(initBudgets)
  const [showBudgetForm, setShowBudgetForm] = useState(false)
  const [newBudget,      setNewBudget]      = useState({ category: 'Food', monthly_cap: '' })
  const [saving,         setSaving]         = useState(false)
  const [smartLoading,   setSmartLoading]   = useState(false)
  const [smartPreview,   setSmartPreview]   = useState<Record<string,number> | null>(null)
  const supabase = createClient()

  const sym       = view === 'uae' ? 'AED ' : '₹'
  const thisMonth = new Date().toISOString().slice(0, 7)
  const thisYear  = new Date().getFullYear()
  const curMonIdx = new Date().getMonth()  // 0-indexed

  function display(amt: number, cur: string): number {
    if (view === 'consolidated') return amt * (cur === 'AED' ? FX : 1)
    if (view === 'uae'   && cur !== 'AED') return 0
    if (view === 'india' && cur !== 'INR') return 0
    return amt
  }

  // Current-month spend per category
  const spendMap: Record<string, number> = {}
  transactions
    .filter((t: any) => t.txn_date?.slice(0, 7) === thisMonth && t.txn_type === 'expense')
    .forEach((t: any) => {
      spendMap[t.category] = (spendMap[t.category] ?? 0) + display(Number(t.amount), t.currency)
    })

  // Top-level KPI values
  const totalBudgetCap  = Math.round(budgets.reduce((a: number, b: any) => a + Number(b.monthly_cap), 0))
  const thisMonthSpend  = Math.round(Object.values(spendMap).reduce((a: number, v) => a + (v as number), 0))
  const thisMonthIncome = Math.round(
    incomeTransactions
      .filter((t: any) => t.txn_date?.slice(0, 7) === thisMonth)
      .reduce((a: number, t: any) => a + display(Number(t.amount), t.currency), 0)
  )
  const budgetUsedPct  = totalBudgetCap > 0 ? Math.round(thisMonthSpend / totalBudgetCap * 100) : 0
  const savedThisMonth = thisMonthIncome > 0 ? thisMonthIncome - thisMonthSpend : null

  // Budget cap lookup for matrix
  const budgetCapMap: Record<string, number> = {}
  budgets.forEach((b: any) => { budgetCapMap[b.category] = Number(b.monthly_cap) })

  // Category × Month spending matrix
  const { catMonthMatrix, matrixCats } = useMemo(() => {
    const matrix: Record<string, Record<string, number>> = {}
    const catTotals: Record<string, number> = {}
    const hasBudget = new Set(budgets.map((b: any) => b.category as string))

    transactions.filter((t: any) => t.txn_type === 'expense').forEach((t: any) => {
      const m = t.txn_date?.slice(0, 7)
      if (!m) return
      const cat = t.category || 'Other'
      if (!matrix[cat]) matrix[cat] = {}
      const amt = view === 'consolidated' ? Number(t.amount) * (t.currency === 'AED' ? FX : 1)
        : view === 'uae'   && t.currency !== 'AED' ? 0
        : view === 'india' && t.currency !== 'INR' ? 0
        : Number(t.amount)
      matrix[cat][m] = (matrix[cat][m] ?? 0) + amt
      catTotals[cat] = (catTotals[cat] ?? 0) + amt
    })

    const cats = CATS
      .filter(c => hasBudget.has(c) || Object.prototype.hasOwnProperty.call(matrix, c))
      .sort((a, b) => {
        if (hasBudget.has(a) !== hasBudget.has(b)) return hasBudget.has(a) ? -1 : 1
        return (catTotals[b] ?? 0) - (catTotals[a] ?? 0)
      })

    return { catMonthMatrix: matrix, matrixCats: cats }
  }, [transactions, budgets, view])

  // 12-month comparison data
  const monthlyData = useMemo(() => {
    const bCap = budgets.reduce((a: number, b: any) => a + Number(b.monthly_cap), 0)
    return Array.from({ length: 12 }, (_, i) => {
      const m = `${thisYear}-${String(i + 1).padStart(2, '0')}`
      const spend = transactions
        .filter((t: any) => t.txn_date?.slice(0, 7) === m && t.txn_type === 'expense')
        .reduce((a: number, t: any) => {
          if (view === 'uae'   && t.currency !== 'AED') return a
          if (view === 'india' && t.currency !== 'INR') return a
          return a + (view === 'consolidated' ? Number(t.amount) * (t.currency === 'AED' ? FX : 1) : Number(t.amount))
        }, 0)
      const income = incomeTransactions
        .filter((t: any) => t.txn_date?.slice(0, 7) === m)
        .reduce((a: number, t: any) => {
          if (view === 'uae'   && t.currency !== 'AED') return a
          if (view === 'india' && t.currency !== 'INR') return a
          return a + (view === 'consolidated' ? Number(t.amount) * (t.currency === 'AED' ? FX : 1) : Number(t.amount))
        }, 0)
      return {
        m, mLabel: MONTH_LABELS[i],
        spend: Math.round(spend), income: Math.round(income), bCap,
        pct:    bCap   > 0 ? Math.round(spend  / bCap   * 100) : 0,
        incPct: income > 0 ? Math.round(spend  / income * 100) : 0,
        isFuture:  m > thisMonth,
        isCurrent: m === thisMonth,
      }
    })
  }, [transactions, incomeTransactions, budgets, view, thisYear, thisMonth])

  // Subscription tracker (current month)
  const subscriptions = useMemo(() => {
    const subs: Record<string, { total: number; count: number }> = {}
    transactions
      .filter((t: any) => t.txn_date?.slice(0, 7) === thisMonth && t.category === 'Subscription' && t.txn_type === 'expense')
      .forEach((t: any) => {
        const name = t.merchant || 'Unknown'
        const amt  = display(Number(t.amount), t.currency)
        if (!subs[name]) subs[name] = { total: 0, count: 0 }
        subs[name].total += amt
        subs[name].count++
      })
    return Object.entries(subs)
      .map(([name, { total, count }]) => ({ name, total: Math.round(total), count }))
      .sort((a, b) => b.total - a.total)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [transactions, view, thisMonth])

  const subTotal    = subscriptions.reduce((a, s) => a + s.total, 0)
  const overBudget  = budgets.filter((b: any) => (spendMap[b.category] ?? 0) > Number(b.monthly_cap)).length

  // ── Smart Budget: calculate 3-month average + 10% buffer ──────────
  function calcSmartSuggestions(): Record<string,number> {
    const now = new Date()
    const months: string[] = []
    for (let i = 1; i <= 3; i++) {
      const d = new Date(now); d.setMonth(d.getMonth() - i)
      months.push(d.toISOString().slice(0, 7))
    }
    const totals: Record<string, number[]> = {}
    transactions.filter((t: any) => t.txn_type === 'expense').forEach((t: any) => {
      const m = t.txn_date?.slice(0, 7)
      if (!m || !months.includes(m)) return
      const amt = display(Number(t.amount), t.currency)
      if (amt <= 0) return
      const cat = t.category || 'Other'
      if (!totals[cat]) totals[cat] = [0, 0, 0]
      totals[cat][months.indexOf(m)] += amt
    })
    const sug: Record<string, number> = {}
    Object.entries(totals).forEach(([cat, vals]) => {
      const filled = vals.filter(v => v > 0)
      if (!filled.length) return
      const avg = filled.reduce((a, v) => a + v, 0) / filled.length
      sug[cat] = Math.ceil((avg * 1.1) / 100) * 100
    })
    return sug
  }

  // Auto-apply smart budget on page load (silently) for non-manual categories
  useEffect(() => {
    async function autoUpdate() {
      const suggestions = calcSmartSuggestions()
      if (!Object.keys(suggestions).length) return
      const manualCats = new Set(budgets.filter((b: any) => b.is_manual).map((b: any) => b.category as string))
      const rows = Object.entries(suggestions).filter(([cat]) => !manualCats.has(cat))
      if (!rows.length) return
      const { data: { user } } = await supabase.auth.getUser()
      const upsertRows = rows.map(([cat, cap]) => ({
        user_id:     user!.id,
        category:    cat,
        monthly_cap: cap,
        currency:    view === 'uae' ? 'AED' : 'INR',
        month_year:  thisMonth,
        is_manual:   false,
      }))
      const { data } = await supabase
        .from('budgets')
        .upsert(upsertRows, { onConflict: 'user_id,category,month_year' })
        .select()
      if (data) {
        setBudgets((prev: any[]) => {
          const next = [...prev]
          data.forEach((nb: any) => {
            const idx = next.findIndex((b: any) => b.category === nb.category)
            if (idx >= 0) next[idx] = nb; else next.push(nb)
          })
          return next
        })
      }
    }
    autoUpdate()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [view])

  async function applySmartBudget() {
    setSmartLoading(true)
    const suggestions = calcSmartSuggestions()
    const manualCats  = new Set(budgets.filter((b: any) => b.is_manual).map((b: any) => b.category as string))
    const { data: { user } } = await supabase.auth.getUser()
    const rows = Object.entries(suggestions)
      .filter(([cat]) => !manualCats.has(cat))
      .map(([cat, cap]) => ({
        user_id:     user!.id,
        category:    cat,
        monthly_cap: cap,
        currency:    view === 'uae' ? 'AED' : 'INR',
        month_year:  thisMonth,
        is_manual:   false,
      }))
    if (rows.length) {
      const { data } = await supabase
        .from('budgets')
        .upsert(rows, { onConflict: 'user_id,category,month_year' })
        .select()
      if (data) {
        setBudgets((prev: any[]) => {
          const next = [...prev]
          data.forEach((nb: any) => {
            const idx = next.findIndex((b: any) => b.category === nb.category)
            if (idx >= 0) next[idx] = nb; else next.push(nb)
          })
          return next
        })
      }
    }
    setSmartPreview(null)
    setSmartLoading(false)
  }

  async function toggleManual(b: any) {
    const next = !b.is_manual
    const { data } = await supabase
      .from('budgets')
      .update({ is_manual: next })
      .eq('id', b.id)
      .select().single()
    if (data) {
      setBudgets((prev: any[]) => prev.map((x: any) => x.id === data.id ? data : x))
    }
  }

  async function saveBudget() {
    setSaving(true)
    const { data: { user } } = await supabase.auth.getUser()
    const { data } = await supabase.from('budgets').upsert({
      user_id:     user!.id,
      category:    newBudget.category,
      monthly_cap: Number(newBudget.monthly_cap),
      currency:    view === 'uae' ? 'AED' : 'INR',
      month_year:  thisMonth,
      is_manual:   true,
    }, { onConflict: 'user_id,category,month_year' }).select().single()
    if (data) {
      setBudgets((prev: any[]) => {
        const idx = prev.findIndex((b: any) => b.category === data.category)
        return idx >= 0 ? prev.map((b: any, i: number) => i === idx ? data : b) : [...prev, data]
      })
    }
    setShowBudgetForm(false)
    setNewBudget({ category: 'Food', monthly_cap: '' })
    setSaving(false)
  }

  const monthName = new Date().toLocaleString('default', { month: 'short' })

  return (
    <div className="p-6 space-y-6 animate-fade-up">

      {/* ─── Header ─── */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-[20px] font-bold" style={{ color: 'var(--text)' }}>Budgets</h1>
          <p className="text-[12px] mt-0.5" style={{ color: 'var(--text3)' }}>
            {new Date().toLocaleString('default', { month: 'long', year: 'numeric' })} · {thisYear} Overview
          </p>
        </div>
        <Link href="/dashboard/budgets/learn"
          className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-[11px] font-bold border transition-all"
          style={{ background: 'var(--sage-bg)', borderColor: 'var(--sage)', color: 'var(--sage)' }}>
          <BookOpen size={13} /> Learn to Budget
        </Link>
      </div>

      {/* ─── Monthly Budget vs Income KPI Strip ─── */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
        <div className="wl-card p-3.5">
          <div className="text-[9px] uppercase tracking-wider font-bold mb-1" style={{ color: 'var(--text3)' }}>Total Budget Cap</div>
          <div className="text-[16px] font-black font-mono" style={{ color: 'var(--text)' }}>
            {totalBudgetCap > 0 ? `${sym}${totalBudgetCap.toLocaleString('en-IN')}` : 'Not set'}
          </div>
          <div className="text-[9px] mt-0.5" style={{ color: 'var(--text3)' }}>{budgets.length} categories budgeted</div>
        </div>

        <div className="wl-card p-3.5" style={{ background: 'var(--income-bg)' }}>
          <div className="text-[9px] uppercase tracking-wider font-bold mb-1" style={{ color: 'var(--text3)' }}>{monthName} Income</div>
          <div className="text-[16px] font-black font-mono" style={{ color: 'var(--income)' }}>
            {thisMonthIncome > 0 ? `${sym}${thisMonthIncome.toLocaleString('en-IN')}` : '—'}
          </div>
          <div className="text-[9px] mt-0.5" style={{ color: 'var(--text3)' }}>this month</div>
        </div>

        <div className="wl-card p-3.5"
          style={{ background: budgetUsedPct >= 100 ? 'var(--rose-bg)' : budgetUsedPct >= 75 ? '#FFFBEB' : '#F0FDF4' }}>
          <div className="text-[9px] uppercase tracking-wider font-bold mb-1" style={{ color: 'var(--text3)' }}>{monthName} Expenses</div>
          <div className="text-[16px] font-black font-mono" style={{ color: pctColor(budgetUsedPct) }}>
            {sym}{thisMonthSpend.toLocaleString('en-IN')}
          </div>
          <div className="text-[9px] mt-0.5" style={{ color: 'var(--text3)' }}>
            {totalBudgetCap > 0 ? `${budgetUsedPct}% of budget` : 'no budget set'}
          </div>
        </div>

        <div className="wl-card p-3.5"
          style={{ background: budgetUsedPct >= 100 ? 'var(--rose-bg)' : 'var(--bg2)' }}>
          <div className="text-[9px] uppercase tracking-wider font-bold mb-1" style={{ color: 'var(--text3)' }}>Budget Used</div>
          <div className="text-[16px] font-black font-mono" style={{ color: pctColor(budgetUsedPct) }}>
            {totalBudgetCap > 0 ? `${budgetUsedPct}%` : '—'}
          </div>
          {totalBudgetCap > 0 && (
            <div className="mt-1.5 h-1.5 rounded-full overflow-hidden" style={{ background: 'var(--border)' }}>
              <div className="h-full rounded-full transition-all"
                style={{ width: `${Math.min(budgetUsedPct, 100)}%`, background: pctColor(budgetUsedPct) }} />
            </div>
          )}
        </div>

        <div className="wl-card p-3.5"
          style={{ background: savedThisMonth === null ? 'var(--bg2)' : savedThisMonth >= 0 ? 'var(--income-bg)' : 'var(--rose-bg)' }}>
          <div className="text-[9px] uppercase tracking-wider font-bold mb-1" style={{ color: 'var(--text3)' }}>Saved This Month</div>
          <div className="text-[16px] font-black font-mono"
            style={{ color: savedThisMonth === null ? 'var(--text3)' : savedThisMonth >= 0 ? 'var(--income)' : 'var(--rose)' }}>
            {savedThisMonth !== null
              ? `${savedThisMonth < 0 ? '-' : ''}${sym}${Math.abs(savedThisMonth).toLocaleString('en-IN')}`
              : '—'}
          </div>
          <div className="text-[9px] mt-0.5" style={{ color: 'var(--text3)' }}>
            {savedThisMonth !== null
              ? (savedThisMonth >= 0 ? 'income − expenses' : '⚠ spending > income')
              : 'no income recorded'}
          </div>
        </div>
      </div>

      {overBudget > 0 && (
        <div className="flex items-center gap-3 rounded-xl px-4 py-3 text-[12px] font-medium"
          style={{ background: 'var(--rose-bg)', border: '1px solid var(--rose)', color: 'var(--rose)' }}>
          ⚠ <strong>{overBudget} budget{overBudget > 1 ? 's' : ''}</strong> exceeded this month.
        </div>
      )}

      {/* ─── Budget Meters ─── */}
      <div>
        <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
          <div className="text-[13px] font-bold flex items-center gap-2" style={{ color: 'var(--text)' }}>
            <BarChart2 size={15} style={{ color: 'var(--sage)' }} />
            Monthly Budgets — {new Date().toLocaleString('default', { month: 'long' })}
          </div>
          <div className="flex gap-2">
            <button
              onClick={() => {
                const sug = calcSmartSuggestions()
                setSmartPreview(Object.keys(sug).length ? sug : {})
              }}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] font-bold border"
              style={{ background: '#FEF3C7', borderColor: '#D97706', color: '#92400E' }}>
              <Sparkles size={12} /> Smart Budget
            </button>
            <button
              onClick={() => setShowBudgetForm(!showBudgetForm)}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] font-bold text-white"
              style={{ background: 'var(--sage)' }}>
              <Plus size={12} /> Set Budget
            </button>
          </div>
        </div>

        {/* Smart Budget Preview */}
        {smartPreview !== null && (
          <div className="wl-card p-4 mb-3" style={{ borderColor: '#D97706', borderWidth: 2 }}>
            <div className="flex items-center justify-between mb-3">
              <div>
                <div className="text-[13px] font-bold flex items-center gap-2" style={{ color: '#92400E' }}>
                  <Sparkles size={14} style={{ color: '#D97706' }} /> Smart Budget — Based on Last 3 Months
                </div>
                <div className="text-[11px] mt-0.5" style={{ color: '#B45309' }}>
                  Auto-calculated from your spending + 10% buffer. Skips categories you've locked manually.
                </div>
              </div>
              <button onClick={() => setSmartPreview(null)} className="text-[10px] px-2 py-1 rounded"
                style={{ background: 'var(--bg2)', color: 'var(--text3)' }}>✕ Cancel</button>
            </div>
            {Object.keys(smartPreview).length === 0 ? (
              <div className="text-[12px] py-4 text-center" style={{ color: 'var(--text3)' }}>
                No spending data in the last 3 months to suggest budgets.
              </div>
            ) : (
              <>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 mb-3">
                  {Object.entries(smartPreview).map(([cat, cap]) => {
                    const isLocked = budgets.find((b: any) => b.category === cat)?.is_manual
                    return (
                      <div key={cat} className="flex items-center justify-between px-3 py-2 rounded-lg text-[11px]"
                        style={{ background: isLocked ? 'var(--bg2)' : '#FFFBEB', border: `1px solid ${isLocked ? 'var(--border)' : '#D97706'}40`, opacity: isLocked ? 0.5 : 1 }}>
                        <div>
                          <div className="font-semibold" style={{ color: 'var(--text)' }}>{cat}</div>
                          {isLocked && <div className="text-[9px]" style={{ color: 'var(--text3)' }}>🔒 locked</div>}
                        </div>
                        <div className="font-mono font-bold" style={{ color: '#92400E' }}>
                          {sym}{(cap as number).toLocaleString('en-IN')}
                        </div>
                      </div>
                    )
                  })}
                </div>
                <button onClick={applySmartBudget} disabled={smartLoading}
                  className="w-full py-2 rounded-lg text-white text-[12px] font-bold flex items-center justify-center gap-2 disabled:opacity-50"
                  style={{ background: '#D97706' }}>
                  {smartLoading ? 'Applying…' : <><Sparkles size={13}/> Apply Smart Budget</>}
                </button>
              </>
            )}
          </div>
        )}

        {showBudgetForm && (
          <div className="wl-card p-4 mb-3 flex flex-wrap gap-3 items-end" style={{ borderColor: 'var(--sage)' }}>
            <div className="min-w-[140px]">
              <Lbl>Category</Lbl>
              <select
                value={newBudget.category}
                onChange={e => setNewBudget(p => ({ ...p, category: e.target.value }))}
                className="wl-input" style={{ background: 'var(--bg2)' }}>
                {CATS.map(c => <option key={c}>{c}</option>)}
              </select>
            </div>
            <div className="min-w-[150px]">
              <Lbl>Monthly Cap (₹)</Lbl>
              <input
                value={newBudget.monthly_cap}
                onChange={e => setNewBudget(p => ({ ...p, monthly_cap: e.target.value }))}
                type="number" placeholder="30000"
                className="wl-input" style={{ background: 'var(--bg2)' }}
                onFocus={e => (e.target.style.borderColor = 'var(--sage)')}
                onBlur={e => (e.target.style.borderColor = 'var(--border)')} />
            </div>
            <button
              onClick={saveBudget}
              disabled={saving || !newBudget.monthly_cap}
              className="px-4 py-2 rounded-lg text-white text-[12px] font-bold disabled:opacity-50"
              style={{ background: 'var(--sage)' }}>
              {saving ? 'Saving…' : 'Save'}
            </button>
          </div>
        )}

        {budgets.length === 0 ? (
          <div className="wl-card py-10 text-center text-[13px]" style={{ borderStyle: 'dashed', color: 'var(--text3)' }}>
            No budgets set. Click &ldquo;Set Budget&rdquo; to add spending caps per category.
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {budgets.map((b: any, i: number) => {
              const spent  = Math.round(spendMap[b.category] ?? 0)
              const cap    = Number(b.monthly_cap)
              const pct    = cap > 0 ? Math.min(Math.round(spent / cap * 100), 110) : 0
              const color  = pctColor(pct)
              const catCol = CAT_COLORS[b.category] ?? '#6B7280'
              return (
                <div key={i} className="wl-card p-4">
                  <div className="flex justify-between items-center mb-2">
                    <div className="flex items-center gap-2">
                      <span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ background: catCol }} />
                      <span className="text-[13px] font-bold" style={{ color: 'var(--text)' }}>{b.category}</span>
                      {b.is_manual
                        ? <span className="text-[8px] px-1.5 py-0.5 rounded font-bold" style={{ background:'#DBEAFE', color:'#1D4ED8' }}>Custom</span>
                        : <span className="text-[8px] px-1.5 py-0.5 rounded font-bold" style={{ background:'#F0FDF4', color:'#15803D' }}>Auto</span>
                      }
                    </div>
                    <div className="flex items-center gap-1.5">
                      <span className="text-[13px] font-bold font-mono" style={{ color }}>{pct}%</span>
                      <button title={b.is_manual ? 'Unlock — allow Smart Budget to update' : 'Lock — protect from Smart Budget changes'}
                        onClick={() => toggleManual(b)}
                        className="p-1 rounded transition-colors"
                        style={{ color: b.is_manual ? '#1D4ED8' : 'var(--text3)' }}>
                        {b.is_manual ? <Lock size={12}/> : <Unlock size={12}/>}
                      </button>
                    </div>
                  </div>
                  <div className="flex justify-between text-[10px] mb-2" style={{ color: 'var(--text3)' }}>
                    <span>{sym}{spent.toLocaleString('en-IN')} spent</span>
                    <span>cap {sym}{cap.toLocaleString('en-IN')}</span>
                  </div>
                  <div className="h-2 rounded-full overflow-hidden" style={{ background: 'var(--bg2)' }}>
                    <div className="h-full rounded-full transition-all"
                      style={{ width: `${Math.min(pct, 100)}%`, background: color }} />
                  </div>
                  {pct >= 100 && (
                    <div className="text-[10px] font-semibold mt-1.5" style={{ color: 'var(--rose)' }}>
                      Over by {sym}{Math.max(0, spent - cap).toLocaleString('en-IN')}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* ─── Subscription Tracker ─── */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <div className="text-[13px] font-bold flex items-center gap-2" style={{ color: 'var(--text)' }}>
            <CreditCard size={15} style={{ color: '#EC4899' }} /> Monthly Subscriptions
          </div>
          {subTotal > 0 && (
            <div className="text-right">
              <div className="text-[13px] font-black font-mono" style={{ color: '#EC4899' }}>
                {sym}{subTotal.toLocaleString('en-IN')}/mo
              </div>
              <div className="text-[9px]" style={{ color: 'var(--text3)' }}>
                {sym}{Math.round(subTotal * 12).toLocaleString('en-IN')}/yr
              </div>
            </div>
          )}
        </div>

        {subscriptions.length === 0 ? (
          <div className="wl-card py-8 text-center text-[12px]" style={{ borderStyle: 'dashed', color: 'var(--text3)' }}>
            No subscription transactions this month. Add one with category &ldquo;Subscription&rdquo;.
          </div>
        ) : (
          <div className="wl-card overflow-hidden">
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3 p-4">
              {subscriptions.map((s, i) => (
                <div key={i} className="flex flex-col p-3 rounded-xl"
                  style={{ background: '#EC489910', border: '1px solid #EC489930' }}>
                  <div className="text-[11px] font-bold leading-tight" style={{ color: '#EC4899' }}>{s.name}</div>
                  <div className="text-[14px] font-bold font-mono mt-1" style={{ color: 'var(--text)' }}>
                    {sym}{s.total.toLocaleString('en-IN')}
                  </div>
                  {s.count > 1 && (
                    <div className="text-[9px] mt-0.5" style={{ color: 'var(--text3)' }}>{s.count} charges</div>
                  )}
                </div>
              ))}
            </div>
            <div className="px-4 py-2.5 border-t text-[11px]" style={{ borderColor: 'var(--border)', color: 'var(--text3)' }}>
              {subscriptions.length} active subscription{subscriptions.length !== 1 ? 's' : ''} this month
            </div>
          </div>
        )}
      </div>

      {/* ─── Category × Month Spending Matrix ─── */}
      <div>
        <div className="text-[13px] font-bold flex items-center gap-2 mb-3" style={{ color: 'var(--text)' }}>
          <LayoutGrid size={15} style={{ color: '#8B5CF6' }} />
          Spend by Category × Month — {thisYear}
        </div>
        {matrixCats.length === 0 ? (
          <div className="wl-card py-8 text-center text-[12px]" style={{ borderStyle: 'dashed', color: 'var(--text3)' }}>
            No expense data this year yet.
          </div>
        ) : (
          <div className="wl-card overflow-hidden">
            <div className="overflow-x-auto">
              <table className="text-[11px] w-full" style={{ minWidth: 960 }}>
                <thead>
                  <tr style={{ borderBottom: '1px solid var(--border)', background: 'var(--bg2)' }}>
                    <th className="px-3 py-2.5 text-left text-[9px] uppercase tracking-wider font-bold"
                      style={{ color: 'var(--text3)', minWidth: 120 }}>Category</th>
                    <th className="px-3 py-2.5 text-right text-[9px] uppercase tracking-wider font-bold whitespace-nowrap"
                      style={{ color: 'var(--text3)', minWidth: 88 }}>Budget/mo</th>
                    {MONTH_LABELS.map((ml, mi) => (
                      <th key={ml}
                        className="px-2 py-2.5 text-center text-[9px] uppercase tracking-wider font-bold"
                        style={{
                          color: mi === curMonIdx ? 'var(--sage)' : 'var(--text3)',
                          background: mi === curMonIdx ? 'var(--sage-bg)' : 'var(--bg2)',
                          minWidth: 68,
                        }}>
                        {ml}
                      </th>
                    ))}
                    <th className="px-3 py-2.5 text-right text-[9px] uppercase tracking-wider font-bold"
                      style={{ color: 'var(--text3)', minWidth: 84 }}>Year Total</th>
                  </tr>
                </thead>
                <tbody>
                  {matrixCats.map((cat, ri) => {
                    const cap      = budgetCapMap[cat]
                    const yearTotal = Math.round(
                      Object.values(catMonthMatrix[cat] ?? {}).reduce((a: number, v: unknown) => a + (v as number), 0)
                    )
                    const rowBg = ri % 2 === 0 ? '#fff' : '#FAFAFA'
                    return (
                      <tr key={cat} className="hover:bg-stone-50 transition-colors"
                        style={{ borderBottom: '1px solid var(--border)' }}>
                        <td className="px-3 py-2 font-semibold" style={{ color: 'var(--text)', background: rowBg }}>
                          <div className="flex items-center gap-1.5">
                            <span className="w-2 h-2 rounded-full flex-shrink-0"
                              style={{ background: CAT_COLORS[cat] ?? '#6B7280' }} />
                            {cat}
                          </div>
                        </td>
                        <td className="px-3 py-2 text-right font-mono text-[10px]" style={{ color: 'var(--text3)' }}>
                          {cap ? fmtAmt(cap, sym) : '—'}
                        </td>
                        {Array.from({ length: 12 }, (_, mi) => {
                          const m     = `${thisYear}-${String(mi + 1).padStart(2, '0')}`
                          const spent = Math.round(catMonthMatrix[cat]?.[m] ?? 0)
                          const isCur = mi === curMonIdx
                          const bg    = cellBg(spent, cap)
                          return (
                            <td key={mi} className="px-2 py-2 text-center font-mono text-[10px]"
                              style={{
                                background: isCur && !spent ? 'var(--sage-bg)' : bg,
                                color: cellColor(spent, cap),
                                fontWeight: cap && spent >= cap ? 700 : undefined,
                              }}>
                              {fmtAmt(spent, sym)}
                            </td>
                          )
                        })}
                        <td className="px-3 py-2 text-right font-mono font-bold text-[10px]"
                          style={{ color: yearTotal > 0 ? 'var(--text)' : 'var(--text3)' }}>
                          {fmtAmt(yearTotal, sym)}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
            <div className="px-4 py-2.5 border-t flex flex-wrap gap-4 text-[10px]"
              style={{ borderColor: 'var(--border)', color: 'var(--text3)' }}>
              <span className="flex items-center gap-1.5">
                <span className="w-3 h-3 rounded inline-block" style={{ background: '#F0FDF4', border: '1px solid #16A34A40' }} />
                Under budget (&lt;75%)
              </span>
              <span className="flex items-center gap-1.5">
                <span className="w-3 h-3 rounded inline-block" style={{ background: '#FFFBEB', border: '1px solid #D9770640' }} />
                Near limit (75–99%)
              </span>
              <span className="flex items-center gap-1.5">
                <span className="w-3 h-3 rounded inline-block" style={{ background: '#FFF1F2', border: '1px solid #E11D4840' }} />
                Over budget (≥100%)
              </span>
              <span>Gray = no budget set · — = no transactions</span>
            </div>
          </div>
        )}
      </div>

      {/* ─── 12-Month Comparison Table ─── */}
      <div>
        <div className="text-[13px] font-bold flex items-center gap-2 mb-3" style={{ color: 'var(--text)' }}>
          <TrendingUp size={15} style={{ color: 'var(--blue)' }} />
          {thisYear} — Budget vs Actual vs Income
        </div>
        <div className="wl-card overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-[11px]">
              <thead>
                <tr style={{ borderBottom: '1px solid var(--border)', background: 'var(--bg2)' }}>
                  {['Month','Expenses','Budget Cap','vs Budget','Income','% of Income'].map(h => (
                    <th key={h} className="px-4 py-2.5 text-left text-[9px] uppercase tracking-wider font-bold"
                      style={{ color: 'var(--text3)' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {monthlyData.map((row, i) => {
                  const diff        = row.bCap > 0 ? row.spend - row.bCap : null
                  const diffColor   = diff === null ? 'var(--text3)' : diff > 0 ? 'var(--rose)' : diff < 0 ? 'var(--income)' : 'var(--gold)'
                  const incPctColor = row.incPct === 0 ? 'var(--text3)' : row.incPct > 80 ? 'var(--rose)' : row.incPct > 50 ? 'var(--gold)' : 'var(--income)'
                  return (
                    <tr key={i} className="hover:bg-stone-50 transition-colors"
                      style={{
                        borderBottom: '1px solid var(--border)',
                        background: row.isCurrent ? 'var(--sage-bg)' : undefined,
                        opacity: row.isFuture ? 0.4 : 1,
                      }}>
                      <td className="px-4 py-2.5 font-bold" style={{ color: row.isCurrent ? 'var(--sage)' : 'var(--text)' }}>
                        {row.mLabel}
                        {row.isCurrent && (
                          <span className="ml-1.5 text-[8px] px-1.5 py-0.5 rounded font-bold text-white"
                            style={{ background: 'var(--sage)' }}>NOW</span>
                        )}
                      </td>
                      <td className="px-4 py-2.5 font-mono font-bold" style={{ color: 'var(--rose)' }}>
                        {row.spend > 0 ? `${sym}${row.spend.toLocaleString('en-IN')}` : '—'}
                      </td>
                      <td className="px-4 py-2.5 font-mono" style={{ color: 'var(--text3)' }}>
                        {row.bCap > 0 ? `${sym}${row.bCap.toLocaleString('en-IN')}` : '—'}
                      </td>
                      <td className="px-4 py-2.5 font-mono font-semibold" style={{ color: diffColor }}>
                        {diff === null || (row.isFuture && row.spend === 0) ? '—'
                          : diff > 0 ? `+${sym}${Math.abs(diff).toLocaleString('en-IN')} over`
                          : diff < 0 ? `${sym}${Math.abs(diff).toLocaleString('en-IN')} saved`
                          : 'On budget'}
                      </td>
                      <td className="px-4 py-2.5 font-mono" style={{ color: 'var(--income)' }}>
                        {row.income > 0 ? `${sym}${row.income.toLocaleString('en-IN')}` : '—'}
                      </td>
                      <td className="px-4 py-2.5">
                        {row.incPct > 0 && !row.isFuture ? (
                          <div className="flex items-center gap-1.5">
                            <div className="h-1.5 rounded-full overflow-hidden" style={{ background: 'var(--bg2)', width: 48 }}>
                              <div className="h-full rounded-full"
                                style={{ width: `${Math.min(row.incPct, 100)}%`, background: incPctColor }} />
                            </div>
                            <span className="font-mono font-bold text-[10px]" style={{ color: incPctColor }}>
                              {row.incPct}%
                            </span>
                          </div>
                        ) : '—'}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
          <div className="px-4 py-3 border-t text-[10px]" style={{ borderColor: 'var(--border)', color: 'var(--text3)' }}>
            Budget cap = sum of all category caps set for current month · Future months shown at reduced opacity
          </div>
        </div>
      </div>

    </div>
  )
}
