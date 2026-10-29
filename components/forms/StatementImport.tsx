'use client'
import { X, Loader2, Lock, Eye, EyeOff, FileText, CheckCircle2, AlertCircle, Upload, Trash2, Check, ShieldCheck } from 'lucide-react'

// The pieces both statement imports (bank, credit card) are built from, in the
// v2 style: a sheet with what this is and where you are (choose → check →
// saved), a drop zone, the password step, and the review list (a card per row
// on every screen size, so phones need no sideways scrolling).

export type ImportStage = 'idle' | 'detecting' | 'needs-password' | 'parsing' | 'review' | 'saving' | 'done' | 'error'
const STEPS = ['Choose PDF', 'Check rows', 'Saved']
const stepOf = (s: ImportStage) => s === 'review' || s === 'saving' ? 1 : s === 'done' ? 2 : 0

export function ImportSheet({ icon: Icon, color, title, hint, stage, onClose, footer, children }: {
  icon: typeof FileText; color: string; title: string; hint: string; stage: ImportStage
  onClose: () => void; footer?: React.ReactNode; children: React.ReactNode
}) {
  const step = stepOf(stage)
  return (
    <div className="fixed inset-0 wl-sheet z-50 flex items-center justify-center p-4" style={{ background: 'rgba(15,23,42,0.45)' }}>
      <div role="dialog" aria-modal="true" aria-label={title} className="wl-sheet-panel w-full max-w-[720px] rounded-2xl flex flex-col"
        style={{ background: 'var(--card)', border: '1px solid var(--line)', boxShadow: '0 24px 60px rgba(15,23,42,.25)', maxHeight: '90vh' }}>
        <div className="flex items-start justify-between gap-3 px-5 pt-4 pb-3 flex-shrink-0">
          <div className="flex items-center gap-3 min-w-0">
            <span className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0" style={{ background: color + '1A', color }}><Icon size={19} /></span>
            <div className="min-w-0">
              <div className="text-[16px] font-bold" style={{ color: 'var(--text)' }}>{title}</div>
              <div className="text-[12px] leading-snug" style={{ color: 'var(--text3)' }}>{hint}</div>
            </div>
          </div>
          <button onClick={onClose} aria-label="Close" className="p-2 -mr-2 rounded-xl hover:bg-gray-100 flex-shrink-0" style={{ color: 'var(--text3)' }}><X size={16} /></button>
        </div>
        <ol className="flex items-center gap-2 px-5 pb-3 flex-shrink-0" aria-label="Steps">
          {STEPS.map((s, i) => (
            <li key={s} className={`flex items-center gap-2 min-w-0 ${i < STEPS.length - 1 ? 'flex-1' : ''}`} aria-current={i === step ? 'step' : undefined}>
              <span className="w-5 h-5 rounded-full text-[11px] font-bold flex items-center justify-center flex-shrink-0"
                style={i < step ? { background: '#1E8F5F', color: '#fff' } : i === step ? { background: 'var(--accent)', color: '#fff' } : { background: 'var(--track)', color: 'var(--text4)' }}>
                {i < step ? <Check size={12} strokeWidth={3} /> : i + 1}
              </span>
              <span className="text-[12px] font-semibold whitespace-nowrap" style={{ color: i === step ? 'var(--text)' : 'var(--text4)' }}>{s}</span>
              {i < STEPS.length - 1 && <span className="flex-1 h-px min-w-[12px]" style={{ background: 'var(--line)' }} />}
            </li>
          ))}
        </ol>
        <div className="flex-1 min-h-0 overflow-y-auto px-5 py-4" style={{ borderTop: '1px solid var(--line)' }}>{children}</div>
        {footer && <div className="flex gap-2.5 px-5 py-3.5 flex-shrink-0" style={{ borderTop: '1px solid var(--line)' }}>{footer}</div>}
      </div>
    </div>
  )
}

export function FieldLabel({ children }: { children: React.ReactNode }) {
  return <div className="text-[11px] font-semibold uppercase tracking-[0.05em] mb-1.5" style={{ color: 'var(--text3)' }}>{children}</div>
}

