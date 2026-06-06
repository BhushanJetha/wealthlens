'use client'
import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'
import { User, Lock, Bell, Save, Loader2, CheckCircle, Shield } from 'lucide-react'

type Tab = 'profile' | 'security' | 'preferences'

export default function SettingsClient({ profile, userId }: any) {
  const [tab, setTab] = useState<Tab>('profile')
  const [fullName, setFullName] = useState(profile?.full_name ?? '')
  const [fxRate, setFxRate] = useState(String(profile?.aed_to_inr ?? '22.80'))
  const [defaultView, setDefaultView] = useState(profile?.default_view ?? 'consolidated')
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const supabase = createClient()
  const router = useRouter()

  async function saveProfile() {
    setSaving(true); setSaved(false)
    await supabase.from('profiles').update({ full_name: fullName, aed_to_inr: Number(fxRate), default_view: defaultView }).eq('id', userId)
    setSaving(false); setSaved(true)
    setTimeout(() => setSaved(false), 2000)
    router.refresh()
  }

  const tabs: Array<{ key: Tab; label: string; icon: any }> = [
    { key: 'profile',     label: 'Profile',     icon: User },
    { key: 'security',    label: 'Security',    icon: Lock },
    { key: 'preferences', label: 'Preferences', icon: Bell },
  ]

  return (
    <div className="max-w-2xl mx-auto space-y-5 animate-fade-up">
      <div>
        <h1 className="text-xl font-bold" style={{ color: 'var(--text)' }}>Settings</h1>
        <p className="text-[12px] mt-0.5" style={{ color: 'var(--text3)' }}>Manage your account, preferences and security</p>
      </div>

      {/* Tab bar */}
      <div className="flex gap-1 rounded-xl p-1" style={{ background: 'var(--bg2)', border: '1px solid var(--border)' }}>
        {tabs.map(t => (
          <button key={t.key} onClick={() => setTab(t.key)}
            className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg text-[12px] font-semibold transition-all"
            style={tab === t.key
              ? { background: '#fff', color: 'var(--text)', boxShadow: '0 1px 3px rgba(0,0,0,0.08)' }
              : { background: 'transparent', color: 'var(--text3)' }}>
            <t.icon size={13} /> {t.label}
          </button>
        ))}
      </div>

      {/* Profile Tab */}
      {tab === 'profile' && (
        <div className="wl-card p-5 space-y-4">
          <div className="text-[12px] font-bold" style={{ color: 'var(--text2)' }}>Profile Information</div>

          <div className="flex items-center gap-4">
            <div className="w-16 h-16 rounded-full flex items-center justify-center text-[22px] font-bold"
              style={{ background: 'var(--sage-bg)', color: 'var(--sage)' }}>
              {fullName ? fullName[0].toUpperCase() : profile?.email?.[0].toUpperCase() ?? 'U'}
            </div>
            <div>
              <div className="text-[14px] font-bold" style={{ color: 'var(--text)' }}>{fullName || 'Your Name'}</div>
              <div className="text-[12px]" style={{ color: 'var(--text3)' }}>{profile?.email}</div>
            </div>
          </div>

          <div>
            <label className="block text-[10px] uppercase tracking-wider mb-1.5" style={{ color: 'var(--text3)' }}>Full Name</label>
            <input value={fullName} onChange={e => setFullName(e.target.value)}
              placeholder="Your full name"
              className="wl-input"
              onFocus={e => (e.target.style.borderColor = 'var(--sage)')}
              onBlur={e => (e.target.style.borderColor = 'var(--border)')} />
          </div>

          <div>
            <label className="block text-[10px] uppercase tracking-wider mb-1.5" style={{ color: 'var(--text3)' }}>Email</label>
            <input value={profile?.email ?? ''} disabled
              className="wl-input opacity-60 cursor-not-allowed" />
            <p className="text-[10px] mt-1" style={{ color: 'var(--text3)' }}>Email cannot be changed here.</p>
          </div>

          <button onClick={saveProfile} disabled={saving}
            className="flex items-center gap-2 px-5 py-2.5 rounded-lg text-white text-[12px] font-bold disabled:opacity-50"
            style={{ background: 'var(--sage)' }}>
            {saving ? <><Loader2 size={14} className="animate-spin" />Saving…</>
              : saved ? <><CheckCircle size={14} />Saved!</>
              : <><Save size={14} />Save Changes</>}
          </button>
        </div>
      )}

      {/* Security Tab */}
      {tab === 'security' && (
        <div className="space-y-3">
          <div className="wl-card p-5 space-y-4">
            <div className="text-[12px] font-bold" style={{ color: 'var(--text2)' }}>Security Overview</div>

            {[
              { icon: Shield, label: 'AES-256-GCM Encryption',    sub: 'Sensitive financial data encrypted at rest',  status: 'active' },
              { icon: Lock,   label: 'Row-Level Security',         sub: 'Your data is invisible to other users',       status: 'active' },
              { icon: Shield, label: 'HTTPS Transport',            sub: 'All data in transit is encrypted',            status: 'active' },
              { icon: Lock,   label: 'Two-Factor Authentication',  sub: 'Available via Supabase Auth dashboard',       status: 'optional' },
            ].map((item, i) => (
              <div key={i} className="flex items-start gap-3">
                <div className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0"
                  style={{ background: item.status === 'active' ? 'var(--income-bg)' : 'var(--gold-bg)' }}>
                  <item.icon size={14} style={{ color: item.status === 'active' ? 'var(--income)' : 'var(--gold)' }} />
                </div>
                <div>
                  <div className="text-[12px] font-semibold flex items-center gap-2" style={{ color: 'var(--text)' }}>
                    {item.label}
                    <span className="text-[10px] px-1.5 py-0.5 rounded font-bold"
                      style={item.status === 'active'
                        ? { background: 'var(--income-bg)', color: 'var(--income)' }
                        : { background: 'var(--gold-bg)', color: 'var(--gold)' }}>
                      {item.status === 'active' ? 'ACTIVE' : 'OPTIONAL'}
                    </span>
                  </div>
                  <div className="text-[11px] mt-0.5" style={{ color: 'var(--text3)' }}>{item.sub}</div>
                </div>
              </div>
            ))}
          </div>

          <div className="wl-card p-5">
            <div className="text-[12px] font-bold mb-3" style={{ color: 'var(--text2)' }}>Change Password</div>
            <p className="text-[12px] mb-3" style={{ color: 'var(--text3)' }}>A password reset link will be sent to your email address.</p>
            <button onClick={async () => {
              const supabase = createClient()
              await supabase.auth.resetPasswordForEmail(profile?.email, { redirectTo: `${window.location.origin}/auth/reset-password` })
              alert('Password reset email sent!')
            }}
              className="px-4 py-2 rounded-lg text-[12px] font-semibold transition-all"
              style={{ border: '1px solid var(--border)', color: 'var(--text2)', background: 'var(--bg2)' }}>
              Send Reset Email
            </button>
          </div>
        </div>
      )}

      {/* Preferences Tab */}
      {tab === 'preferences' && (
        <div className="wl-card p-5 space-y-5">
          <div className="text-[12px] font-bold" style={{ color: 'var(--text2)' }}>Display Preferences</div>

          <div>
            <label className="block text-[10px] uppercase tracking-wider mb-2" style={{ color: 'var(--text3)' }}>Default Dashboard View</label>
            <div className="flex gap-2 flex-wrap">
              {[
                { val: 'uae',          label: '🇦🇪 UAE (AED)' },
                { val: 'india',        label: '🇮🇳 India (INR)' },
                { val: 'consolidated', label: '🌐 Consolidated' },
              ].map(v => (
                <button key={v.val} onClick={() => setDefaultView(v.val)}
                  className="px-4 py-2 rounded-lg text-[12px] font-semibold border transition-all"
                  style={defaultView === v.val
                    ? { background: 'var(--sage)', borderColor: 'var(--sage)', color: '#fff' }
                    : { background: 'var(--bg2)', borderColor: 'var(--border)', color: 'var(--text3)' }}>
                  {v.label}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="block text-[10px] uppercase tracking-wider mb-2" style={{ color: 'var(--text3)' }}>AED → INR Exchange Rate</label>
            <div className="flex items-center gap-3">
              <span className="text-[12px]" style={{ color: 'var(--text3)' }}>1 AED =</span>
              <input type="number" value={fxRate} onChange={e => setFxRate(e.target.value)} step="0.01"
                className="wl-input w-28 font-mono font-bold"
                style={{ color: 'var(--gold)' }}
                onFocus={e => (e.target.style.borderColor = 'var(--sage)')}
                onBlur={e => (e.target.style.borderColor = 'var(--border)')} />
              <span className="text-[12px]" style={{ color: 'var(--text3)' }}>INR</span>
            </div>
            <p className="text-[10px] mt-1.5" style={{ color: 'var(--text3)' }}>Current market rate: ~22.80</p>
          </div>

          <button onClick={saveProfile} disabled={saving}
            className="flex items-center gap-2 px-5 py-2.5 rounded-lg text-white text-[12px] font-bold disabled:opacity-50"
            style={{ background: 'var(--sage)' }}>
            {saving ? <><Loader2 size={14} className="animate-spin" />Saving…</>
              : saved ? <><CheckCircle size={14} />Saved!</>
              : <><Save size={14} />Save Preferences</>}
          </button>
        </div>
      )}
    </div>
  )
}
