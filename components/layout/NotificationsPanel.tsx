'use client'
import { useState, useEffect, useRef } from 'react'
import { Bell, CheckCircle2, X } from 'lucide-react'
import Link from 'next/link'
import { GROUP_LABEL } from '@/lib/todo'
import { useTodo } from '@/components/dashboard/todo/useTodo'
import { createClient } from '@/lib/supabase/client'
import { lastPeriod } from '@/lib/portfolio/review'

// Portfolio reviews (migration 032): the one for the last finished quarter /
// half-year / year is made once, the first time the app is opened after it.
// Once per page load; it then shows on the To do list.
let reviewChecked = false
async function ensureReview(): Promise<boolean> {
  if (reviewChecked) return false
  reviewChecked = true
  try {
    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return false
    const now = new Date()
    const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`
    const lp = lastPeriod(today), skipKey = `wl-review-skip-${lp.end}`
    let skipped = false
    try { skipped = !!localStorage.getItem(skipKey) } catch {}
    if (skipped) return false
    const has = await supabase.from('portfolio_reviews').select('id').eq('user_id', user.id).eq('kind', lp.kind).eq('period_end', lp.end).limit(1)
    if (has.error || has.data?.length) return false
    const made = await fetch('/api/portfolio/review', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ kind: 'auto' }) }).then(r => r.json()).catch(() => null)
    if (made?.skipped) try { localStorage.setItem(skipKey, '1') } catch {}
    return !!made && !made.skipped
  } catch { return false }
}

const DOT = { today: 'var(--rose)', week: 'var(--gold)', later: 'var(--text4)' }

// The bell: the To do list (lib/todo), its most pressing items first. The red
// count is today's only, so it doesn't nag; anything else shows as a dot.
// `round`: the phone design's 36px circle button
export default function NotificationsPanel({ round }: { round?: boolean }) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  const { loaded, items, refresh } = useTodo()
  useEffect(() => { if (!reviewChecked) ensureReview().then(made => { if (made) refresh() }) }, []) // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    function handle(e: MouseEvent) { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false) }
    if (open) document.addEventListener('mousedown', handle)
    return () => document.removeEventListener('mousedown', handle)
  }, [open])
  const todayCount = items.filter(i => i.group === 'today').length

  return (
    <div ref={ref} className="relative">
      <button onClick={() => setOpen(o => !o)} aria-label={`To do${items.length ? `: ${items.length}, ${todayCount} today` : ''}`} aria-expanded={open}
        className={`relative flex items-center justify-center flex-shrink-0 transition-colors ${round ? 'w-9 h-9 rounded-full' : 'w-[34px] h-[34px] rounded-lg'}`}
        style={{ background: open ? 'var(--accent-bg)' : '#fff', border: '1px solid var(--border)', color: open ? 'var(--accent)' : 'var(--text2)' }}>
        <Bell size={16} />
        {loaded && todayCount > 0 ? (
          <span className="absolute -top-0.5 -right-0.5 min-w-4 h-4 px-0.5 rounded-full text-[9px] font-bold text-white flex items-center justify-center" style={{ background: 'var(--rose)' }}>{todayCount > 9 ? '9+' : todayCount}</span>
        ) : loaded && items.length > 0 ? (
          <span className={`absolute rounded-full w-[7px] h-[7px] ${round ? 'top-[7px] right-2' : 'top-1.5 right-[7px]'}`} style={{ background: 'var(--gold)' }} />
        ) : null}
      </button>

      {open && (
        <div className="absolute right-0 top-full mt-2 w-[340px] rounded-xl z-50 overflow-hidden max-md:fixed max-md:left-3 max-md:right-3 max-md:top-16 max-md:mt-0 max-md:w-auto"
          style={{ background: '#fff', border: '1px solid var(--border)', boxShadow: '0 12px 40px rgba(0,0,0,0.14)' }}>
          <div className="px-4 py-3 flex items-center justify-between" style={{ borderBottom: '1px solid var(--border)' }}>
            <div>
              <div className="text-[13px] font-bold" style={{ color: 'var(--text)' }}>To do</div>
              <div className="text-[11px]" style={{ color: 'var(--text3)' }}>{!loaded ? 'Loading…' : items.length === 0 ? 'Nothing needs you' : `${items.length} thing${items.length === 1 ? '' : 's'} · ${todayCount} today`}</div>
            </div>
            <button onClick={() => setOpen(false)} aria-label="Close" style={{ color: 'var(--text3)' }}><X size={14} /></button>
          </div>
          <div className="max-h-[380px] overflow-y-auto">
            {!loaded ? (
              <div className="flex items-center justify-center h-24"><div className="w-5 h-5 rounded-full border-2 animate-spin" style={{ borderColor: 'var(--border)', borderTopColor: 'var(--accent)' }} /></div>
            ) : items.length === 0 ? (
              <div className="flex flex-col items-center justify-center gap-2 py-10">
                <CheckCircle2 size={28} style={{ color: 'var(--income)' }} />
                <div className="text-[12.5px] font-semibold" style={{ color: 'var(--text)' }}>All clear</div>
              </div>
            ) : (
              <ul className="p-1.5">
                {items.slice(0, 6).map(i => (
                  <li key={i.id}>
                    <Link href={i.upload ? '/dashboard/todo' : i.href} onClick={() => setOpen(false)} className="flex gap-2.5 p-2.5 rounded-lg hover:bg-[#F7F6FD]">
                      <span className="w-2 h-2 rounded-full mt-1.5 flex-shrink-0" style={{ background: DOT[i.group] }} aria-label={GROUP_LABEL[i.group]} />
                      <span className="flex-1 min-w-0"><span className="block text-[12.5px] font-semibold" style={{ color: 'var(--text)' }}>{i.title}</span><span className="block text-[11.5px] mt-0.5 truncate" style={{ color: 'var(--text3)' }}>{i.detail}</span></span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </div>
          <Link href="/dashboard/todo" onClick={() => setOpen(false)} className="block px-4 py-3 text-[12.5px] font-semibold" style={{ borderTop: '1px solid var(--border)', color: 'var(--accent)' }}>Open To do{items.length ? ` · ${items.length}` : ''} →</Link>
        </div>
      )}
    </div>
  )
}
