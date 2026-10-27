'use client'
import { useEffect, useRef, useState } from 'react'
import { useRouter, usePathname } from 'next/navigation'
import Link from 'next/link'
import {
  Plus, X, ShoppingBag, ArrowDownLeft, ArrowLeftRight, Banknote, MessageSquareText, Landmark,
  CreditCard, Camera, Mic, PieChart, LineChart, ChevronRight, History,
} from 'lucide-react'
import { useUiStore } from '@/store/uiStore'
import AddTransactionModal from '@/components/forms/AddTransactionModal'
import BankStatementUploadModal from '@/components/forms/BankStatementUploadModal'
import CreditCardUploadModal from '@/components/forms/CreditCardUploadModal'
import BillImageUploadModal from '@/components/forms/BillImageUploadModal'
import TransactionVoiceModal from '@/components/forms/TransactionVoiceModal'
import MessageParseModal from '@/components/forms/MessageParseModal'
import HoldingsUploadModal from '@/components/forms/HoldingsUploadModal'

type Way = 'expense' | 'income' | 'move' | 'cash' | 'message' | 'bank' | 'card' | 'bill' | 'voice' | 'mf' | 'stocks'
type Opt = { k: Way; t: string; d: string; icon: typeof Plus; c: string; ai?: boolean }

// Typed in by hand — the add dialog, pre-set to the right kind
const TYPE_IN: Opt[] = [
  { k: 'expense', t: 'Expense', d: 'Something you paid for', icon: ShoppingBag, c: '#6A55E8' },
  { k: 'income', t: 'Income', d: 'Salary, rent, interest…', icon: ArrowDownLeft, c: '#2FB67C' },
  { k: 'move', t: 'Money move', d: 'Send home, card bill, ATM', icon: ArrowLeftRight, c: '#3B8EF0' },
  { k: 'cash', t: 'Cash spend', d: 'Paid from your wallet', icon: Banknote, c: '#EC5B8C' },
]
// Brought in from somewhere else — same options as the Import page
const BRING_IN: Opt[] = [
  { k: 'message', t: 'Bank SMS or email', d: 'Paste an alert, or share it from your phone', icon: MessageSquareText, c: '#2FB67C' },
  { k: 'bank', t: 'Bank statement', d: 'PDF from any UAE or Indian bank', icon: Landmark, c: '#6A55E8' },
  { k: 'card', t: 'Credit card statement', d: 'Adds spends, updates balance and due date', icon: CreditCard, c: '#3B8EF0' },
  { k: 'bill', t: 'Bill or receipt photo', d: 'Amount, date and shop filled in for you', icon: Camera, c: '#F29A2E', ai: true },
  { k: 'voice', t: 'Speak or type', d: '“Paid AED 120 at Carrefour yesterday”', icon: Mic, c: '#EC5B8C', ai: true },
  { k: 'mf', t: 'Mutual fund statement', d: 'CAMS or KFintech CAS PDF', icon: PieChart, c: '#16A34A' },
  { k: 'stocks', t: 'Stock holdings', d: 'Holdings PDF from your broker', icon: LineChart, c: '#0891B2' },
]

// The one "Add" for the whole app: a desktop button in the Topbar and a
// floating + on phones open the same chooser, and the chosen dialog opens on
// top of whatever page you're on. Saving refreshes that page.
export function AddButton() {
  const { openAdd } = useUiStore()
  return (
    <button onClick={() => openAdd()} className="wl-btn wl-btn-primary flex-shrink-0" style={{ height: 34 }}>
      <Plus size={14} />Add
    </button>
  )
}

