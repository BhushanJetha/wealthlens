'use client'
import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useHolderStore } from '@/store/holderStore'
import ManageFamilyModal from '@/components/forms/ManageFamilyModal'
import { Users } from 'lucide-react'

export default function HolderFilter() {
  const { selectedHolder, setSelectedHolder } = useHolderStore()
  const [members,    setMembers]    = useState<any[]>([])
  const [showManage, setShowManage] = useState(false)
  const supabase = createClient()

  useEffect(() => {
    async function load() {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return
      const { data } = await supabase
        .from('family_members')
        .select('id, name, relationship')
        .eq('user_id', user.id)
        .eq('is_active', true)
        .order('created_at')
      setMembers(data ?? [])
    }
    load()
  }, [])

  const names: string[] = ['', 'Self', ...members.map(m => m.name)]

  return (
    <>
      <div className="flex items-center gap-2 flex-wrap">
        <span className="text-[10px] font-semibold uppercase tracking-wider flex-shrink-0"
          style={{ color: 'var(--text3)' }}>
          View by:
        </span>

        {names.map(name => (
          <button
            key={name || '__all'}
            onClick={() => setSelectedHolder(name)}
            className="px-3 py-1.5 rounded-lg text-[11px] font-semibold transition-all"
            style={{
              background: selectedHolder === name ? 'var(--sage)' : 'var(--bg2)',
              color:      selectedHolder === name ? '#fff' : 'var(--text3)',
              border:     `1px solid ${selectedHolder === name ? 'var(--sage)' : 'var(--border)'}`,
            }}>
            {name === '' ? 'All Members' : name}
          </button>
        ))}

        <button
          onClick={() => setShowManage(true)}
          className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-[10px] font-semibold"
          style={{ background: 'var(--bg2)', color: 'var(--text3)', border: '1px solid var(--border)' }}>
          <Users size={11} /> Manage
        </button>

        {selectedHolder && (
          <span className="text-[10px] px-2.5 py-1.5 rounded-lg font-semibold"
            style={{ background: 'var(--gold-bg)', color: 'var(--gold)', border: '1px solid #D4920A30' }}>
            Viewing: {selectedHolder}
          </span>
        )}
      </div>

      {showManage && <ManageFamilyModal onClose={() => setShowManage(false)} />}
    </>
  )
}
