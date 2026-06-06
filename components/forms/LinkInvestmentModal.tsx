'use client'
import { useState, useMemo } from 'react'
import { createClient } from '@/lib/supabase/client'
import { X, Loader2, Link2, CheckCircle2, Search, Star } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { scoreInvestmentForGoal, getMatchLabel } from '@/lib/goalMatching'

type AllInvestments = Record<string, any[]>

const TYPE_LABELS: Record<string, string> = {
  stocks: 'Stocks', mutual_funds: 'Mutual Funds', fixed_deposits: 'Fixed Deposits',
  recurring_deposits: 'Recurring Deposits', nps_accounts: 'NPS', lic_policies: 'LIC',
  gold_investments: 'Gold', bond_investments: 'Bonds', etf_investments: 'ETF',
}
const TYPE_EMOJIS: Record<string, string> = {
  stocks: '📊', mutual_funds: '💹', fixed_deposits: '🏦',
  recurring_deposits: '🔄', nps_accounts: '🛡️', lic_policies: '📋',
  gold_investments: '🥇', bond_investments: '💵', etf_investments: '📈',
}

function getInvName(type: string, rec: any): string {
  if (type === 'stocks') return `${rec.symbol ?? ''} – ${rec.name ?? ''}`.replace(/^–\s*|–\s*$/, '').trim() || 'Stock'
  if (type === 'mutual_funds') return rec.fund_name ?? rec.name ?? 'Mutual Fund'
  if (type === 'etf_investments') return rec.etf_name ?? rec.name ?? 'ETF'
  return rec.name ?? rec.bank_name ?? 'Investment'
}

function getInvCurrentValue(type: string, rec: any): number {
  if (type === 'stocks') return (rec.quantity ?? 0) * (rec.current_price ?? rec.avg_buy_price ?? 0)
  if (type === 'mutual_funds') return (rec.units ?? 0) * (rec.current_nav ?? rec.avg_nav ?? 0)
  if (type === 'fixed_deposits') return rec.principal ?? 0
  if (type === 'recurring_deposits') {
    const start = new Date(rec.start_date ?? rec.created_at)
    const months = Math.max(0, (new Date().getFullYear() - start.getFullYear()) * 12 + new Date().getMonth() - start.getMonth())
    return months * (rec.monthly_amount ?? 0)
  }
  if (type === 'nps_accounts') return rec.corpus_amount ?? rec.invested_amount ?? 0
  if (type === 'lic_policies') return rec.total_paid ?? 0
  if (type === 'gold_investments') return rec.quantity_grams && rec.current_price_per_gram ? rec.quantity_grams * rec.current_price_per_gram : rec.invested_amount ?? 0
  return rec.invested_amount ?? 0
}

function getMonthsLeft(targetDate: string): number {
  return Math.ceil((new Date(targetDate).getTime() - Date.now()) / (1000 * 60 * 60 * 24 * 30))
}

interface LinkedItem { investment_type: string; investment_id: string; allocation_pct?: number; id?: string }

interface Props {
  goalId: string
  goal: any
  allInvestments: AllInvestments
  linked: LinkedItem[]
  onClose: () => void
}

