'use client'
import { useState } from 'react'
import { useViewStore } from '@/store/viewStore'
import { createClient } from '@/lib/supabase/client'
import { Plus, Target, TrendingUp } from 'lucide-react'

const FX = 22.80
const CATS = ['Food','Shopping','Utilities','Transport','Health','Entertainment','Travel','Education','Other']

function pctColor(pct: number) {
  if (pct >= 100) return { text: '#E8556D', bar: '#E8556D' }
  if (pct >= 75)  return { text: '#F4A535', bar: '#F4A535' }
  return { text: '#3CC68A', bar: '#00C9A7' }
}

export default function BudgetsClient({ budgets: initBudgets, goals: initGoals, transactions }: any) {
  const { view } = useViewStore()
  const [budgets, setBudgets] = useState(initBudgets)
  const [goals, setGoals]     = useState(initGoals)
  const [showBudgetForm, setShowBudgetForm] = useState(false)
  const [showGoalForm, setShowGoalForm]     = useState(false)
  const [newBudget, setNewBudget] = useState({ category: 'Food', monthly_cap: '' })
  const [newGoal, setNewGoal] = useState({ name: '', target_amount: '', current_amount: '', target_date: '', currency: 'INR', country: 'India', emoji: '🎯' })
  const [saving, setSaving] = useState(false)
  const supabase = createClient()

  const sym = view === 'uae' ? 'AED ' : '₹'

  // Calculate actual spend per category
  const spendMap: Record<string, number> = {}
  transactions.forEach((t: any) => {
    const amt = view === 'consolidated' ? (t.currency === 'AED' ? Number(t.amount) * FX : Number(t.amount))
      : view === 'uae' && t.currency !== 'AED' ? 0
      : view === 'india' && t.currency !== 'INR' ? 0
      : Number(t.amount)
    spendMap[t.category] = (spendMap[t.category] ?? 0) + amt
  })

  async function saveBudget() {
    setSaving(true)
    const thisMonth = new Date().toISOString().slice(0, 7)
    const { data } = await supabase.from('budgets').upsert({
      category: newBudget.category,
      monthly_cap: Number(newBudget.monthly_cap),
      currency: 'INR',
      month_year: thisMonth,
    }, { onConflict: 'user_id,category,month_year' }).select().single()
    if (data) setBudgets((prev: any[]) => {
      const exists = prev.findIndex(b => b.category === data.category)
      return exists >= 0 ? prev.map((b, i) => i === exists ? data : b) : [...prev, data]
    })
    setShowBudgetForm(false)
    setNewBudget({ category: 'Food', monthly_cap: '' })
    setSaving(false)
  }

  async function saveGoal() {
    setSaving(true)
    const { data } = await supabase.from('goals').insert({
      name: newGoal.name,
      target_amount: Number(newGoal.target_amount),
      current_amount: Number(newGoal.current_amount),
      target_date: newGoal.target_date,
      currency: newGoal.currency,
      country: newGoal.country,
      emoji: newGoal.emoji,
    }).select().single()
    if (data) setGoals((prev: any[]) => [data, ...prev])
    setShowGoalForm(false)
    setNewGoal({ name: '', target_amount: '', current_amount: '', target_date: '', currency: 'INR', country: 'India', emoji: '🎯' })
    setSaving(false)
  }

  const overBudget = budgets.filter((b: any) => (spendMap[b.category] ?? 0) > Number(b.monthly_cap)).length

  return (
    <div className="space-y-6 animate-fade-up">
      <div>
        <h1 className="text-lg font-bold text-white">Budgets & Goals</h1>
        <p className="text-xs text-slate-500 mt-0.5">{new Date().toLocaleString('default', { month: 'long', year: 'numeric' })}</p>
      </div>

      {overBudget > 0 && (
        <div className="flex items-center gap-3 bg-rose-500/8 border border-rose-500/20 rounded-xl px-4 py-3 text-[12px] text-rose-300">
          ⚠ <strong>{overBudget} budget{overBudget > 1 ? 's' : ''}</strong> exceeded this month. Review your spending below.
        </div>
      )}

      {/* Budget Meters */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <div className="text-[12px] font-bold text-slate-300 flex items-center gap-2">
            <TrendingUp size={14} className="text-[#00C9A7]" /> Monthly Budget Meters
          </div>
          <button onClick={() => setShowBudgetForm(!showBudgetForm)}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] font-bold text-black"
            style={{ background: 'linear-gradient(135deg,#00C9A7,#4A90D9)' }}>
            <Plus size={12} /> Set Budget
          </button>
        </div>

        {showBudgetForm && (
          <div className="bg-[#162032] border border-[#00C9A7]/20 rounded-xl p-4 mb-3 flex flex-wrap gap-3 items-end">
            <div>
              <label className="block text-[10px] text-slate-500 uppercase tracking-wider mb-1">Category</label>
              <select value={newBudget.category} onChange={e => setNewBudget(p => ({ ...p, category: e.target.value }))}
                className="bg-[#1E2D40] border border-white/10 rounded-lg px-3 py-2 text-[12px] text-white focus:outline-none focus:border-[#00C9A7]">
                {CATS.map(c => <option key={c}>{c}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-[10px] text-slate-500 uppercase tracking-wider mb-1">Monthly Cap (₹)</label>
              <input type="number" value={newBudget.monthly_cap} onChange={e => setNewBudget(p => ({ ...p, monthly_cap: e.target.value }))}
                placeholder="e.g. 30000" className="bg-[#1E2D40] border border-white/10 rounded-lg px-3 py-2 text-[12px] text-white w-36 focus:outline-none focus:border-[#00C9A7]" />
            </div>
            <button onClick={saveBudget} disabled={saving || !newBudget.monthly_cap}
              className="px-4 py-2 rounded-lg text-black text-[12px] font-bold disabled:opacity-50" style={{ background: '#00C9A7' }}>
              {saving ? 'Saving…' : 'Save'}
            </button>
          </div>
        )}

        {budgets.length === 0 ? (
          <div className="bg-[#162032] border border-white/7 border-dashed rounded-xl py-10 text-center text-slate-600 text-sm">
            No budgets set. Click "Set Budget" to add spending caps per category.
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {budgets.map((b: any, i: number) => {
              const spent = Math.round(spendMap[b.category] ?? 0)
              const cap   = Number(b.monthly_cap)
              const pct   = cap > 0 ? Math.min(Math.round(spent / cap * 100), 110) : 0
              const colors = pctColor(pct)
              return (
                <div key={i} className="bg-[#162032] border border-white/7 rounded-xl p-4">
                  <div className="flex justify-between items-center mb-2">
                    <span className="text-[13px] font-bold text-white">{b.category}</span>
                    <span className="text-[13px] font-bold font-mono" style={{ color: colors.text }}>{pct}%</span>
                  </div>
                  <div className="flex justify-between text-[10px] text-slate-500 mb-2">
                    <span>{sym}{spent.toLocaleString('en-IN')} spent</span>
                    <span>cap {sym}{cap.toLocaleString('en-IN')}</span>
                  </div>
                  <div className="h-2 bg-white/6 rounded-full overflow-hidden">
                    <div className="h-full rounded-full transition-all" style={{ width: `${Math.min(pct, 100)}%`, background: colors.bar }} />
                  </div>
                  {pct >= 100 && (
                    <div className="text-[10px] text-rose-400 font-semibold mt-1.5">
                      Over by {sym}{Math.max(0, spent - cap).toLocaleString('en-IN')}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* Goals */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <div className="text-[12px] font-bold text-slate-300 flex items-center gap-2">
            <Target size={14} className="text-[#F4A535]" /> Financial Goals
          </div>
          <button onClick={() => setShowGoalForm(!showGoalForm)}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] font-bold text-black"
            style={{ background: 'linear-gradient(135deg,#F4A535,#E8556D)' }}>
            <Plus size={12} /> Add Goal
          </button>
        </div>

        {showGoalForm && (
          <div className="bg-[#162032] border border-[#F4A535]/20 rounded-xl p-4 mb-3 space-y-3">
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              <div className="col-span-2 sm:col-span-1">
                <label className="block text-[10px] text-slate-500 uppercase tracking-wider mb-1">Goal Name</label>
                <input value={newGoal.name} onChange={e => setNewGoal(p => ({ ...p, name: e.target.value }))}
                  placeholder="e.g. Emergency Fund" className="w-full bg-[#1E2D40] border border-white/10 rounded-lg px-3 py-2 text-[12px] text-white focus:outline-none focus:border-[#00C9A7]" />
              </div>
              <div>
                <label className="block text-[10px] text-slate-500 uppercase tracking-wider mb-1">Target Amount</label>
                <input type="number" value={newGoal.target_amount} onChange={e => setNewGoal(p => ({ ...p, target_amount: e.target.value }))}
                  placeholder="1000000" className="w-full bg-[#1E2D40] border border-white/10 rounded-lg px-3 py-2 text-[12px] text-white focus:outline-none focus:border-[#00C9A7]" />
              </div>
              <div>
                <label className="block text-[10px] text-slate-500 uppercase tracking-wider mb-1">Current Saved</label>
                <input type="number" value={newGoal.current_amount} onChange={e => setNewGoal(p => ({ ...p, current_amount: e.target.value }))}
                  placeholder="0" className="w-full bg-[#1E2D40] border border-white/10 rounded-lg px-3 py-2 text-[12px] text-white focus:outline-none focus:border-[#00C9A7]" />
              </div>
              <div>
                <label className="block text-[10px] text-slate-500 uppercase tracking-wider mb-1">Target Date</label>
                <input type="date" value={newGoal.target_date} onChange={e => setNewGoal(p => ({ ...p, target_date: e.target.value }))}
                  className="w-full bg-[#1E2D40] border border-white/10 rounded-lg px-3 py-2 text-[12px] text-white focus:outline-none focus:border-[#00C9A7]" />
              </div>
              <div>
                <label className="block text-[10px] text-slate-500 uppercase tracking-wider mb-1">Currency</label>
                <select value={newGoal.currency} onChange={e => setNewGoal(p => ({ ...p, currency: e.target.value, country: e.target.value === 'AED' ? 'UAE' : 'India' }))}
                  className="w-full bg-[#1E2D40] border border-white/10 rounded-lg px-3 py-2 text-[12px] text-white focus:outline-none focus:border-[#00C9A7]">
                  <option value="INR">INR 🇮🇳</option>
                  <option value="AED">AED 🇦🇪</option>
                </select>
              </div>
              <div>
                <label className="block text-[10px] text-slate-500 uppercase tracking-wider mb-1">Emoji</label>
                <input value={newGoal.emoji} onChange={e => setNewGoal(p => ({ ...p, emoji: e.target.value }))} maxLength={2}
                  className="w-full bg-[#1E2D40] border border-white/10 rounded-lg px-3 py-2 text-[18px] text-center focus:outline-none focus:border-[#00C9A7]" />
              </div>
            </div>
            <button onClick={saveGoal} disabled={saving || !newGoal.name || !newGoal.target_amount}
              className="px-5 py-2 rounded-lg text-black text-[12px] font-bold disabled:opacity-50" style={{ background: '#F4A535' }}>
              {saving ? 'Saving…' : 'Create Goal'}
            </button>
          </div>
        )}

        {goals.length === 0 ? (
          <div className="bg-[#162032] border border-white/7 border-dashed rounded-xl py-10 text-center text-slate-600 text-sm">
            No goals yet. Add your first financial goal above.
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {goals.map((g: any, i: number) => {
              const pct   = g.target_amount > 0 ? Math.min(Math.round(Number(g.current_amount) / Number(g.target_amount) * 100), 100) : 0
              const gap   = Math.max(0, Number(g.target_amount) - Number(g.current_amount))
              const gSym  = g.currency === 'AED' ? 'AED ' : '₹'
              const daysLeft = Math.ceil((new Date(g.target_date).getTime() - Date.now()) / 86400000)
              const color = pct >= 80 ? '#3CC68A' : pct >= 40 ? '#00C9A7' : '#4A90D9'
              return (
                <div key={i} className="bg-[#162032] border border-white/7 rounded-xl p-4">
                  <div className="flex items-start gap-2 mb-3">
                    <span className="text-[22px]">{g.emoji ?? '🎯'}</span>
                    <div className="flex-1 min-w-0">
                      <div className="text-[13px] font-bold text-white">{g.name}</div>
                      <div className="text-[10px] text-slate-500">Target: {g.target_date} · {daysLeft > 0 ? `${daysLeft}d left` : 'Overdue'}</div>
                    </div>
                    <span className="text-[20px] font-bold font-mono" style={{ color }}>{pct}%</span>
                  </div>
                  <div className="h-2.5 bg-white/6 rounded-full overflow-hidden mb-3">
                    <div className="h-full rounded-full transition-all" style={{ width: `${pct}%`, background: color }} />
                  </div>
                  <div className="flex justify-between text-[11px]">
                    <span className="text-slate-400">Saved: <strong className="font-mono text-white">{gSym}{Number(g.current_amount).toLocaleString('en-IN')}</strong></span>
                    <span className="text-slate-400">Target: <strong className="font-mono text-white">{gSym}{Number(g.target_amount).toLocaleString('en-IN')}</strong></span>
                  </div>
                  {gap > 0 && <div className="text-[10px] text-rose-400 font-semibold mt-1.5">Gap: {gSym}{Math.round(gap).toLocaleString('en-IN')}</div>}
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
