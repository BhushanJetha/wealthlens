'use client'
import { useEffect, useState } from 'react'
import { X, Plus, Pencil, Trash2, Lock, Loader2, AlertTriangle, Check } from 'lucide-react'
import { Segmented } from '@/components/ui/kit'
import { CategoryIcon, CATEGORY_ICONS } from '@/components/ui/CategoryIcon'
import { CATEGORY_COLORS, isSystemCategory, type Category, type CatKind } from '@/lib/categories'
import { useCategoryStore } from '@/store/categoryStore'
import { toast } from '@/components/ui/toaster'

type Draft = { name: string; color: string; icon: string }

// Add, rename, recolour and delete expense / income categories.
// Built-in categories the totals depend on are locked to colour + icon.
export default function ManageCategoriesSheet({ onClose, initialKind = 'expense', usage = {}, onChanged }: {
  onClose: () => void; initialKind?: CatKind
  usage?: Record<string, number>          // transactions per category name, when known
  onChanged?: () => void                  // e.g. refresh the page after a rename / delete
}) {
  const { rows, persisted, status, load, add, update, remove } = useCategoryStore()
  const [kind, setKind] = useState<CatKind>(initialKind)
  const [editing, setEditing] = useState<string | null>(null)       // category id, or 'new'
  const [draft, setDraft] = useState<Draft>({ name: '', color: CATEGORY_COLORS[0], icon: 'tag' })
  const [deleting, setDeleting] = useState<string | null>(null)
  const [moveTo, setMoveTo] = useState('Other')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => { load() }, [load])
  useEffect(() => {
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', esc); return () => window.removeEventListener('keydown', esc)
  }, [onClose])

  const list = rows.filter(r => r.kind === kind)
  const startNew = () => { setDeleting(null); setError(''); setEditing('new'); setDraft({ name: '', color: CATEGORY_COLORS[list.length % CATEGORY_COLORS.length], icon: 'tag' }) }
  const startEdit = (c: Category) => { setDeleting(null); setError(''); setEditing(c.id); setDraft({ name: c.name, color: c.color, icon: c.icon || 'tag' }) }
  const startDelete = (c: Category) => { setEditing(null); setError(''); setDeleting(c.id); setMoveTo('Other') }

  async function save() {
    setBusy(true); setError('')
    const err = editing === 'new' ? await add({ kind, ...draft }) : await update(editing!, draft)
    setBusy(false)
    if (err) { setError(err); return }
    const renamed = editing !== 'new' && rows.find(r => r.id === editing)?.name !== draft.name.trim()
    toast(editing === 'new' ? `Added ${draft.name.trim()}` : 'Category saved')
    setEditing(null)
    if (renamed) onChanged?.()
  }
  async function confirmDelete(c: Category) {
    setBusy(true); setError('')
    const err = await remove(c.id, moveTo)
    setBusy(false)
    if (err) { setError(err); return }
    toast(`Deleted ${c.name}`)
    setDeleting(null); onChanged?.()
  }

  const editor = (locked: boolean) => (
    <div className="rounded-xl px-3.5 py-3.5 flex flex-col gap-3" style={{ background: '#FAFAFE', border: '1px solid var(--accent-border)' }}>
      <div>
        <Label>Name</Label>
        <input autoFocus value={draft.name} disabled={locked} maxLength={40} onChange={e => setDraft(d => ({ ...d, name: e.target.value }))}
          onKeyDown={e => { if (e.key === 'Enter') save() }} placeholder="e.g. Groceries, Kids, Pets"
          className="wl-input" style={{ height: 42, fontSize: 14, background: locked ? 'var(--track)' : '#fff' }} />
        {locked && <div className="text-[11.5px] mt-1.5 flex items-center gap-1" style={{ color: 'var(--text3)' }}><Lock size={11} />Built-in name — totals elsewhere depend on it</div>}
      </div>
      <div>
        <Label>Colour</Label>
        <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="Colour">
          {CATEGORY_COLORS.map(c => (
            <button key={c} role="radio" aria-checked={draft.color === c} aria-label={c} onClick={() => setDraft(d => ({ ...d, color: c }))}
              className="w-7 h-7 rounded-full flex items-center justify-center" style={{ background: c, boxShadow: draft.color === c ? `0 0 0 2px #fff, 0 0 0 4px ${c}` : 'none' }}>
              {draft.color === c && <Check size={14} color="#fff" />}
            </button>
          ))}
        </div>
      </div>
      <div>
        <Label>Icon</Label>
        <div className="grid grid-cols-8 gap-1.5" role="radiogroup" aria-label="Icon">
          {Object.keys(CATEGORY_ICONS).map(k => (
            <button key={k} role="radio" aria-checked={draft.icon === k} aria-label={k} onClick={() => setDraft(d => ({ ...d, icon: k }))}
              className="h-9 rounded-[9px] flex items-center justify-center transition-colors"
              style={draft.icon === k ? { background: draft.color + '22', color: draft.color, boxShadow: `inset 0 0 0 1.5px ${draft.color}` } : { background: '#fff', color: 'var(--text3)', border: '1px solid var(--line)' }}>
              <CategoryIcon icon={k} size={16} />
            </button>
          ))}
        </div>
      </div>
      {error && <ErrorBox text={error} />}
      <div className="flex gap-2">
        <button onClick={() => { setEditing(null); setError('') }} className="wl-btn" style={{ height: 40, padding: '0 16px', fontSize: 13 }}>Cancel</button>
        <button onClick={save} disabled={busy} className="wl-btn wl-btn-primary flex-1" style={{ height: 40, fontSize: 13.5 }}>
          {busy ? <Loader2 size={14} className="animate-spin" /> : null}{editing === 'new' ? 'Add category' : 'Save'}
        </button>
      </div>
    </div>
  )

  return (
    <div className="fixed inset-0 wl-sheet z-[60] flex items-center justify-center p-4" style={{ background: 'rgba(15,23,42,.4)' }} onClick={onClose}>
      <div className="wl-sheet-panel bg-white w-full max-w-[460px] rounded-2xl flex flex-col max-h-[88vh]" style={{ boxShadow: '0 24px 60px rgba(15,23,42,.3)' }}
        onClick={e => e.stopPropagation()} role="dialog" aria-modal="true" aria-label="Manage categories">
        <div className="px-5 md:px-6 pt-5 md:pt-6 pb-3 flex flex-col gap-3">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h2 className="text-[18px] font-bold" style={{ color: 'var(--text)' }}>Categories</h2>
              <p className="text-[12.5px] mt-0.5" style={{ color: 'var(--text3)' }}>Add your own, rename, recolour or remove. Renaming also updates past transactions.</p>
            </div>
            <button onClick={onClose} aria-label="Close" className="w-8 h-8 -mr-1 rounded-lg flex items-center justify-center hover:bg-[var(--bg2)]" style={{ color: 'var(--text3)' }}><X size={18} /></button>
          </div>
          <Segmented full label="Category type" value={kind} onChange={k => { setKind(k); setEditing(null); setDeleting(null); setError('') }}
            options={[{ value: 'expense', label: 'Expense' }, { value: 'income', label: 'Income' }]} />
          {status === 'ready' && !persisted && (
            <div className="rounded-xl px-3.5 py-2.5 text-[12.5px] leading-snug flex gap-2" style={{ background: '#FFF7E6', border: '1px solid #F8DDB8', color: '#92560B' }}>
              <AlertTriangle size={15} className="flex-shrink-0 mt-0.5" />
              <span>You’re seeing the built-in list. To save your own categories, run <b>supabase/migrations/024_categories.sql</b> in Supabase, then reopen this.</span>
            </div>
          )}
          {editing === 'new' ? editor(false) : (
            <button onClick={startNew} disabled={!persisted} className="wl-btn w-full disabled:opacity-50" style={{ height: 40, fontSize: 13, borderStyle: 'dashed', color: 'var(--accent2)' }}>
              <Plus size={15} />Add {kind} category
            </button>
          )}
        </div>

        <div className="overflow-y-auto px-5 md:px-6 pb-2" style={{ borderTop: '1px solid var(--line)' }}>
          {status !== 'ready' ? (
            <div className="py-10 flex justify-center" style={{ color: 'var(--text3)' }}><Loader2 size={18} className="animate-spin" /></div>
          ) : list.map((c, i) => {
            const locked = isSystemCategory(c.kind, c.name)
            const n = usage[c.name]
            if (editing === c.id) return <div key={c.id} className="py-3">{editor(locked)}</div>
            return (
              <div key={c.id} style={{ borderTop: i ? '1px solid var(--track)' : 'none' }}>
                <div className="flex items-center gap-3 py-2.5">
                  <span className="w-9 h-9 rounded-[10px] flex items-center justify-center flex-shrink-0" style={{ background: c.color + '1A', color: c.color }}><CategoryIcon icon={c.icon} size={16} /></span>
                  <div className="flex-1 min-w-0">
                    <div className="text-[13.5px] font-semibold truncate" style={{ color: 'var(--text)' }}>{c.name}</div>
                    {(locked || n) ? (
                      <div className="text-[11.5px] flex items-center gap-1" style={{ color: 'var(--text4)' }}>
                        {locked && <><Lock size={10} />Built-in{n ? ' · ' : ''}</>}
                        {n ? `${n} transaction${n === 1 ? '' : 's'}` : ''}
                      </div>
                    ) : null}
                  </div>
                  <button onClick={() => startEdit(c)} disabled={!persisted} aria-label={`Edit ${c.name}`} className="w-8 h-8 rounded-lg flex items-center justify-center hover:bg-[var(--accent-bg)] disabled:opacity-30" style={{ color: 'var(--text3)' }}><Pencil size={14} /></button>
                  <button onClick={() => startDelete(c)} disabled={!persisted || locked} aria-label={`Delete ${c.name}`} title={locked ? 'Built-in categories can’t be deleted' : undefined}
                    className="w-8 h-8 rounded-lg flex items-center justify-center hover:bg-[#FDECE8] disabled:opacity-25" style={{ color: '#DC2626' }}><Trash2 size={14} /></button>
                </div>
                {deleting === c.id && (
                  <div className="rounded-xl px-3.5 py-3 mb-3 flex flex-col gap-2.5" style={{ background: '#FFF6F4', border: '1px solid #F6CFC6' }}>
                    <div className="text-[12.5px] leading-snug" style={{ color: 'var(--text2)' }}>
                      Delete <b>{c.name}</b>? {n ? `Its ${n} transaction${n === 1 ? '' : 's'} will move to the category below.` : 'Any transactions in it will move to the category below.'}{kind === 'expense' ? ' Its budgets are removed.' : ''}
                    </div>
                    <select value={moveTo} onChange={e => setMoveTo(e.target.value)} aria-label="Move transactions to" className="wl-input" style={{ height: 40, background: '#fff' }}>
                      {list.filter(x => x.id !== c.id).map(x => <option key={x.id} value={x.name}>Move to {x.name}</option>)}
                    </select>
                    {error && <ErrorBox text={error} />}
                    <div className="flex gap-2">
                      <button onClick={() => { setDeleting(null); setError('') }} className="wl-btn" style={{ height: 38, padding: '0 14px' }}>Keep it</button>
                      <button onClick={() => confirmDelete(c)} disabled={busy} className="wl-btn flex-1" style={{ height: 38, background: '#DC2626', borderColor: '#DC2626', color: '#fff' }}>
                        {busy ? <Loader2 size={14} className="animate-spin" /> : <Trash2 size={14} />}Delete category
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )
          })}
        </div>

        <div className="px-5 md:px-6 py-4" style={{ borderTop: '1px solid var(--line)' }}>
          <button onClick={onClose} className="wl-btn wl-btn-primary w-full" style={{ height: 44, fontSize: 14 }}>Done</button>
        </div>
      </div>
    </div>
  )
}

const Label = ({ children }: { children: React.ReactNode }) => (
  <div className="text-[11px] font-semibold uppercase tracking-[0.05em] mb-1.5" style={{ color: 'var(--text3)' }}>{children}</div>
)
const ErrorBox = ({ text }: { text: string }) => (
  <div className="rounded-lg px-3 py-2 text-[12.5px] leading-snug" style={{ background: '#FDECE8', color: '#B4231A' }}>{text}</div>
)
