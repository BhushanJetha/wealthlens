'use client'
import { useState, useEffect } from 'react'
import { createPortal } from 'react-dom'
import { createClient } from '@/lib/supabase/client'
import { X, Loader2, Trash2, UserPlus, Users, Pencil, Check } from 'lucide-react'
import { useRouter } from 'next/navigation'

const RELATIONSHIPS = [
  { value: 'spouse',  label: 'Spouse'  },
  { value: 'parent',  label: 'Parent'  },
  { value: 'child',   label: 'Child'   },
  { value: 'sibling', label: 'Sibling' },
  { value: 'other',   label: 'Other'   },
]

const REL_COLORS: Record<string, string> = {
  self: 'var(--sage)', spouse: 'var(--blue)', parent: 'var(--gold)',
  child: 'var(--purple)', sibling: 'var(--income)', other: 'var(--text3)',
}

interface Props {
  onClose: () => void
}

export default function ManageFamilyModal({ onClose }: Props) {
  const supabase = createClient()
  const router   = useRouter()
  const [mounted,   setMounted]   = useState(false)
  const [members,   setMembers]   = useState<any[]>([])
  const [loading,   setLoading]   = useState(true)
  const [saving,    setSaving]    = useState(false)
  const [deleting,  setDeleting]  = useState<string | null>(null)
  const [editingId, setEditingId] = useState<string | null>(null)

  // New member form
  const [newName, setNewName] = useState('')
  const [newRel,  setNewRel]  = useState('spouse')

  // Inline edit form state per member (keyed by id)
  const [editValues, setEditValues] = useState<Record<string, { name: string; relationship: string }>>({})

  useEffect(() => {
    setMounted(true)
    load()
  }, [])

  async function load() {
    setLoading(true)
    const { data } = await supabase
      .from('family_members')
      .select('id, name, relationship, created_at')
      .eq('is_active', true)
      .order('created_at')
    setMembers(data ?? [])
    setLoading(false)
  }

  async function add() {
    if (!newName.trim()) return
    setSaving(true)
    const { data: { user } } = await supabase.auth.getUser()
    await supabase.from('family_members').insert({
      name: newName.trim(),
      relationship: newRel,
      is_active: true,
      user_id: user!.id,
    })
    setNewName('')
    setNewRel('spouse')
    await load()
    setSaving(false)
    router.refresh()
  }

  function startEdit(m: any) {
    setEditingId(m.id)
    setEditValues(prev => ({ ...prev, [m.id]: { name: m.name, relationship: m.relationship } }))
  }

  async function saveEdit(id: string) {
    const vals = editValues[id]
    if (!vals?.name?.trim()) return
    setSaving(true)
    await supabase.from('family_members').update({ name: vals.name.trim(), relationship: vals.relationship }).eq('id', id)
    setEditingId(null)
    await load()
    setSaving(false)
    router.refresh()
  }

  async function remove(id: string) {
    setDeleting(id)
    await supabase.from('family_members').update({ is_active: false }).eq('id', id)
    setMembers(prev => prev.filter(m => m.id !== id))
    setDeleting(null)
    router.refresh()
  }

  if (!mounted) return null

  return createPortal(
    <div className="fixed inset-0 z-[9999] bg-black/50 flex items-center justify-center p-4"
      onClick={onClose}>
      <div className="w-full max-w-md bg-white rounded-2xl shadow-2xl"
        style={{ border: '1px solid var(--border)' }}
        onClick={e => e.stopPropagation()}>

        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4"
          style={{ borderBottom: '1px solid var(--border)' }}>
          <div className="flex items-center gap-2">
            <Users size={16} style={{ color: 'var(--sage)' }} />
            <div>
              <div className="text-[14px] font-bold" style={{ color: 'var(--text)' }}>Family Members</div>
              <div className="text-[10px]" style={{ color: 'var(--text3)' }}>Track investments &amp; loans per person</div>
            </div>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg"
            style={{ color: 'var(--text3)' }}
            onMouseEnter={e => (e.currentTarget.style.background = 'var(--bg2)')}
            onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}>
            <X size={16} />
          </button>
        </div>

        {/* Member list */}
        <div className="px-5 py-4 space-y-2 max-h-64 overflow-y-auto">
          {/* Self — always shown, not editable */}
          <div className="flex items-center justify-between p-3 rounded-xl"
            style={{ background: 'var(--bg2)', border: '1px solid var(--border)' }}>
            <div className="flex items-center gap-2">
              <span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ background: REL_COLORS.self }} />
              <span className="text-[13px] font-semibold" style={{ color: 'var(--text)' }}>Self</span>
              <span className="text-[10px] px-1.5 py-0.5 rounded font-semibold"
                style={{ background: REL_COLORS.self + '18', color: REL_COLORS.self }}>Default</span>
            </div>
          </div>

          {loading ? (
            <div className="flex items-center justify-center py-6">
              <Loader2 size={16} className="animate-spin" style={{ color: 'var(--sage)' }} />
            </div>
          ) : members.length === 0 ? (
            <div className="text-center py-4 text-[12px]" style={{ color: 'var(--text3)' }}>
              No family members added yet
            </div>
          ) : (
            members.map(m => {
              const relColor = REL_COLORS[m.relationship] ?? 'var(--text3)'
              const relLabel = RELATIONSHIPS.find(r => r.value === m.relationship)?.label ?? m.relationship
              const isEditing = editingId === m.id
              const ev = editValues[m.id] ?? { name: m.name, relationship: m.relationship }

              return (
                <div key={m.id} className="rounded-xl p-3"
                  style={{ background: 'var(--bg2)', border: `1px solid ${isEditing ? 'var(--sage)' : 'var(--border)'}` }}>
                  {isEditing ? (
                    /* Inline edit form */
                    <div className="space-y-2">
                      <input
                        type="text"
                        value={ev.name}
                        onChange={e => setEditValues(prev => ({ ...prev, [m.id]: { ...ev, name: e.target.value } }))}
                        className="wl-input w-full text-[12px]"
                        onFocus={e => (e.target.style.borderColor = 'var(--sage)')}
                        onBlur={e => (e.target.style.borderColor = 'var(--border)')}
                        onKeyDown={e => e.key === 'Enter' && saveEdit(m.id)}
                        autoFocus
                      />
                      <div className="flex items-center gap-2">
                        <select
                          value={ev.relationship}
                          onChange={e => setEditValues(prev => ({ ...prev, [m.id]: { ...ev, relationship: e.target.value } }))}
                          className="wl-input flex-1 text-[12px]"
                          onFocus={e => (e.target.style.borderColor = 'var(--sage)')}
                          onBlur={e => (e.target.style.borderColor = 'var(--border)')}>
                          {RELATIONSHIPS.map(r => <option key={r.value} value={r.value}>{r.label}</option>)}
                        </select>
                        <button onClick={() => saveEdit(m.id)} disabled={saving}
                          className="flex items-center gap-1 px-3 py-2 rounded-lg text-white text-[11px] font-bold disabled:opacity-50 flex-shrink-0"
                          style={{ background: 'var(--sage)' }}>
                          {saving ? <Loader2 size={11} className="animate-spin" /> : <Check size={11} />}
                          Save
                        </button>
                        <button onClick={() => setEditingId(null)}
                          className="px-2 py-2 rounded-lg text-[11px] font-semibold flex-shrink-0"
                          style={{ background: 'var(--bg2)', color: 'var(--text3)', border: '1px solid var(--border)' }}>
                          Cancel
                        </button>
                      </div>
                    </div>
                  ) : (
                    /* Normal row */
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2 min-w-0">
                        <span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ background: relColor }} />
                        <span className="text-[13px] font-semibold truncate" style={{ color: 'var(--text)' }}>{m.name}</span>
                        <span className="text-[10px] px-1.5 py-0.5 rounded font-semibold flex-shrink-0"
                          style={{ background: relColor + '18', color: relColor }}>{relLabel}</span>
                      </div>
                      <div className="flex items-center gap-1 flex-shrink-0 ml-2">
                        <button onClick={() => startEdit(m)}
                          className="w-7 h-7 rounded-md flex items-center justify-center transition-all"
                          style={{ background: 'var(--blue-bg)', color: 'var(--blue)' }}
                          title="Edit">
                          <Pencil size={11} />
                        </button>
                        <button onClick={() => remove(m.id)} disabled={deleting === m.id}
                          className="w-7 h-7 rounded-md flex items-center justify-center transition-all disabled:opacity-50"
                          style={{ background: 'var(--rose-bg)', color: 'var(--rose)' }}
                          title="Delete">
                          {deleting === m.id ? <Loader2 size={11} className="animate-spin" /> : <Trash2 size={11} />}
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              )
            })
          )}
        </div>

        {/* Add form */}
        <div className="px-5 pb-5 space-y-2" style={{ borderTop: '1px solid var(--border)', paddingTop: '1rem' }}>
          <div className="text-[10px] font-semibold uppercase tracking-wider" style={{ color: 'var(--text3)' }}>
            Add Family Member
          </div>
          {/* Name input — full width */}
          <input
            type="text"
            value={newName}
            onChange={e => setNewName(e.target.value)}
            placeholder="Name (e.g. Priya, Dad, Mom)"
            className="w-full wl-input text-[13px]"
            onFocus={e => (e.target.style.borderColor = 'var(--sage)')}
            onBlur={e => (e.target.style.borderColor = 'var(--border)')}
            onKeyDown={e => e.key === 'Enter' && add()}
          />
          {/* Relationship + Add button */}
          <div className="flex gap-2">
            <select value={newRel} onChange={e => setNewRel(e.target.value)}
              className="flex-1 wl-input text-[12px]"
              onFocus={e => (e.target.style.borderColor = 'var(--sage)')}
              onBlur={e => (e.target.style.borderColor = 'var(--border)')}>
              {RELATIONSHIPS.map(r => <option key={r.value} value={r.value}>{r.label}</option>)}
            </select>
            <button onClick={add} disabled={saving || !newName.trim()}
              className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-white text-[12px] font-bold disabled:opacity-50 flex-shrink-0"
              style={{ background: 'var(--sage)' }}>
              {saving ? <Loader2 size={12} className="animate-spin" /> : <UserPlus size={12} />}
              Add
            </button>
          </div>
        </div>
      </div>
    </div>,
    document.body
  )
}