export function BankField({ value, onChange, banks }: { value: string; onChange: (v: string) => void; banks: { value: string; label: string }[] }) {
  return (
    <label className="block">
      <FieldLabel>Bank <span className="normal-case tracking-normal font-medium" style={{ color: 'var(--text4)' }}>· optional, helps with the password hint</span></FieldLabel>
      <select value={value} onChange={e => onChange(e.target.value)} className="wl-input w-full" style={{ height: 44 }}>
        {banks.map(b => <option key={b.value} value={b.value}>{b.label}</option>)}
      </select>
    </label>
  )
}

// `root` / `input` = react-dropzone's getRootProps() / getInputProps()
export function DropZone({ root, input, active, file, onClear, what }: {
  root: any; input: any; active: boolean; file: File | null; onClear: () => void; what: string
}) {
  return (
    <div className="flex flex-col gap-2.5">
      {file ? (
        <div className="flex items-center gap-3 rounded-2xl p-3.5" style={{ border: '1.5px solid var(--accent-border)', background: 'var(--accent-bg)' }}>
          <span className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0" style={{ background: '#fff', color: 'var(--accent)' }}><FileText size={18} /></span>
          <div className="flex-1 min-w-0">
            <div className="text-[13.5px] font-semibold truncate" style={{ color: 'var(--text)' }}>{file.name}</div>
            <div className="text-[11.5px]" style={{ color: 'var(--text3)' }}>PDF · {file.size >= 1048576 ? `${(file.size / 1048576).toFixed(1)} MB` : `${Math.max(1, Math.round(file.size / 1024))} KB`}</div>
          </div>
          <button onClick={onClear} className="wl-btn flex-shrink-0" style={{ height: 32, fontSize: 12 }}>Change</button>
        </div>
      ) : (
        <div {...root} className="rounded-2xl px-5 py-8 text-center cursor-pointer transition-colors"
          style={{ border: `1.5px dashed ${active ? 'var(--accent)' : '#CFC8F5'}`, background: active ? 'var(--accent-bg)' : '#FAFAFE' }}>
          <input {...input} />
          <span className="w-12 h-12 rounded-2xl mx-auto mb-3 flex items-center justify-center" style={{ background: 'var(--accent-bg)', color: 'var(--accent)' }}><Upload size={20} /></span>
          <div className="text-[14px] font-semibold" style={{ color: 'var(--text)' }}>
            {active ? `Drop the ${what} here` : <>
              <span className="md:hidden">Tap to choose your {what}</span>
              <span className="hidden md:inline">Drop your {what} here, or <span style={{ color: 'var(--accent)' }}>choose a PDF</span></span>
            </>}
          </div>
          <div className="text-[12px] mt-1" style={{ color: 'var(--text3)' }}>Password-protected PDFs work too</div>
        </div>
      )}
      <div className="flex items-start gap-1.5 text-[11.5px] leading-snug" style={{ color: 'var(--text4)' }}>
        <ShieldCheck size={13} className="flex-shrink-0 mt-px" style={{ color: '#1E8F5F' }} />
        Read on our server by a rule-based reader — no AI sees it, and the PDF isn’t kept. Nothing is saved until you check the rows.
      </div>
    </div>
  )
}

export function Notice({ tone = 'warn', icon: Icon = AlertCircle, title, children }: {
  tone?: 'warn' | 'info'; icon?: typeof AlertCircle; title?: React.ReactNode; children?: React.ReactNode
}) {
  const c = tone === 'warn' ? { bg: '#FFF6E8', bd: '#F6DDB4', fg: '#7A4306', ic: '#B96A0B' } : { bg: 'var(--accent-bg)', bd: 'var(--accent-border)', fg: 'var(--accent2)', ic: 'var(--accent)' }
  return (
    <div className="flex items-start gap-2.5 rounded-xl px-3.5 py-3" style={{ background: c.bg, border: `1px solid ${c.bd}` }}>
      <Icon size={16} className="flex-shrink-0 mt-px" style={{ color: c.ic }} />
      <div className="text-[12.5px] leading-snug min-w-0" style={{ color: c.fg }}>
        {title && <div className="font-semibold">{title}</div>}
        {children}
      </div>
    </div>
  )
}

