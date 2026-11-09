'use client'
import { useEffect, useMemo, useState } from 'react'
import { X, Search, ArrowRight } from 'lucide-react'
import { Segmented } from '@/components/ui/kit'
import { CategoryIcon } from '@/components/ui/CategoryIcon'
import { groupedCategories, needOf, isGeneral, examplesOf, isBuiltIn, NOT_A_CATEGORY, INVEST_KINDS, type Category, type CatKind } from '@/lib/categories'

// What goes where: every category, its sub-categories and what to put in each
// (with the usual UAE / India names), need or want — so picking is easy.
// `onPick`: choose one straight from the guide.
export default function CategoryGuide({ rows, initialKind = 'expense', onClose, onPick }: {
  rows: Category[]; initialKind?: CatKind; onClose: () => void; onPick?: (name: string, kind: CatKind) => void
}) {
  const [kind, setKind] = useState<CatKind>(initialKind)
  const [q, setQ] = useState('')
  useEffect(() => {
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', esc); return () => window.removeEventListener('keydown', esc)
  }, [onClose])

  const query = q.trim().toLowerCase()
  const groups = useMemo(() => groupedCategories(rows, kind).map(g => ({
    ...g,
    items: g.items.filter(c => !query || g.group.label.toLowerCase().includes(query) || c.name.toLowerCase().includes(query) || examplesOf(c.name, kind).toLowerCase().includes(query)
      || (c.name === 'Investment' && INVEST_KINDS.some(k => k.toLowerCase().includes(query)))),
  })).filter(g => g.items.length), [rows, kind, query])

  return (
    <div className="fixed inset-0 wl-sheet z-[70] flex items-center justify-center p-4" style={{ background: 'rgba(15,23,42,.4)' }} onClick={onClose}>
      <div className="wl-sheet-panel bg-white w-full max-w-[720px] rounded-2xl flex flex-col max-h-[90vh]" style={{ boxShadow: '0 24px 60px rgba(15,23,42,.3)' }}
        onClick={e => e.stopPropagation()} role="dialog" aria-modal="true" aria-label="What goes where">
        <div className="px-5 md:px-6 pt-5 md:pt-6 pb-3 flex flex-col gap-3">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h2 className="text-[18px] font-bold" style={{ color: 'var(--text)' }}>What goes where</h2>
              <p className="text-[12.5px] mt-0.5" style={{ color: 'var(--text3)' }}>Each sub-category and what to put in it. Search for a shop or a thing, like “talabat” or “badminton”.</p>
            </div>
            <button onClick={onClose} aria-label="Close" className="w-8 h-8 -mr-1 rounded-lg flex items-center justify-center hover:bg-[var(--bg2)]" style={{ color: 'var(--text3)' }}><X size={18} /></button>
          </div>
          <div className="flex gap-2 flex-wrap">
            <div className="w-[220px]"><Segmented full label="Category type" value={kind} onChange={setKind} options={[{ value: 'expense', label: 'Spending' }, { value: 'income', label: 'Income' }]} /></div>
            <div className="relative flex-1 min-w-[200px]">
              <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2" style={{ color: 'var(--text4)' }} aria-hidden />
              <input value={q} onChange={e => setQ(e.target.value)} placeholder="Search: salik, maid, netflix…" aria-label="Search the guide"
                className="wl-input w-full" style={{ height: 38, fontSize: 13.5, paddingLeft: 32 }} />
            </div>
          </div>
        </div>

        <div className="overflow-y-auto px-5 md:px-6 pb-5" style={{ borderTop: '1px solid var(--line)' }}>
          {groups.map(({ group, items }) => (
            <section key={group.key} className="pt-4">
              <h3 className="flex items-center gap-2 text-[13px] font-bold mb-1.5" style={{ color: 'var(--text)' }}>
                <span className="w-6 h-6 rounded-[7px] flex items-center justify-center" style={{ background: group.color + '1A', color: group.color }}><CategoryIcon icon={group.icon} size={13} /></span>
                {group.label}{!group.spending && kind === 'expense' && <span className="text-[11.5px] font-normal" style={{ color: 'var(--text4)' }}>· not counted as spending</span>}
              </h3>
              <div className="rounded-xl overflow-hidden" style={{ border: '1px solid var(--line)' }}>
                {items.map((c, i) => {
                  const need = kind === 'expense' ? needOf(c.name, rows) : null
                  const ex = examplesOf(c.name, kind) || (isBuiltIn(kind, c.name) ? '' : 'Your own sub-category')
                  const row = (
                    <div className="grid grid-cols-[minmax(0,1fr)] md:grid-cols-[190px_minmax(0,1fr)_auto] gap-x-3 gap-y-0.5 items-center px-3 py-2.5 text-left w-full" style={{ borderTop: i ? '1px solid var(--track)' : 'none' }}>
                      <span className="flex items-center gap-2 min-w-0">
                        <span className="w-6 h-6 rounded-full flex items-center justify-center flex-shrink-0" style={{ background: c.color + '1A', color: c.color }}><CategoryIcon icon={c.icon} size={12} /></span>
                        <span className="text-[13px] font-semibold truncate" style={{ color: 'var(--text)' }}>{isGeneral(c.name) && items.length > 1 ? `${group.label} (general)` : c.name}</span>
                        {need != null && <span className="md:hidden text-[10px] font-semibold px-1.5 rounded-full" style={need ? { background: '#E7F1FE', color: '#1D5FA8' } : { background: '#FFF1E6', color: '#9A3412' }}>{need ? 'Need' : 'Want'}</span>}
                      </span>
                      <span className="text-[12.5px] leading-snug max-md:pl-8" style={{ color: 'var(--text3)' }}>{ex}</span>
                      <span className="hidden md:inline-flex justify-end w-[46px]">
                        {need != null && <span className="text-[10.5px] font-semibold px-1.5 py-[1px] rounded-full" style={need ? { background: '#E7F1FE', color: '#1D5FA8' } : { background: '#FFF1E6', color: '#9A3412' }}>{need ? 'Need' : 'Want'}</span>}
                      </span>
                    </div>
                  )
                  return onPick && !(kind === 'expense' && c.name === 'Family Transfer')
                    ? <button key={c.id} type="button" onClick={() => { onPick(c.name, kind); onClose() }} className="block w-full hover:bg-[#FAFAFE]" title={`Use ${c.name}`}>{row}</button>
                    : <div key={c.id}>{row}</div>
                })}
              </div>
            </section>
          ))}
          {groups.length === 0 && <div className="text-[13px] py-8 text-center" style={{ color: 'var(--text3)' }}>Nothing matches “{q}”. Use Other, or add your own sub-category.</div>}

          {kind === 'expense' && !query && (
            <section className="pt-5">
              <h3 className="text-[13px] font-bold mb-1.5" style={{ color: 'var(--text)' }}>Not a category — pick it as a transfer</h3>
              <div className="rounded-xl overflow-hidden" style={{ border: '1px solid var(--line)', background: '#FAFAFE' }}>
                {NOT_A_CATEGORY.map((x, i) => (
                  <div key={x.what} className="flex items-center justify-between gap-3 px-3 py-2.5 text-[12.5px] flex-wrap" style={{ borderTop: i ? '1px solid var(--track)' : 'none' }}>
                    <span style={{ color: 'var(--text2)' }}>{x.what}</span>
                    <span className="inline-flex items-center gap-1 font-semibold" style={{ color: 'var(--accent2)' }}><ArrowRight size={12} />{x.how}</span>
                  </div>
                ))}
              </div>
            </section>
          )}
        </div>
      </div>
    </div>
  )
}