export default function QuickAdd() {
  const { addOpen, openAdd, closeAdd } = useUiStore()
  const [way, setWay] = useState<Way | null>(null)
  const router = useRouter()
  const pathname = usePathname()
  const first = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    if (!addOpen) return
    first.current?.focus()
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') closeAdd() }
    window.addEventListener('keydown', esc); return () => window.removeEventListener('keydown', esc)
  }, [addOpen, closeAdd])

  const pick = (k: Way) => { closeAdd(); setWay(k) }
  const done = () => { setWay(null); router.refresh() }
  // The More hub and Settings have no money on them; Add stays off there
  const fab = !pathname.startsWith('/dashboard/settings') && pathname !== '/dashboard/more'

  const tag = (ai?: boolean) => (
    <span className="text-[10px] font-semibold rounded-full px-1.5 py-[1px] flex-shrink-0"
      style={ai ? { background: '#FFF2E2', color: '#9A5B0B' } : { background: '#E7F7EF', color: '#1E7A50' }}>
      {ai ? 'AI' : 'No AI'}
    </span>
  )

  return (
    <>
      {fab && (
        <button onClick={() => openAdd()} aria-label="Add a transaction or import"
          className="add-fab md:hidden no-print fixed z-30 w-[52px] h-[52px] rounded-full flex items-center justify-center text-white"
          style={{ background: 'linear-gradient(135deg, #6A55E8, #7A66F0)', boxShadow: '0 10px 24px rgba(91,71,224,.38)' }}>
          <Plus size={24} strokeWidth={2.4} />
        </button>
      )}

      {addOpen && (
        <div className="fixed inset-0 wl-sheet z-50 flex items-center justify-center p-4" style={{ background: 'rgba(15,23,42,0.45)' }}
          onClick={closeAdd}>
          <div role="dialog" aria-modal="true" aria-label="Add"
            className="wl-sheet-panel w-full max-w-[520px] rounded-2xl overflow-y-auto"
            style={{ background: 'var(--card)', border: '1px solid var(--line)', boxShadow: '0 24px 60px rgba(15,23,42,.25)', maxHeight: '88vh' }}
            onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between px-5 pt-4 pb-2">
              <div>
                <div className="text-[16px] font-bold" style={{ color: 'var(--text)' }}>Add</div>
                <div className="text-[12px]" style={{ color: 'var(--text3)' }}>Type it in, or bring it in from your bank</div>
              </div>
              <button onClick={closeAdd} aria-label="Close" className="p-2 rounded-xl hover:bg-gray-100" style={{ color: 'var(--text3)' }}><X size={16} /></button>
            </div>

            <div className="px-5 pt-2 pb-1 text-[10.5px] font-semibold uppercase tracking-[0.06em]" style={{ color: 'var(--text4)' }}>Type it in</div>
            <div className="grid grid-cols-2 gap-2 px-5 pb-3">
              {TYPE_IN.map((o, i) => (
                <button key={o.k} ref={i === 0 ? first : undefined} onClick={() => pick(o.k)}
                  className="rounded-xl px-3 py-2.5 flex items-start gap-2.5 text-left transition-colors hover:border-[var(--accent-border)]"
                  style={{ border: '1px solid var(--line)', background: '#fff' }}>
                  <span className="w-8 h-8 rounded-[10px] flex items-center justify-center flex-shrink-0" style={{ background: o.c + '1A', color: o.c }}><o.icon size={16} /></span>
                  <span className="min-w-0">
                    <span className="block text-[13px] font-semibold" style={{ color: 'var(--text)' }}>{o.t}</span>
                    <span className="block text-[11px] leading-snug" style={{ color: 'var(--text3)' }}>{o.d}</span>
                  </span>
                </button>
              ))}
            </div>

            <div className="px-5 pt-1 pb-1 text-[10.5px] font-semibold uppercase tracking-[0.06em]" style={{ color: 'var(--text4)' }}>Bring it in</div>
            <div className="px-2 pb-2">
              {BRING_IN.map(o => (
                <button key={o.k} onClick={() => pick(o.k)}
                  className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-left transition-colors hover:bg-[#F7F6FD]">
                  <span className="w-8 h-8 rounded-[10px] flex items-center justify-center flex-shrink-0" style={{ background: o.c + '1A', color: o.c }}><o.icon size={16} /></span>
                  <span className="flex-1 min-w-0">
                    <span className="flex items-center gap-1.5 text-[13px] font-semibold" style={{ color: 'var(--text)' }}>{o.t}{tag(o.ai)}</span>
                    <span className="block text-[11.5px] truncate" style={{ color: 'var(--text3)' }}>{o.d}</span>
                  </span>
                  <ChevronRight size={15} style={{ color: 'var(--text4)' }} />
                </button>
              ))}
            </div>

            <div className="px-5 py-3 flex items-center justify-between gap-3" style={{ borderTop: '1px solid var(--line)' }}>
              <span className="text-[11.5px] leading-snug" style={{ color: 'var(--text4)' }}>Statements are read on our server without AI. You check everything before it’s saved.</span>
              <Link href="/dashboard/ingest" onClick={closeAdd} className="wl-btn flex-shrink-0" style={{ height: 32 }}><History size={13} />Import history</Link>
            </div>
          </div>
        </div>
      )}

      {way === 'expense' && <AddTransactionModal onClose={done} defaults={{ txn_type: 'expense' }} />}
      {way === 'income' && <AddTransactionModal onClose={done} defaults={{ txn_type: 'income' }} />}
      {way === 'move' && <AddTransactionModal onClose={done} defaults={{ txn_type: 'transfer' }} />}
      {way === 'cash' && <AddTransactionModal onClose={done} defaults={{ txn_type: 'expense', account_id: '__cash__' }} />}
      {way === 'message' && <MessageParseModal onClose={done} />}
      {way === 'bank' && <BankStatementUploadModal onClose={done} />}
      {way === 'card' && <CreditCardUploadModal onClose={done} />}
      {way === 'bill' && <BillImageUploadModal onClose={done} defaultType="expense" />}
      {way === 'voice' && <TransactionVoiceModal onClose={done} defaultType="expense" />}
      {way === 'mf' && <HoldingsUploadModal kind="mutual_funds" onClose={done} />}
      {way === 'stocks' && <HoldingsUploadModal kind="stocks" onClose={done} />}
    </>
  )
}