export function PasswordStep({ bank, hint, value, onChange, show, onShow, wrong, onSubmit }: {
  bank: string; hint: string; value: string; onChange: (v: string) => void; show: boolean; onShow: () => void; wrong: boolean; onSubmit: () => void
}) {
  return (
    <div className="flex flex-col gap-3.5">
      <Notice icon={Lock} title={bank ? `This ${bank} statement is locked` : 'This PDF is locked'}>Hint: {hint}</Notice>
      <label className="block">
        <FieldLabel>PDF password</FieldLabel>
        <div className="relative">
          <input type={show ? 'text' : 'password'} value={value} onChange={e => onChange(e.target.value)} autoFocus
            onKeyDown={e => e.key === 'Enter' && value && onSubmit()} placeholder="Enter the PDF password"
            className="wl-input w-full pr-11" style={{ height: 44, ...(wrong ? { borderColor: 'var(--rose)' } : {}) }} aria-invalid={wrong || undefined} />
          <button type="button" onClick={onShow} aria-label={show ? 'Hide password' : 'Show password'} className="absolute right-1.5 top-1/2 -translate-y-1/2 p-2" style={{ color: 'var(--text3)' }}>
            {show ? <EyeOff size={15} /> : <Eye size={15} />}
          </button>
        </div>
      </label>
      {wrong && <div role="alert" className="text-[12px] -mt-2" style={{ color: 'var(--rose)' }}>That password didn’t open it — try again.</div>}
      <div className="text-[11.5px]" style={{ color: 'var(--text4)' }}>Used once to open the file; it isn’t saved.</div>
    </div>
  )
}

export function Working({ title, sub }: { title: string; sub?: string }) {
  return (
    <div className="flex flex-col items-center text-center py-12 gap-3" role="status">
      <span className="w-14 h-14 rounded-2xl flex items-center justify-center" style={{ background: 'var(--accent-bg)', color: 'var(--accent)' }}><Loader2 size={24} className="animate-spin" /></span>
      <div className="text-[14px] font-semibold" style={{ color: 'var(--text)' }}>{title}</div>
      {sub && <div className="text-[12px]" style={{ color: 'var(--text3)' }}>{sub}</div>}
    </div>
  )
}

export function ResultState({ ok, title, children }: { ok: boolean; title: string; children?: React.ReactNode }) {
  const Icon = ok ? CheckCircle2 : AlertCircle
  return (
    <div className="flex flex-col items-center text-center py-8 gap-3">
      <span className="w-14 h-14 rounded-2xl flex items-center justify-center" style={ok ? { background: '#E7F7EF', color: '#1E8F5F' } : { background: 'var(--rose-bg)', color: 'var(--rose)' }}><Icon size={26} /></span>
      <div className="text-[16px] font-bold" style={{ color: 'var(--text)' }}>{title}</div>
      <div className="text-[12.5px] leading-relaxed max-w-[420px] flex flex-col gap-1" style={{ color: 'var(--text3)' }}>{children}</div>
    </div>
  )
}

