'use client'
import { useState } from 'react'
import { useViewStore } from '@/store/viewStore'
import { createClient } from '@/lib/supabase/client'
import { Plus, Target, BarChart2 } from 'lucide-react'

const FX = 22.80
const CATS = ['Food','Shopping','Utilities','Transport','Health','Entertainment','Travel','Education','Other']

function pctColor(pct: number): string {
  if (pct >= 100) return 'var(--rose)'
  if (pct >= 75)  return 'var(--gold)'
  return 'var(--income)'
}

const Lbl = ({ children }: { children: React.ReactNode }) => (
  <label className="block text-[10px] uppercase tracking-wider font-semibold mb-1" style={{ color: 'var(--text3)' }}>{children}</label>
)
const Inp = ({ value, onChange, type = 'text', placeholder = '' }: any) => (
  <input value={value} onChange={onChange} type={type} placeholder={placeholder}
    className="wl-input" style={{ background:'var(--bg2)' }}
    onFocus={e=>(e.target.style.borderColor='var(--sage)')}
    onBlur={e=>(e.target.style.borderColor='var(--border)')} />
)

export default function BudgetsClient({ budgets: initBudgets, goals: initGoals, transactions }: any) {
  const { view } = useViewStore()
  const [budgets, setBudgets] = useState(initBudgets)
  const [goals, setGoals]     = useState(initGoals)
  const [showBudgetForm, setShowBudgetForm] = useState(false)
  const [showGoalForm, setShowGoalForm]     = useState(false)
  const [newBudget, setNewBudget] = useState({ category: 'Food', monthly_cap: '' })
  const [newGoal, setNewGoal] = useState({ name:'', target_amount:'', current_amount:'', target_date:'', currency:'INR', country:'India', emoji:'🎯' })
  const [saving, setSaving] = useState(false)
  const supabase = createClient()
  const sym = view === 'uae' ? 'AED ' : '₹'

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
      category: newBudget.category, monthly_cap: Number(newBudget.monthly_cap),
      currency: 'INR', month_year: thisMonth,
    }, { onConflict: 'user_id,category,month_year' }).select().single()
    if (data) setBudgets((prev: any[]) => {
      const exists = prev.findIndex(b => b.category === data.category)
      return exists >= 0 ? prev.map((b, i) => i === exists ? data : b) : [...prev, data]
    })
    setShowBudgetForm(false); setNewBudget({ category:'Food', monthly_cap:'' }); setSaving(false)
  }

  async function saveGoal() {
    setSaving(true)
    const { data } = await supabase.from('goals').insert({
      name: newGoal.name, target_amount: Number(newGoal.target_amount),
      current_amount: Number(newGoal.current_amount), target_date: newGoal.target_date,
      currency: newGoal.currency, country: newGoal.country, emoji: newGoal.emoji,
    }).select().single()
    if (data) setGoals((prev: any[]) => [data, ...prev])
    setShowGoalForm(false); setNewGoal({ name:'',target_amount:'',current_amount:'',target_date:'',currency:'INR',country:'India',emoji:'🎯' }); setSaving(false)
  }

  const overBudget = budgets.filter((b: any) => (spendMap[b.category] ?? 0) > Number(b.monthly_cap)).length

  return (
    <div className="space-y-6 animate-fade-up">
      <div>
        <h1 className="text-xl font-bold" style={{ color:'var(--text)' }}>Budgets &amp; Goals</h1>
        <p className="text-[12px] mt-0.5" style={{ color:'var(--text3)' }}>{new Date().toLocaleString('default',{month:'long',year:'numeric'})}</p>
      </div>

      {overBudget > 0 && (
        <div className="flex items-center gap-3 rounded-xl px-4 py-3 text-[12px] font-medium"
          style={{ background:'var(--rose-bg)', border:'1px solid var(--rose)', color:'var(--rose)' }}>
          ⚠ <strong>{overBudget} budget{overBudget > 1 ? 's' : ''}</strong> exceeded this month.
        </div>
      )}

      {/* Budget Meters */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <div className="text-[13px] font-bold flex items-center gap-2" style={{ color:'var(--text)' }}>
            <BarChart2 size={15} style={{ color:'var(--sage)' }} /> Monthly Budgets
          </div>
          <button onClick={() => setShowBudgetForm(!showBudgetForm)}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] font-bold text-white"
            style={{ background:'var(--sage)' }}>
            <Plus size={12} /> Set Budget
          </button>
        </div>

        {showBudgetForm && (
          <div className="wl-card p-4 mb-3 flex flex-wrap gap-3 items-end" style={{ borderColor:'var(--sage)' }}>
            <div className="min-w-[120px]">
              <Lbl>Category</Lbl>
              <select value={newBudget.category} onChange={e => setNewBudget(p=>({...p,category:e.target.value}))}
                className="wl-input" style={{ background:'var(--bg2)' }}>
                {CATS.map(c => <option key={c}>{c}</option>)}
              </select>
            </div>
            <div className="min-w-[140px]">
              <Lbl>Monthly Cap (₹)</Lbl>
              <Inp value={newBudget.monthly_cap} onChange={(e:any)=>setNewBudget(p=>({...p,monthly_cap:e.target.value}))} type="number" placeholder="30000" />
            </div>
            <button onClick={saveBudget} disabled={saving || !newBudget.monthly_cap}
              className="px-4 py-2 rounded-lg text-white text-[12px] font-bold disabled:opacity-50"
              style={{ background:'var(--sage)' }}>
              {saving ? 'Saving…' : 'Save'}
            </button>
          </div>
        )}

        {budgets.length === 0
          ? <div className="wl-card py-10 text-center text-[13px]" style={{ borderStyle:'dashed', color:'var(--text3)' }}>
              No budgets set. Click "Set Budget" to add spending caps per category.
            </div>
          : (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {budgets.map((b: any, i: number) => {
                const spent = Math.round(spendMap[b.category] ?? 0)
                const cap   = Number(b.monthly_cap)
                const pct   = cap > 0 ? Math.min(Math.round(spent / cap * 100), 110) : 0
                const color = pctColor(pct)
                return (
                  <div key={i} className="wl-card p-4">
                    <div className="flex justify-between items-center mb-2">
                      <span className="text-[13px] font-bold" style={{ color:'var(--text)' }}>{b.category}</span>
                      <span className="text-[13px] font-bold font-mono" style={{ color }}>{pct}%</span>
                    </div>
                    <div className="flex justify-between text-[10px] mb-2" style={{ color:'var(--text3)' }}>
                      <span>{sym}{spent.toLocaleString('en-IN')} spent</span>
                      <span>cap {sym}{cap.toLocaleString('en-IN')}</span>
                    </div>
                    <div className="h-2 rounded-full overflow-hidden" style={{ background:'var(--bg2)' }}>
                      <div className="h-full rounded-full transition-all" style={{ width:`${Math.min(pct,100)}%`, background:color }} />
                    </div>
                    {pct >= 100 && (
                      <div className="text-[10px] font-semibold mt-1.5" style={{ color:'var(--rose)' }}>
                        Over by {sym}{Math.max(0, spent-cap).toLocaleString('en-IN')}
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          )
        }
      </div>

      {/* Goals */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <div className="text-[13px] font-bold flex items-center gap-2" style={{ color:'var(--text)' }}>
            <Target size={15} style={{ color:'var(--gold)' }} /> Financial Goals
          </div>
          <button onClick={() => setShowGoalForm(!showGoalForm)}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] font-bold text-white"
            style={{ background:'var(--gold)' }}>
            <Plus size={12} /> Add Goal
          </button>
        </div>

        {showGoalForm && (
          <div className="wl-card p-4 mb-3 space-y-3" style={{ borderColor:'var(--gold)' }}>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              <div className="col-span-2 sm:col-span-1">
                <Lbl>Goal Name</Lbl>
                <Inp value={newGoal.name} onChange={(e:any)=>setNewGoal(p=>({...p,name:e.target.value}))} placeholder="Emergency Fund" />
              </div>
              <div>
                <Lbl>Target Amount</Lbl>
                <Inp value={newGoal.target_amount} onChange={(e:any)=>setNewGoal(p=>({...p,target_amount:e.target.value}))} type="number" placeholder="1000000" />
              </div>
              <div>
                <Lbl>Current Saved</Lbl>
                <Inp value={newGoal.current_amount} onChange={(e:any)=>setNewGoal(p=>({...p,current_amount:e.target.value}))} type="number" placeholder="0" />
              </div>
              <div>
                <Lbl>Target Date</Lbl>
                <Inp value={newGoal.target_date} onChange={(e:any)=>setNewGoal(p=>({...p,target_date:e.target.value}))} type="date" />
              </div>
              <div>
                <Lbl>Currency</Lbl>
                <select value={newGoal.currency} onChange={e=>setNewGoal(p=>({...p,currency:e.target.value,country:e.target.value==='AED'?'UAE':'India'}))}
                  className="wl-input" style={{ background:'var(--bg2)' }}>
                  <option value="INR">INR 🇮🇳</option>
                  <option value="AED">AED 🇦🇪</option>
                </select>
              </div>
              <div>
                <Lbl>Emoji</Lbl>
                <Inp value={newGoal.emoji} onChange={(e:any)=>setNewGoal(p=>({...p,emoji:e.target.value}))} />
              </div>
            </div>
            <button onClick={saveGoal} disabled={saving || !newGoal.name || !newGoal.target_amount}
              className="px-5 py-2 rounded-lg text-white text-[12px] font-bold disabled:opacity-50"
              style={{ background:'var(--gold)' }}>
              {saving ? 'Saving…' : 'Create Goal'}
            </button>
          </div>
        )}

        {goals.length === 0
          ? <div className="wl-card py-10 text-center text-[13px]" style={{ borderStyle:'dashed', color:'var(--text3)' }}>
              No goals yet. Add your first financial goal above.
            </div>
          : (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {goals.map((g: any, i: number) => {
                const pct = g.target_amount > 0 ? Math.min(Math.round(Number(g.current_amount)/Number(g.target_amount)*100), 100) : 0
                const gap = Math.max(0, Number(g.target_amount)-Number(g.current_amount))
                const gSym = g.currency === 'AED' ? 'AED ' : '₹'
                const daysLeft = Math.ceil((new Date(g.target_date).getTime() - Date.now()) / 86400000)
                const color = pct >= 80 ? 'var(--income)' : pct >= 40 ? 'var(--sage)' : 'var(--blue)'
                return (
                  <div key={i} className="wl-card p-4">
                    <div className="flex items-start gap-2 mb-3">
                      <span className="text-[22px]">{g.emoji ?? '🎯'}</span>
                      <div className="flex-1 min-w-0">
                        <div className="text-[13px] font-bold" style={{ color:'var(--text)' }}>{g.name}</div>
                        <div className="text-[10px]" style={{ color:'var(--text3)' }}>
                          Target: {g.target_date} · {daysLeft > 0 ? `${daysLeft}d left` : 'Overdue'}
                        </div>
                      </div>
                      <span className="text-[18px] font-bold font-mono" style={{ color }}>{pct}%</span>
                    </div>
                    <div className="h-2.5 rounded-full overflow-hidden mb-3" style={{ background:'var(--bg2)' }}>
                      <div className="h-full rounded-full transition-all" style={{ width:`${pct}%`, background:color }} />
                    </div>
                    <div className="flex justify-between text-[11px]" style={{ color:'var(--text3)' }}>
                      <span>Saved: <strong className="font-mono" style={{ color:'var(--text)' }}>{gSym}{Number(g.current_amount).toLocaleString('en-IN')}</strong></span>
                      <span>Target: <strong className="font-mono" style={{ color:'var(--text)' }}>{gSym}{Number(g.target_amount).toLocaleString('en-IN')}</strong></span>
                    </div>
                    {gap > 0 && <div className="text-[10px] font-semibold mt-1.5" style={{ color:'var(--rose)' }}>Gap: {gSym}{Math.round(gap).toLocaleString('en-IN')}</div>}
                  </div>
                )
              })}
            </div>
          )
        }
      </div>
    </div>
  )
}
