'use client'
import { useState, useEffect } from 'react'
import { createPortal } from 'react-dom'
import { createClient } from '@/lib/supabase/client'
import { X, Loader2 } from 'lucide-react'
import { useRouter } from 'next/navigation'

const POLICY_TYPES = [
  { value: 'term_life', label: 'Term Life' },
  { value: 'health',    label: 'Health'    },
  { value: 'property',  label: 'Property'  },
  { value: 'vehicle',   label: 'Vehicle'   },
  { value: 'travel',    label: 'Travel'    },
  { value: 'other',     label: 'Other'     },
]
const FREQ_OPTIONS = [
  { value: 'monthly',     label: 'Monthly'     },
  { value: 'quarterly',   label: 'Quarterly'   },
  { value: 'semi_annual', label: 'Semi-Annual' },
  { value: 'annual',      label: 'Annual'      },
]

const Lbl = ({ children }: { children: React.ReactNode }) => (
  <label className="block text-[10px] uppercase tracking-wider font-semibold mb-1"
    style={{ color: 'var(--text3)' }}>{children}</label>
)

function Inp({ label, value, onChange, type = 'text', placeholder = '' }: {
  label: string; value: string; onChange: (v: string) => void; type?: string; placeholder?: string
}) {
  return (
    <div>
      <Lbl>{label}</Lbl>
      <input type={type} value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder}
        className="wl-input"
        onFocus={e => (e.target.style.borderColor = 'var(--sage)')}
        onBlur={e => (e.target.style.borderColor = 'var(--border)')} />
    </div>
  )
}

function Sel({ label, value, onChange, children }: {
  label: string; value: string; onChange: (v: string) => void; children: React.ReactNode
}) {
  return (
    <div>
      <Lbl>{label}</Lbl>
      <select value={value} onChange={e => onChange(e.target.value)} className="wl-input"
        onFocus={e => (e.target.style.borderColor = 'var(--sage)')}
        onBlur={e => (e.target.style.borderColor = 'var(--border)')}>
        {children}
      </select>
    </div>
  )
}

interface Props {
  onClose: () => void
  initialData?: any
  policyId?: string
}