export default function LinkInvestmentModal({ goalId, goal, allInvestments, linked, onClose }: Props) {
  const [saving, setSaving] = useState(false)
  const [search, setSearch] = useState('')
  const [error, setError] = useState('')
  const supabase = createClient()
  const router = useRouter()

  const monthsLeft = getMonthsLeft(goal.target_date)

  const goalCurrency = goal.currency ?? 'INR'

  // Build flat item list with scores — only investments in the goal's currency
  // (an India/INR goal links Indian investments only; UAE/AED for an AED goal)
  const allItems = useMemo(() => {
    const items: { type: string; id: string; name: string; value: number; currency: string; score: number; record: any }[] = []
    Object.entries(allInvestments).forEach(([type, records]) => {
      records.forEach((rec: any) => {
        if ((rec.currency ?? 'INR') !== goalCurrency) return
        const score = scoreInvestmentForGoal(type, rec, goal.category, monthsLeft)
        items.push({ type, id: rec.id, name: getInvName(type, rec), value: getInvCurrentValue(type, rec), currency: rec.currency ?? 'INR', score, record: rec })
      })
    })
    return items.sort((a, b) => b.score - a.score)
  }, [allInvestments, goal.category, goalCurrency, monthsLeft])

  // Initial selection state + allocation %
  const initSelected = useMemo(() => {
    const map: Record<string, number> = {}
    linked.forEach(l => { map[`${l.investment_type}::${l.investment_id}`] = l.allocation_pct ?? 100 })
    return map
  }, [linked])

  const [selected, setSelected] = useState<Record<string, number>>(initSelected)

  function toggle(type: string, id: string) {
    const key = `${type}::${id}`
    setSelected(prev => {
      if (key in prev) { const n = { ...prev }; delete n[key]; return n }
      return { ...prev, [key]: 100 }
    })
  }

  function setAlloc(type: string, id: string, pct: number) {
    const key = `${type}::${id}`
    setSelected(prev => ({ ...prev, [key]: Math.min(100, Math.max(1, Math.round(pct))) }))
  }

  // Filter by search
  const filtered = useMemo(() => {
    if (!search) return allItems
    const q = search.toLowerCase()
    return allItems.filter(i => i.name.toLowerCase().includes(q) || TYPE_LABELS[i.type]?.toLowerCase().includes(q))
  }, [allItems, search])

  // Top recommendations (not yet selected)
  const recommendations = useMemo(() =>
    allItems.filter(i => i.score >= 60 && !((`${i.type}::${i.id}`) in selected)).slice(0, 3)
  , [allItems, selected])

  async function save() {
    setSaving(true)
    setError('')
    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { setError('Not authenticated'); setSaving(false); return }

      const prevSet = new Set(linked.map(l => `${l.investment_type}::${l.investment_id}`))
      const currKeys = Object.keys(selected)
      const currSet  = new Set(currKeys)

      const toAdd    = currKeys.filter(k => !prevSet.has(k))
      const toRemove = Array.from(prevSet).filter(k => !currSet.has(k))
      const toUpdate = currKeys.filter(k => prevSet.has(k))

      const splitKey = (k: string) => {
        const idx = k.indexOf('::')
        return [k.slice(0, idx), k.slice(idx + 2)] as [string, string]
      }

      const results = await Promise.all([
        ...toAdd.map(k => {
          const [investment_type, investment_id] = splitKey(k)
          return supabase.from('goal_investments').insert({
            goal_id: goalId, user_id: user.id,
            investment_type, investment_id,
            allocation_pct: selected[k],
          })
        }),
        ...toRemove.map(k => {
          const [investment_type, investment_id] = splitKey(k)
          return supabase.from('goal_investments')
            .delete()
            .eq('goal_id', goalId)
            .eq('user_id', user.id)
            .eq('investment_type', investment_type)
            .eq('investment_id', investment_id)
        }),
        ...toUpdate.map(k => {
          const [investment_type, investment_id] = splitKey(k)
          return supabase.from('goal_investments')
            .update({ allocation_pct: selected[k] })
            .eq('goal_id', goalId)
            .eq('user_id', user.id)
            .eq('investment_type', investment_type)
            .eq('investment_id', investment_id)
        }),
      ])

      const failed = results.find(r => r.error)
      if (failed?.error) {
        setError(failed.error.message ?? 'Save failed. Please try again.')
        setSaving(false)
        return
      }

      router.refresh()
      setSaving(false)
      onClose()
    } catch (e: any) {
      setError(e?.message ?? 'Unexpected error. Please try again.')
      setSaving(false)
    }
  }

  const fmt = (v: number, cur: string) => `${cur === 'AED' ? 'AED ' : '₹'}${v.toLocaleString('en-IN', { maximumFractionDigits: 0 })}`
  const selectedCount = Object.keys(selected).length

  const byType = useMemo(() => {
    const map: Record<string, typeof filtered> = {}
    filtered.forEach(item => { if (!map[item.type]) map[item.type] = []; map[item.type].push(item) })
    return map
  }, [filtered])

  return (
    <div className="fixed inset-0 bg-black/40 z-50 overflow-y-auto">
      <div className="flex min-h-full items-center justify-center p-4 py-8">
        <div className="wl-card w-full max-w-xl" style={{ maxHeight: '90vh', display: 'flex', flexDirection: 'column' }}>

          {/* Header */}
          <div className="p-5" style={{ borderBottom: '1px solid var(--border)' }}>
            <div className="flex justify-between items-start mb-3">
              <div>
                <h2 className="text-[15px] font-bold" style={{ color: 'var(--text)' }}>Link Investments</h2>
                <p className="text-[11px] mt-0.5" style={{ color: 'var(--text3)' }}>
                  to &ldquo;{goal.name}&rdquo; · {goal.icon} {goal.category}
                </p>
              </div>
              <button onClick={onClose} style={{ color: 'var(--text3)' }}><X size={18} /></button>
            </div>
            {/* Search */}
            <div className="relative">
              <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2" style={{ color: 'var(--text3)' }} />
              <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search investments..."
                className="w-full rounded-lg pl-8 pr-3 py-2 text-[12px] focus:outline-none"
                style={{ background: 'var(--bg2)', border: '1px solid var(--border)', color: 'var(--text)' }}
                onFocus={e => (e.target.style.borderColor = 'var(--sage)')}
                onBlur={e => (e.target.style.borderColor = 'var(--border)')}
              />
            </div>
          </div>

          {/* Scrollable content */}
          <div className="flex-1 overflow-y-auto p-5 space-y-4">
            {/* Recommendations */}
            {recommendations.length > 0 && !search && (
              <div>
                <div className="flex items-center gap-2 mb-2">
                  <Star size={12} style={{ color: 'var(--gold)' }} />
                  <span className="text-[10px] font-bold uppercase tracking-wider" style={{ color: 'var(--text3)' }}>
                    Recommended for this goal
                  </span>
                </div>
                <div className="space-y-1.5">
                  {recommendations.map(item => {
                    const key = `${item.type}::${item.id}`
                    const match = getMatchLabel(item.score)
                    return (
                      <button key={key} onClick={() => toggle(item.type, item.id)}
                        className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl border text-left transition-all"
                        style={{ border: '1.5px solid var(--income)', background: 'var(--income-bg)' }}>
                        <span className="text-base flex-shrink-0">{TYPE_EMOJIS[item.type]}</span>
                        <div className="flex-1 min-w-0">
                          <div className="text-[11px] font-semibold truncate" style={{ color: 'var(--text)' }}>{item.name}</div>
                          <div className="text-[10px]" style={{ color: 'var(--text3)' }}>{TYPE_LABELS[item.type]} · {fmt(item.value, item.currency)}</div>
                        </div>
                        {match && (
                          <span className="text-[9px] px-2 py-0.5 rounded-full font-semibold flex-shrink-0"
                            style={{ background: match.bg, color: match.color }}>{match.label}</span>
                        )}
                        <div className="w-5 h-5 rounded-full border-2 flex-shrink-0" style={{ borderColor: 'var(--income)' }} />
                      </button>
                    )
                  })}
                </div>
              </div>
            )}

            {/* All investments by type */}
            {Object.entries(byType).map(([type, items]) => (
              <div key={type}>
                <div className="flex items-center gap-2 mb-1.5">
                  <span className="text-sm">{TYPE_EMOJIS[type]}</span>
                  <span className="text-[10px] font-bold uppercase tracking-wider" style={{ color: 'var(--text3)' }}>{TYPE_LABELS[type]}</span>
                </div>
                <div className="space-y-1">
                  {items.map(item => {
                    const key = `${item.type}::${item.id}`
                    const isSelected = key in selected
                    const match = getMatchLabel(item.score)
                    return (
                      <div key={key}>
                        <button onClick={() => toggle(item.type, item.id)}
                          className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl border text-left transition-all"
                          style={{
                            border: isSelected ? `1.5px solid ${goal.color}` : '1px solid var(--border)',
                            background: isSelected ? `${goal.color}08` : 'transparent',
                          }}>
                          <div className="w-5 h-5 rounded-full border-2 flex items-center justify-center flex-shrink-0 transition-all"
                            style={{ borderColor: isSelected ? goal.color : 'var(--border)', background: isSelected ? goal.color : 'transparent' }}>
                            {isSelected && <CheckCircle2 size={11} color="#fff" />}
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="text-[12px] font-medium truncate" style={{ color: 'var(--text)' }}>{item.name}</div>
                            <div className="text-[10px]" style={{ color: 'var(--text3)' }}>{fmt(item.value, item.currency)}</div>
                          </div>
                          {match && (
                            <span className="text-[9px] px-1.5 py-0.5 rounded-full font-semibold flex-shrink-0"
                              style={{ background: match.bg, color: match.color }}>{match.label}</span>
                          )}
                        </button>

                        {/* Allocation % row when selected */}
                        {isSelected && (
                          <div className="flex items-center gap-3 px-3 py-2 rounded-b-xl -mt-px"
                            style={{ background: `${goal.color}06`, border: `1.5px solid ${goal.color}`, borderTop: 'none' }}>
                            <span className="text-[10px] font-semibold flex-shrink-0" style={{ color: 'var(--text3)' }}>Alloc</span>
                            <input type="range" min={1} max={100} step={1} value={selected[key]}
                              onChange={e => setAlloc(item.type, item.id, Number(e.target.value))}
                              className="flex-1 cursor-pointer"
                              style={{ accentColor: goal.color }}
                            />
                            <div className="flex items-center gap-1 flex-shrink-0">
                              <input
                                type="number" min={1} max={100}
                                value={selected[key]}
                                onChange={e => {
                                  const v = parseInt(e.target.value, 10)
                                  if (!isNaN(v)) setAlloc(item.type, item.id, v)
                                }}
                                className="w-12 rounded-lg px-1.5 py-1 text-[11px] font-bold text-center focus:outline-none"
                                style={{ background: `${goal.color}20`, border: `1px solid ${goal.color}`, color: goal.color }}
                              />
                              <span className="text-[11px] font-bold" style={{ color: goal.color }}>%</span>
                            </div>
                          </div>
                        )}
                      </div>
                    )
                  })}
                </div>
              </div>
            ))}

            {filtered.length === 0 && (
              <div className="text-center py-8" style={{ color: 'var(--text3)' }}>
                <Search size={24} className="mx-auto mb-2 opacity-40" />
                <p className="text-[12px]">{search ? 'No investments match your search' : `No ${goalCurrency === 'AED' ? 'UAE (AED)' : 'India (INR)'} investments found for this goal.`}</p>
              </div>
            )}
          </div>

          {/* Footer */}
          <div className="p-4" style={{ borderTop: '1px solid var(--border)' }}>
            {error && (
              <div className="mb-3 px-3 py-2 rounded-lg text-[11px] font-medium" style={{ background: 'var(--rose-bg)', color: 'var(--rose)', border: '1px solid var(--rose)' }}>
                ⚠ {error}
              </div>
            )}
            <div className="flex items-center justify-between mb-3">
              <div className="text-[11px]" style={{ color: 'var(--text3)' }}>
                <strong style={{ color: 'var(--text)' }}>{selectedCount}</strong> investment{selectedCount !== 1 ? 's' : ''} selected
                {selectedCount > 0 && (
                  <span className="ml-2" style={{ color: 'var(--sage)' }}>
                    · avg {Math.round(Object.values(selected).reduce((a, b) => a + b, 0) / selectedCount)}% allocation
                  </span>
                )}
              </div>
              <button onClick={() => setSelected({})} className="text-[10px] font-medium hover:underline" style={{ color: 'var(--text3)' }}>
                Clear all
              </button>
            </div>
            <div className="flex gap-3">
              <button onClick={onClose} className="flex-1 py-2.5 rounded-lg border text-[12px] font-semibold"
                style={{ borderColor: 'var(--border)', color: 'var(--text3)' }}>Cancel</button>
              <button onClick={save} disabled={saving}
                className="flex-1 py-2.5 rounded-lg text-white text-[12px] font-bold flex items-center justify-center gap-2 disabled:opacity-50"
                style={{ background: goal.color }}>
                {saving ? <><Loader2 size={14} className="animate-spin" /> Saving…</> : <><Link2 size={14} /> Save Links</>}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
