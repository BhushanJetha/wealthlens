'use client'
import { ReactNode } from 'react'
import Link from 'next/link'
import { ChevronLeft, Plus, Upload, Mic, Mail, FileSpreadsheet } from 'lucide-react'

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

export default function InvPageShell({ title, subtitle, count, totalValue, children, onAdd, onPdf, onVoice, onExcel, onEmail }: Props) {
  return (
    <div className="space-y-5 animate-fade-up">
      <div className="flex items-start justify-between flex-wrap gap-3">
        <div>
          <Link href="/dashboard/investments" className="flex items-center gap-1 text-[11px] mb-2" style={{ color: 'var(--sage)' }}>
            <ChevronLeft size={13} /> All Investments
          </Link>
          <h1 className="text-xl font-bold" style={{ color: 'var(--text)' }}>{title}</h1>
          <p className="text-[12px] mt-0.5" style={{ color: 'var(--text3)' }}>{subtitle} · {count} {count === 1 ? 'entry' : 'entries'} · Total: {totalValue}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          {onEmail && (
            <button onClick={onEmail} className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-[11px] font-semibold border transition-all"
              style={{ borderColor: 'var(--border)', color: 'var(--text2)', background: 'var(--card)' }}>
              <Mail size={13} /> From Email
            </button>
          )}
          {onExcel && (
            <button onClick={onExcel} className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-[11px] font-semibold border transition-all"
              style={{ borderColor: 'var(--border)', color: 'var(--text2)', background: 'var(--card)' }}>
              <FileSpreadsheet size={13} /> Upload Excel
            </button>
          )}
          {onPdf && (
            <button onClick={onPdf} className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-[11px] font-semibold border transition-all"
              style={{ borderColor: 'var(--border)', color: 'var(--text2)', background: 'var(--card)' }}>
              <Upload size={13} /> Upload PDF
            </button>
          )}
          {onVoice && (
            <button onClick={onVoice} className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-[11px] font-semibold border transition-all"
              style={{ borderColor: 'var(--border)', color: 'var(--text2)', background: 'var(--card)' }}>
              <Mic size={13} /> Voice Input
            </button>
          )}
          <button onClick={onAdd}
            className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-[12px] font-bold text-white transition-all"
            style={{ background: 'var(--sage)' }}>
            <Plus size={14} /> Add New
          </button>
        </div>
      </div>
      {children}
    </div>
  )
}

export function InvCard({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <div className={`wl-card p-4 ${className}`}>{children}</div>
}

export function InvEmptyState({ msg }: { msg: string }) {
  return (
    <div className="wl-card py-16 text-center" style={{ borderStyle: 'dashed' }}>
      <div className="text-[13px]" style={{ color: 'var(--text3)' }}>{msg}</div>
    </div>
  )
}

export function SectionHeader({ title, count }: { title: string; count: number }) {
  return (
    <div className="flex items-center gap-2 mt-2">
      <span className="text-[12px] font-bold" style={{ color: 'var(--text2)' }}>{title}</span>
      <span className="text-[10px] px-2 py-0.5 rounded-full font-semibold" style={{ background: 'var(--bg2)', color: 'var(--text3)' }}>{count}</span>
    </div>
  )
}
