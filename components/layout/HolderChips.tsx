'use client'
import { useState } from 'react'
import { UserPlus } from 'lucide-react'
import { useHolderStore } from '@/store/holderStore'
import { useFamily } from '@/hooks/useFamily'
import ManageFamilyModal from '@/components/forms/ManageFamilyModal'

const AVATAR = ['#6A55E8', '#E11D48', '#D97706', '#16A34A', '#0891B2', '#A855D8', '#EC5B8C']

// Family / holder switcher — "Family" shows everyone; each chip filters
// investments and loans to that person (rows' holder_name).
export default function HolderChips({ firstName }: { firstName?: string | null }) {
  const { selectedHolder, setSelectedHolder } = useHolderStore()
  const { members, reload } = useFamily()
  const [manage, setManage] = useState(false)

  const chips = [
    { value: '', label: 'Family', ini: '∑', color: '#64748B', title: 'Everyone, consolidated' },
    { value: 'Self', label: firstName || 'You', ini: (firstName || 'Y')[0].toUpperCase(), color: AVATAR[0], title: 'You' },
    ...members.filter(m => m.relationship !== 'self').map((m, i) => ({
      value: m.name, label: m.name.split(' ')[0], ini: m.name[0]?.toUpperCase() ?? '?',
      color: AVATAR[(i + 1) % AVATAR.length], title: m.relationship,
    })),
  ]

  return (
    <>
      <div className="flex items-center gap-1.5" role="radiogroup" aria-label="Family member">
        {chips.map(c => {
          const on = selectedHolder === c.value
          return (
            <button key={c.value || '__all'} onClick={() => setSelectedHolder(c.value)}
              role="radio" aria-checked={on} title={c.title}
              className="flex items-center gap-1.5 h-[30px] pl-1 pr-2.5 rounded-full text-[12px] whitespace-nowrap flex-shrink-0 transition-colors"
              style={on
                ? { background: 'var(--accent-bg)', border: '1px solid var(--accent-border)', color: 'var(--accent2)', fontWeight: 600 }
                : { background: '#fff', border: '1px solid var(--border)', color: 'var(--text2)', fontWeight: 500 }}>
              <span className="w-[22px] h-[22px] rounded-full flex items-center justify-center text-[11px] font-bold text-white"
                style={{ background: c.color }}>{c.ini}</span>
              {c.label}
            </button>
          )
        })}
        <button onClick={() => setManage(true)} title="Manage family members" aria-label="Manage family members"
          className="w-[30px] h-[30px] rounded-full flex items-center justify-center flex-shrink-0"
          style={{ border: '1px dashed var(--border2)', color: 'var(--text3)' }}>
          <UserPlus size={13} />
        </button>
      </div>
      {manage && <ManageFamilyModal onClose={() => { setManage(false); reload() }} />}
    </>
  )
}
