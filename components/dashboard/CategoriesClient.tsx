'use client'
import { useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { ChevronLeft, Lock, HelpCircle } from 'lucide-react'
import { PageHeader, Segmented } from '@/components/ui/kit'
import { CategoryIcon } from '@/components/ui/CategoryIcon'
import { CategoryManager } from '@/components/forms/ManageCategoriesSheet'
import CategoryGuide from '@/components/forms/CategoryGuide'
import { GROUPS, groupKeyOf, investKindOf, type CatKind } from '@/lib/categories'
import { catOf, isSpend, myShare } from '@/lib/money'
import { fmtMoney } from '@/lib/format'
import { useCategoryStore } from '@/store/categoryStore'

type Cur = 'AED' | 'INR'
type Amounts = Partial<Record<Cur, number>>
const add = (m: Record<string, Amounts>, k: string, cur: Cur, v: number) => { const e = (m[k] ||= {}); e[cur] = (e[cur] ?? 0) + v }
// Dirhams and rupees side by side, never added together
const show = (a?: Amounts) => (['AED', 'INR'] as Cur[]).filter(c => (a?.[c] ?? 0) > 0).map(c => fmtMoney(a![c]!, c)).join(' · ')

// Settings › Categories: the fixed categories on the left, the picked one's
// sub-categories on the right — need or want, this year's amount, and your own
// to add, rename, move or delete
export default function CategoriesClient({ txns, year }: { txns: any[]; year: string }) {
  const router = useRouter()
  const { rows } = useCategoryStore()
  const [kind, setKind] = useState<CatKind>('expense')
  const [sel, setSel] = useState<string>('food')
  const [guide, setGuide] = useState(false)

  // This year: transactions and amounts per sub-category, per category, and
  // per kind of investment
  const { usage, byName, byGroup } = useMemo(() => {
    const usage: Record<string, number> = {}, byName: Record<string, Amounts> = {}, byGroup: Record<string, Amounts> = {}
    for (const t of txns) {
      const name = catOf(t), cur: Cur = t.currency === 'AED' ? 'AED' : 'INR'
      const k: CatKind = t.txn_type === 'income' ? 'income' : 'expense'
      if (k !== kind) continue
      usage[name] = (usage[name] ?? 0) + 1
      if (kind === 'expense' && !isSpend(t)) continue
      const v = kind === 'expense' ? myShare(t) : Number(t.amount) || 0
      add(byName, name, cur, v)
      const g = groupKeyOf(name, rows, kind)
      if (g) add(byGroup, g, cur, v)
      if (name === 'Investment') add(byName, `invest:${investKindOf(t)}`, cur, v)
    }
    return { usage, byName, byGroup }
  }, [txns, kind, rows])

  const groups = GROUPS.filter(g => g.kind === kind)
  const count = (k: string) => rows.filter(r => r.kind === kind && groupKeyOf(r.name, rows, kind) === k).length
  const picked = groups.find(g => g.key === sel) ?? groups[0]
  const pick = (k: CatKind) => { setKind(k); setSel(k === 'expense' ? 'food' : 'earned') }

  const nav = (compact: boolean) => groups.map(g => {
    const on = g.key === picked.key, amt = show(byGroup[g.key])
    return compact ? (
      <button key={g.key} onClick={() => setSel(g.key)} aria-pressed={on} className="wl-chip flex-shrink-0 gap-1.5" style={{ height: 34 }}>
        <i className="w-2 h-2 rounded-sm" style={{ background: g.color }} />{g.label}
      </button>
    ) : (
      <button key={g.key} onClick={() => setSel(g.key)} aria-current={on ? 'true' : undefined}
        className="w-full flex items-center gap-2.5 min-h-[48px] px-3 rounded-[11px] text-left transition-colors"
        style={on ? { background: 'var(--accent-bg)', color: 'var(--accent2)' } : { color: 'var(--text)' }}>
        <span className="w-8 h-8 rounded-[9px] flex items-center justify-center flex-shrink-0" style={{ background: g.color + '1A', color: g.color }}><CategoryIcon icon={g.icon} size={15} /></span>
        <span className="flex-1 min-w-0">
          <span className="block text-[13.5px] font-semibold truncate">{g.label}</span>
          <span className="block text-[11.5px] truncate" style={{ color: 'var(--text4)' }}>{count(g.key)} sub-categor{count(g.key) === 1 ? 'y' : 'ies'}{amt ? ` · ${amt}` : ''}</span>
        </span>
      </button>
    )
  })

  return (
    <div className="flex flex-col gap-3.5 md:gap-[18px] animate-fade-up">
      <Link href="/dashboard/settings" className="inline-flex items-center gap-1 text-[12.5px] font-semibold -mb-1" style={{ color: 'var(--accent2)' }}><ChevronLeft size={14} />Settings</Link>
      <PageHeader title="Categories" sub="The categories are fixed, so every report adds up the same way. Everything under them is yours to shape." />
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="w-[320px] max-w-full">
          <Segmented full label="Category type" value={kind} onChange={pick}
            options={[{ value: 'expense', label: 'Spending' }, { value: 'income', label: 'Income' }]} />
        </div>
        <button onClick={() => setGuide(true)} className="wl-btn" style={{ height: 38 }}><HelpCircle size={14} />What goes where</button>
      </div>
      {guide && <CategoryGuide rows={rows} initialKind={kind} onClose={() => setGuide(false)} />}

      {/* Phones: the categories as a row of chips */}
      <div className="md:hidden flex gap-1.5 overflow-x-auto no-scrollbar -mx-4 px-4" role="group" aria-label="Categories">{nav(true)}</div>

      <div className="grid md:grid-cols-[300px_minmax(0,1fr)] gap-3.5 md:gap-[18px] items-start">
        <nav className="hidden md:flex wl-card p-2 flex-col gap-0.5" aria-label="Categories">
          <div className="text-[11px] font-semibold uppercase tracking-[0.05em] px-3 pt-2 pb-1.5" style={{ color: 'var(--text3)' }}>{kind === 'expense' ? 'Spending' : 'Income'}</div>
          {nav(false)}
        </nav>

        <section className="wl-card overflow-hidden">
          <div className="flex items-center gap-3 px-4 md:px-5 py-4" style={{ borderBottom: '1px solid var(--line)' }}>
            <span className="w-10 h-10 rounded-[11px] flex items-center justify-center flex-shrink-0" style={{ background: picked.color + '1A', color: picked.color }}><CategoryIcon icon={picked.icon} size={18} /></span>
            <div className="flex-1 min-w-0">
              <h2 className="text-[16px] md:text-[17px] font-bold" style={{ color: 'var(--text)' }}>{picked.label}</h2>
              <div className="text-[12px] flex items-center gap-1" style={{ color: 'var(--text3)' }}>
                <Lock size={11} />Fixed category{!picked.spending && kind === 'expense' ? ' · not counted as spending' : ''}
              </div>
            </div>
            {show(byGroup[picked.key]) && (
              <div className="text-right flex-shrink-0">
                <div className="text-[14px] font-bold tabular-nums" style={{ color: 'var(--text)' }}>{show(byGroup[picked.key])}</div>
                <div className="text-[11px]" style={{ color: 'var(--text4)' }}>in {year}</div>
              </div>
            )}
          </div>
          <div className="px-4 md:px-5 py-4">
            <CategoryManager kind={kind} only={picked.key} usage={usage} amountOf={n => show(byName[n]) || undefined} onChanged={() => router.refresh()} />
          </div>
          {kind === 'expense' && picked.spending && (
            <div className="px-4 md:px-5 py-3 text-[12px] leading-relaxed" style={{ borderTop: '1px solid var(--line)', background: '#FAFAFE', color: 'var(--text3)' }}>
              <b style={{ color: 'var(--text2)' }}>Need or want?</b> Needs are what you’d still pay in a tight month. Your emergency fund is sized on needs and EMIs, and the reports show how much went on wants.
            </div>
          )}
        </section>
      </div>
    </div>
  )
}