// What was read: the account or card, a few facts, select all / none
export function ReviewSummary({ title, tags, facts, onAll, onNone }: {
  title: string; tags: string[]; facts: { label: string; value: string; color?: string }[]; onAll: () => void; onNone: () => void
}) {
  return (
    <div className="rounded-2xl p-3.5" style={{ background: '#FAFAFE', border: '1px solid var(--line)' }}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="text-[14.5px] font-bold" style={{ color: 'var(--text)' }}>{title}</div>
          <div className="flex flex-wrap gap-1.5 mt-1">
            {tags.map(t => <span key={t} className="rounded-full px-2 py-0.5 text-[11px] font-semibold" style={{ background: '#fff', border: '1px solid var(--line)', color: 'var(--text3)' }}>{t}</span>)}
          </div>
        </div>
        <div className="flex gap-1.5 flex-shrink-0">
          <button onClick={onAll} className="wl-chip" style={{ height: 28, fontSize: 12 }}>All</button>
          <button onClick={onNone} className="wl-chip" style={{ height: 28, fontSize: 12 }}>None</button>
        </div>
      </div>
      {facts.length > 0 && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-2 mt-3">
          {facts.map(f => (
            <div key={f.label} className="rounded-xl px-3 py-2" style={{ background: '#fff', border: '1px solid var(--line)' }}>
              <div className="text-[11px]" style={{ color: 'var(--text4)' }}>{f.label}</div>
              <div className="text-[13.5px] font-bold tabular-nums truncate" style={{ color: f.color ?? 'var(--text)' }}>{f.value}</div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

export const dayLabel = (d: string) => {
  const dt = new Date(`${d}T00:00:00`)
  if (isNaN(dt.getTime())) return d
  return dt.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', ...(dt.getFullYear() !== new Date().getFullYear() ? { year: 'numeric' } : {}) })
}

// One statement row: tick, what / when, amount, then its category and type
export function ReviewRow({ t, sym, first, onToggle, onRemove, category, type }: {
  t: { date: string; merchant: string; description?: string; amount: number; txn_type: string; selected: boolean; isDuplicate?: boolean; autoCat?: boolean }
  sym: string; first: boolean; onToggle: () => void; onRemove: () => void; category: React.ReactNode; type: React.ReactNode
}) {
  const tone = t.txn_type === 'income' ? { c: '#1E8F5F', s: '+' } : t.txn_type === 'transfer' ? { c: '#3B8EF0', s: '' } : t.txn_type === 'loan' ? { c: '#B96A0B', s: '−' } : { c: 'var(--text)', s: '−' }
  return (
    <div className="flex gap-3 px-3.5 py-3 transition-opacity" style={{ borderTop: first ? 'none' : '1px solid var(--track)', opacity: t.selected ? 1 : 0.5, background: t.selected ? 'transparent' : '#FAFAFC' }}>
      <input type="checkbox" checked={t.selected} onChange={onToggle} aria-label={`Include ${t.merchant}`}
        className="mt-0.5 flex-shrink-0 cursor-pointer" style={{ width: 18, height: 18, accentColor: 'var(--accent)' }} />
      <div className="flex-1 min-w-0">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex items-center gap-1.5 min-w-0">
              <span className="text-[13.5px] font-semibold truncate" style={{ color: 'var(--text)' }}>{t.merchant}</span>
              {t.isDuplicate && <span className="flex-shrink-0 rounded-full px-1.5 py-px text-[10.5px] font-semibold" style={{ background: '#FFF2E2', color: '#B96A0B' }}>Already in app</span>}
              {t.autoCat && !t.isDuplicate && <span className="flex-shrink-0 rounded-full px-1.5 py-px text-[10.5px] font-semibold" title="Category from what you picked before for this merchant" style={{ background: 'var(--accent-bg)', color: 'var(--accent2)' }}>Auto</span>}
            </div>
            <div className="text-[11.5px] truncate" style={{ color: 'var(--text4)' }}>
              {dayLabel(t.date)}{t.description && t.description !== t.merchant ? ` · ${t.description}` : ''}
            </div>
          </div>
          <span className="text-[13.5px] font-bold tabular-nums whitespace-nowrap" style={{ color: tone.c }}>{tone.s}{sym}{Number(t.amount).toLocaleString('en-IN')}</span>
        </div>
        <div className="flex items-center gap-2 mt-2">
          <div className="flex-1 min-w-0">{category}</div>
          <div className="w-[118px] md:w-[148px] flex-shrink-0">{type}</div>
          <button onClick={onRemove} aria-label={`Remove ${t.merchant}`} className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 hover:bg-[var(--rose-bg)]" style={{ color: 'var(--text4)' }}>
            <Trash2 size={14} />
          </button>
        </div>
      </div>
    </div>
  )
}

export const rowSelect = 'wl-input w-full'
export const rowSelectStyle: React.CSSProperties = { height: 34, fontSize: 12.5, paddingTop: 0, paddingBottom: 0 }