export default function AddInsuranceModal({ onClose, initialData, policyId }: Props) {
  const isEdit = !!policyId
  const supabase = createClient()
  const router = useRouter()
  const [mounted, setMounted] = useState(false)
  const [saving, setSaving] = useState(false)

  const [form, setForm] = useState<Record<string, string>>(
    initialData ? {
      policy_name:       initialData.policy_name       ?? '',
      provider:          initialData.provider           ?? '',
      policy_number:     initialData.policy_number      ?? '',
      policy_type:       initialData.policy_type        ?? 'other',
      currency:          initialData.currency           ?? 'INR',
      sum_assured:       String(initialData.sum_assured    ?? ''),
      annual_premium:    String(initialData.annual_premium ?? ''),
      premium_frequency: initialData.premium_frequency  ?? 'annual',
      start_date:        initialData.start_date         ?? '',
      expiry_date:       initialData.expiry_date        ?? '',
      next_premium_date: initialData.next_premium_date  ?? '',
      insured_members:   Array.isArray(initialData.insured_members)
        ? initialData.insured_members.join(', ')
        : (initialData.insured_members ?? ''),
    } : {
      policy_type: 'health',
      currency: 'INR',
      premium_frequency: 'annual',
    }
  )

  useEffect(() => { setMounted(true) }, [])
  const set = (k: string) => (v: string) => setForm(p => ({ ...p, [k]: v }))

  async function save() {
    setSaving(true)
    const members = form.insured_members
      ? form.insured_members.split(',').map(s => s.trim()).filter(Boolean)
      : []
    const payload = {
      policy_name:       form.policy_name,
      provider:          form.provider,
      policy_number:     form.policy_number || null,
      policy_type:       form.policy_type || 'other',
      currency:          form.currency,
      country:           form.currency === 'AED' ? 'UAE' : 'India',
      sum_assured:       Number(form.sum_assured   || 0),
      annual_premium:    Number(form.annual_premium || 0),
      premium_frequency: form.premium_frequency || 'annual',
      start_date:        form.start_date        || null,
      expiry_date:       form.expiry_date        || null,
      next_premium_date: form.next_premium_date  || null,
      insured_members:   members,
    }
    if (isEdit) {
      await supabase.from('insurance_policies').update(payload).eq('id', policyId!)
    } else {
      const { data: { user } } = await supabase.auth.getUser()
      await supabase.from('insurance_policies').insert({ ...payload, is_active: true, user_id: user!.id })
    }
    router.refresh()
    setSaving(false)
    onClose()
  }

  if (!mounted) return null

  return createPortal(
    <div className="fixed inset-0 z-[9999] bg-black/50 flex items-start justify-center overflow-y-auto"
      style={{ paddingTop: '64px', paddingLeft: '16px', paddingRight: '16px', paddingBottom: '16px' }}
      onClick={onClose}>
      <div className="relative w-full max-w-xl bg-white flex flex-col rounded-2xl shadow-2xl flex-shrink-0"
        style={{ border: '1px solid var(--border)' }}
        onClick={e => e.stopPropagation()}>

        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4"
          style={{ borderBottom: '1px solid var(--border)' }}>
          <div>
            <div className="text-[16px] font-bold" style={{ color: 'var(--text)' }}>
              {isEdit ? 'Edit Policy' : 'Add Policy'}
            </div>
            <div className="text-[11px] mt-0.5" style={{ color: 'var(--text3)' }}>
              {isEdit ? 'Update insurance policy details' : 'Enter policy details manually'}
            </div>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg transition-colors"
            style={{ color: 'var(--text3)' }}
            onMouseEnter={e => (e.currentTarget.style.background = 'var(--bg2)')}
            onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}>
            <X size={18} />
          </button>
        </div>

        {/* Form */}
        <div className="px-6 py-5 space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <Inp label="Policy Name" value={form.policy_name ?? ''} onChange={set('policy_name')} placeholder="HDFC Life Click2Protect" />
            <Inp label="Provider / Insurer" value={form.provider ?? ''} onChange={set('provider')} placeholder="HDFC Life" />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <Sel label="Policy Type" value={form.policy_type ?? 'other'} onChange={set('policy_type')}>
              {POLICY_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
            </Sel>
            <Inp label="Policy Number (optional)" value={form.policy_number ?? ''} onChange={set('policy_number')} placeholder="POL-1234567" />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <Sel label="Currency" value={form.currency ?? 'INR'} onChange={set('currency')}>
              <option value="INR">INR 🇮🇳</option>
              <option value="AED">AED 🇦🇪</option>
            </Sel>
            <Inp label="Sum Assured" value={form.sum_assured ?? ''} onChange={set('sum_assured')} type="number" placeholder="1000000" />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <Inp label="Annual Premium" value={form.annual_premium ?? ''} onChange={set('annual_premium')} type="number" placeholder="25000" />
            <Sel label="Premium Frequency" value={form.premium_frequency ?? 'annual'} onChange={set('premium_frequency')}>
              {FREQ_OPTIONS.map(f => <option key={f.value} value={f.value}>{f.label}</option>)}
            </Sel>
          </div>

          <div className="grid grid-cols-3 gap-4">
            <Inp label="Start Date" value={form.start_date ?? ''} onChange={set('start_date')} type="date" />
            <Inp label="Expiry Date" value={form.expiry_date ?? ''} onChange={set('expiry_date')} type="date" />
            <Inp label="Next Premium Due" value={form.next_premium_date ?? ''} onChange={set('next_premium_date')} type="date" />
          </div>

          <Inp label="Insured Members (comma-separated)" value={form.insured_members ?? ''} onChange={set('insured_members')} placeholder="Bhushan, Priya, Aryan" />
        </div>

        {/* Footer */}
        <div className="px-6 py-4 flex gap-3" style={{ borderTop: '1px solid var(--border)' }}>
          <button onClick={onClose} className="flex-1 py-2.5 rounded-lg text-[12px] font-semibold"
            style={{ border: '1px solid var(--border)', color: 'var(--text3)', background: 'var(--bg2)' }}>
            Cancel
          </button>
          <button onClick={save} disabled={saving || !form.policy_name}
            className="flex-1 py-2.5 rounded-lg text-white text-[12px] font-bold flex items-center justify-center gap-2 disabled:opacity-50"
            style={{ background: 'var(--sage)' }}>
            {saving ? <><Loader2 size={14} className="animate-spin" /> Saving…</> : isEdit ? 'Save Changes' : 'Add Policy'}
          </button>
        </div>
      </div>
    </div>,
    document.body
  )
}
