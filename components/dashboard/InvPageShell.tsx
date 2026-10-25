'use client'
import { ReactNode } from 'react'
import { Plus, Upload, Mic, Mail, FileSpreadsheet } from 'lucide-react'
import { PageHeader, AiActions, LearnStrip } from '@/components/ui/kit'

interface Props {
  title: string
  subtitle: string
  count: number
  totalValue: string
  children: ReactNode
  onAdd: () => void
  onPdf?: () => void
  onVoice?: () => void
  onExcel?: () => void
  onEmail?: () => void
}

// Shared v2 frame for the investment type pages (ETF, FD, RD, gold, bonds,
// NPS, PPF/EPF, LIC, stocks): header with import actions, AI prompts, Learn.
export default function InvPageShell({ title, subtitle, count, totalValue, children, onAdd, onPdf, onVoice, onExcel, onEmail }: Props) {
  const imports = [
    onEmail && { label: 'From email', icon: Mail, run: onEmail },
    onExcel && { label: 'Upload Excel', icon: FileSpreadsheet, run: onExcel },
    onPdf && { label: 'Upload PDF', icon: Upload, run: onPdf },
    onVoice && { label: 'Voice input', icon: Mic, run: onVoice },
  ].filter(Boolean) as { label: string; icon: typeof Mail; run: () => void }[]
  const context = `${title}: ${count} ${count === 1 ? 'holding' : 'holdings'}, total ${totalValue}.`

  return (
    <div className="flex flex-col gap-3.5 md:gap-[18px] animate-fade-up">
      <PageHeader title={title}
        sub={`${subtitle} · ${count} ${count === 1 ? 'entry' : 'entries'} · Total ${totalValue}`}
        onAdd={onAdd} addLabel={`Add to ${title}`}
        actions={<>
          {imports.map(b => { const Icon = b.icon; return (
            <button key={b.label} onClick={b.run} className="wl-btn" style={{ height: 34 }}><Icon size={14} />{b.label}</button>
          )})}
          <button onClick={onAdd} className="wl-btn wl-btn-primary" style={{ height: 34 }}><Plus size={14} />Add new</button>
        </>} />

      {/* Phones: import options as a scrolling row (the round + adds by hand) */}
      {imports.length > 0 && (
        <div className="md:hidden flex gap-2 overflow-x-auto no-scrollbar -mx-4 px-4">
          {imports.map(b => { const Icon = b.icon; return (
            <button key={b.label} onClick={b.run} className="wl-chip gap-1.5 flex-shrink-0"><Icon size={13} />{b.label}</button>
          )})}
        </div>
      )}

      {count > 0 && <AiActions actions={['Is this right for my goals?', 'How is it taxed?']} context={context} />}

      {children}

      <LearnStrip title="SIPs, FDs, gold — how each one works" href="/dashboard/learn" />
    </div>
  )
}

export function InvCard({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <div className={`wl-card p-4 ${className}`}>{children}</div>
}

export function InvEmptyState({ msg }: { msg: string }) {
  return (
    <div className="rounded-[14px] py-16 px-6 text-center bg-white" style={{ border: '1.5px dashed var(--border2)' }}>
      <div className="text-[13.5px]" style={{ color: 'var(--text3)' }}>{msg}</div>
    </div>
  )
}

export function SectionHeader({ title, count }: { title: string; count: number }) {
  return (
    <div className="flex items-center gap-2 mt-2">
      <span className="text-[13px] font-semibold" style={{ color: 'var(--text2)' }}>{title}</span>
      <span className="text-[11px] px-2 py-0.5 rounded-full font-semibold" style={{ background: 'var(--accent-bg)', color: 'var(--accent2)' }}>{count}</span>
    </div>
  )
}
