'use client'
import { useEffect, useState } from 'react'
import { usePathname, useRouter } from 'next/navigation'
import { Eye, X } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { VIEW_AS_COOKIE, FAMILY_MODE_COOKIE } from '@/lib/supabase/viewAs'
import { Segmented } from '@/components/ui/kit'

// Whose money to show, for someone with family members. A full reload on
// switching: every screen, store and cache then starts fresh for that person.
export function switchView(id: string | null, to = '/dashboard') {
  document.cookie = id
    ? `${VIEW_AS_COOKIE}=${id}; path=/; max-age=${60 * 60 * 24 * 30}; samesite=lax`
    : `${VIEW_AS_COOKIE}=; path=/; max-age=0; samesite=lax`
  window.location.assign(to)
}

// Family view on or off. Off also returns to your own money.
export function setFamilyMode(on: boolean) {
  document.cookie = `${FAMILY_MODE_COOKIE}=${on ? 'on' : 'off'}; path=/; max-age=${60 * 60 * 24 * 365}; samesite=lax`
  if (on) window.location.reload(); else switchView(null)
}

export default function FamilyBar({ members, viewing, stale, left }: {
  members: { id: string; name: string }[]; viewing: string | null; stale: boolean; left: { id: string; name: string }[]
}) {
  const router = useRouter()
  const family = usePathname().startsWith('/dashboard/family')
  const [cleared, setCleared] = useState<string[]>([])
  // They left or were removed while being viewed: back to your own money
  useEffect(() => { if (stale) switchView(null) }, [stale])
  const notices = left.filter(l => !cleared.includes(l.id))
  const name = members.find(m => m.id === viewing)?.name

  async function dismiss(id: string) {
    setCleared(c => [...c, id])
    await createClient().from('family_links').delete().eq('id', id)
    router.refresh()
  }

  if (!members.length && !notices.length) return null
  return (
    <div className="flex flex-col gap-2 mb-3 no-print">
      {notices.map(l => (
        <div key={l.id} className="flex items-center gap-2 rounded-[12px] px-3 py-2 text-[12.5px]" style={{ background: '#FFF8EC', border: '1px solid #F6DDB4', color: '#7A4A06' }}>
          <span className="flex-1 min-w-0">{l.name} left your family. You can no longer see their money.</span>
          <button onClick={() => dismiss(l.id)} aria-label={`Dismiss notice about ${l.name}`} className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0"><X size={15} /></button>
        </div>
      ))}
      {members.length > 0 && (
        <div className="flex items-center gap-1.5">
        <div className="flex-1 min-w-0"><Segmented full label="Whose money to show" violet value={family ? 'all' : viewing ?? 'me'}
          onChange={v => v === 'all' ? switchView(null, '/dashboard/family') : switchView(v === 'me' ? null : v)}
          options={[{ value: 'me', label: 'Me' }, ...members.map(m => ({ value: m.id, label: m.name })), { value: 'all', label: 'Whole family' }]} /></div>
        <button onClick={() => setFamilyMode(false)} aria-label="Turn off family view" title="Turn off family view" className="w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0 hover:bg-white" style={{ color: 'var(--text3)' }}><X size={16} /></button>
        </div>
      )}
      {name && !family && (
        <div className="flex items-center gap-2.5 rounded-[12px] px-3 py-2 text-[12.5px]" style={{ background: '#FFF8EC', border: '1px solid #F6DDB4', color: '#7A4A06' }}>
          <Eye size={16} className="flex-shrink-0" />
          <span><b>Viewing {name}. View only.</b> Only {name} can add or change their entries.</span>
        </div>
      )}
    </div>
  )
}
