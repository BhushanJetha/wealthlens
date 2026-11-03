'use client'
import { Users } from 'lucide-react'
import { useHolderStore } from '@/store/holderStore'

// While one person is picked in the family chips, say so on every page, with
// the way back: their investments and loans only, so much of a page reads 0
export default function HolderNotice({ firstName }: { firstName?: string | null }) {
  const { selectedHolder, setSelectedHolder } = useHolderStore()
  if (!selectedHolder) return null
  const who = selectedHolder === 'Self' ? (firstName || 'you') : selectedHolder.split(' ')[0]
  return (
    <div role="status" className="mb-3 md:mb-4 rounded-xl px-3.5 py-2.5 flex items-center gap-2.5 flex-wrap text-[12.5px]"
      style={{ background: 'var(--amber-bg)', color: 'var(--amber-text)', border: '1px solid rgba(217,119,6,.25)' }}>
      <Users size={15} className="flex-shrink-0" />
      <span className="flex-1 min-w-[200px]">
        <b>Showing {who} only:</b> {selectedHolder === 'Self' ? 'your accounts, investments and loans' : 'investments and loans'} held in {selectedHolder === 'Self' ? 'your' : `${who}’s`} name. Spending and income are still everyone’s.
      </span>
      <button onClick={() => setSelectedHolder('')} className="wl-btn" style={{ height: 30, fontSize: 12 }}>Show everyone</button>
    </div>
  )
}
