'use client'
// One line on a page for its own part of the To do list: "3 things to do on
// Money · the first one · Show". The list itself is on the To do page.
import Link from 'next/link'
import { ChevronRight } from 'lucide-react'
import { AREA_LABEL, type TodoArea } from '@/lib/todo'
import { useTodo } from './useTodo'

export default function TodoBar({ area }: { area: TodoArea }) {
  const { items } = useTodo()
  const mine = items.filter(i => i.area === area)
  if (!mine.length) return null
  const today = mine.filter(i => i.group === 'today').length
  return (
    <Link href={`/dashboard/todo?area=${area}`} className="flex items-center gap-3 rounded-2xl px-4 py-3 text-[13px]"
      style={today ? { background: '#FFF7EC', border: '1px solid #F8DDB4' } : { background: '#F4F2FF', border: '1px solid #E4DEFF' }}>
      <span className="min-w-[26px] h-[26px] px-1 rounded-full inline-flex items-center justify-center text-[12px] font-bold text-white flex-shrink-0" style={{ background: today ? '#DC2626' : '#6A55E8' }}>{mine.length}</span>
      <span className="flex-1 min-w-0 truncate" style={{ color: 'var(--text)' }}>
        <b>{mine.length === 1 ? 'Thing' : 'Things'} to do on {AREA_LABEL[area]}</b><span style={{ color: 'var(--text3)' }}> · {mine[0].title}{mine.length > 1 ? ` and ${mine.length - 1} more` : ''}</span>
      </span>
      <span className="font-semibold flex items-center gap-0.5 flex-shrink-0" style={{ color: 'var(--accent)' }}>Show<ChevronRight size={15} /></span>
    </Link>
  )
}
