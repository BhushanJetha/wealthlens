'use client'
import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'
import { User, Lock, Bell, Trash2, Plus, Save, Loader2, CheckCircle, Shield, CreditCard, Building2 } from 'lucide-react'
import { AddAccountModal } from '@/components/forms/AddLoanModal'

type Tab = 'profile' | 'accounts' | 'security' | 'preferences'

export default function SettingsClient({ profile, accounts, userId }: any) {
  const [tab, setTab] = useState<Tab>('profile')
  const [fullName, setFullName] = useState(profile?.full_name ?? '')
  const [fxRate, setFxRate] = useState(String(profile?.aed_to_inr ?? '22.80'))
  const [defaultView, setDefaultView] = useState(profile?.default_view ?? 'consolidated')
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [showAddAccount, setShowAddAccount] = useState(false)
  const [accType, setAccType] = useState<'credit_card'|'savings'>('savings')
  const supabase = createClient()
  const router = useRouter()

  async function saveProfile() {
    setSaving(true); setSaved(false)
    await supabase.from('profiles').update({ full_name: fullName, aed_to_inr: Number(fxRate), default_view: defaultView }).eq('id', userId)
    setSaving(false); setSaved(true)
    setTimeout(() => setSaved(false), 2000)
    router.refresh()
  }

  async function deleteAccount(id: string) {
    if (!confirm('Remove this account? Existing transactions will be preserved.')) return
    await supabase.from('accounts').update({ is_active: false }).eq('id', id)
    router.refresh()
  }

  const tabs: Array<{ key: Tab; label: string; icon: any }> = [
    { key: 'profile',     label: 'Profile',      icon: User },
    { key: 'accounts',    label: 'Accounts',      icon: CreditCard },
    { key: 'security',    label: 'Security',      icon: Lock },
    { key: 'preferences', label: 'Preferences',   icon: Bell },
  ]

  return (
    <div className="max-w-2xl mx-auto space-y-5 animate-fade-up">
      <div>
        <h1 className="text-lg font-bold text-white">Settings</h1>
        <p className="text-xs text-slate-500 mt-0.5">Manage your account, preferences and security</p>
      </div>

      {/* Tab bar */}
      <div className="flex gap-1 bg-[#162032] border border-white/7 rounded-xl p-1">
        {tabs.map(t => (
          <button key={t.key} onClick={() => setTab(t.key)}
            className={`flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg text-[12px] font-semibold transition-all ${
              tab === t.key ? 'bg-[#1E2D40] text-white' : 'text-slate-500 hover:text-slate-300'
            }`}>
            <t.icon size={13} /> {t.label}
          </button>
        ))}
      </div>

      {/* Profile Tab */}
      {tab === 'profile' && (
        <div className="bg-[#162032] border border-white/7 rounded-xl p-5 space-y-4">
          <div className="text-[12px] font-bold text-slate-300">Profile Information</div>

          <div className="flex items-center gap-4">
            <div className="w-16 h-16 rounded-full bg-[#00C9A7]/15 flex items-center justify-center text-[22px] font-bold text-[#00C9A7]">
              {fullName ? fullName[0].toUpperCase() : profile?.email?.[0].toUpperCase() ?? 'U'}
            </div>
            <div>
              <div className="text-[14px] font-bold text-white">{fullName || 'Your Name'}</div>
              <div className="text-[12px] text-slate-500">{profile?.email}</div>
            </div>
          </div>

          <div>
            <label className="block text-[10px] text-slate-500 uppercase tracking-wider mb-1.5">Full Name</label>
            <input value={fullName} onChange={e => setFullName(e.target.value)}
              placeholder="Your full name"
              className="w-full bg-[#0D1B2A] border border-white/10 rounded-lg px-3 py-2.5 text-[13px] text-white focus:outline-none focus:border-[#00C9A7] transition-colors" />
          </div>

          <div>
            <label className="block text-[10px] text-slate-500 uppercase tracking-wider mb-1.5">Email</label>
            <input value={profile?.email ?? ''} disabled
              className="w-full bg-[#0D1B2A]/50 border border-white/5 rounded-lg px-3 py-2.5 text-[13px] text-slate-500 cursor-not-allowed" />
            <p className="text-[10px] text-slate-600 mt-1">Email cannot be changed here. Use Supabase auth settings.</p>
          </div>

          <button onClick={saveProfile} disabled={saving}
            className="flex items-center gap-2 px-5 py-2.5 rounded-lg text-black text-[12px] font-bold disabled:opacity-50"
            style={{ background: 'linear-gradient(135deg,#00C9A7,#4A90D9)' }}>
            {saving ? <><Loader2 size={14} className="animate-spin" />Saving…</>
              : saved ? <><CheckCircle size={14} />Saved!</>
              : <><Save size={14} />Save Changes</>}
          </button>
        </div>
      )}

      {/* Accounts Tab */}
      {tab === 'accounts' && (
        <div className="space-y-3">
          <div className="flex gap-2">
            <button onClick={() => { setAccType('savings'); setShowAddAccount(true) }}
              className="flex items-center gap-2 px-3 py-2 rounded-lg text-black text-[12px] font-bold"
              style={{ background: 'linear-gradient(135deg,#00C9A7,#4A90D9)' }}>
              <Plus size={13} /> Add Bank Account
            </button>
            <button onClick={() => { setAccType('credit_card'); setShowAddAccount(true) }}
              className="flex items-center gap-2 px-3 py-2 rounded-lg text-[12px] font-bold bg-[#162032] border border-white/10 text-slate-300 hover:text-white transition-all">
              <CreditCard size={13} /> Add Credit Card
            </button>
          </div>

          {accounts.length === 0 ? (
            <div className="bg-[#162032] border border-dashed border-white/10 rounded-xl py-12 text-center text-slate-600 text-sm">
              No accounts yet. Add your bank accounts and credit cards above.
            </div>
          ) : (
            <div className="space-y-2">
              {accounts.map((acc: any) => (
                <div key={acc.id} className="bg-[#162032] border border-white/7 rounded-xl p-4 flex items-center justify-between gap-3">
                  <div className="flex items-center gap-3">
                    <div className="w-9 h-9 rounded-lg bg-[#1E2D40] flex items-center justify-center">
                      {acc.account_type === 'credit_card' ? <CreditCard size={15} className="text-[#4A90D9]" /> : <Building2 size={15} className="text-[#00C9A7]" />}
                    </div>
                    <div>
                      <div className="text-[13px] font-bold text-white">{acc.name}</div>
                      <div className="text-[11px] text-slate-500">{acc.bank_name} · {acc.currency} · {acc.country}</div>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    {acc.last_four && <span className="text-[11px] font-mono text-slate-500">••••{acc.last_four}</span>}
                    <span className={`text-[10px] px-2 py-0.5 rounded-full font-semibold capitalize ${
                      acc.account_type === 'credit_card' ? 'bg-[#4A90D9]/15 text-[#4A90D9]' : 'bg-[#00C9A7]/15 text-[#00C9A7]'
                    }`}>{acc.account_type.replace('_',' ')}</span>
                    <button onClick={() => deleteAccount(acc.id)} className="text-slate-600 hover:text-rose-400 transition-colors">
                      <Trash2 size={14} />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
          {showAddAccount && <AddAccountModal onClose={() => { setShowAddAccount(false); router.refresh() }} type={accType} />}
        </div>
      )}

      {/* Security Tab */}
      {tab === 'security' && (
        <div className="space-y-3">
          <div className="bg-[#162032] border border-white/7 rounded-xl p-5 space-y-4">
            <div className="text-[12px] font-bold text-slate-300">Security Overview</div>

            {[
              { icon: Shield, label: 'AES-256-GCM Encryption', sub: 'Sensitive financial data encrypted at rest', status: 'active' },
              { icon: Lock,   label: 'Row-Level Security',      sub: 'Your data is invisible to other users',    status: 'active' },
              { icon: Shield, label: 'HTTPS Transport',         sub: 'All data in transit is encrypted',          status: 'active' },
              { icon: Lock,   label: 'Two-Factor Authentication', sub: 'Available via Supabase Auth dashboard',   status: 'optional' },
            ].map((item, i) => (
              <div key={i} className="flex items-start gap-3">
                <div className={`w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 ${item.status === 'active' ? 'bg-[#00C9A7]/15' : 'bg-[#F4A535]/15'}`}>
                  <item.icon size={14} className={item.status === 'active' ? 'text-[#00C9A7]' : 'text-[#F4A535]'} />
                </div>
                <div>
                  <div className="text-[12px] font-semibold text-white flex items-center gap-2">
                    {item.label}
                    <span className={`text-[10px] px-1.5 py-0.5 rounded font-bold ${item.status === 'active' ? 'bg-[#00C9A7]/15 text-[#00C9A7]' : 'bg-[#F4A535]/15 text-[#F4A535]'}`}>
                      {item.status === 'active' ? 'ACTIVE' : 'OPTIONAL'}
                    </span>
                  </div>
                  <div className="text-[11px] text-slate-500 mt-0.5">{item.sub}</div>
                </div>
              </div>
            ))}
          </div>

          <div className="bg-[#162032] border border-white/7 rounded-xl p-5">
            <div className="text-[12px] font-bold text-slate-300 mb-3">Change Password</div>
            <p className="text-[12px] text-slate-500 mb-3">A password reset link will be sent to your email address.</p>
            <button onClick={async () => {
              const supabase = createClient()
              await supabase.auth.resetPasswordForEmail(profile?.email, { redirectTo: `${window.location.origin}/auth/reset-password` })
              alert('Password reset email sent!')
            }}
              className="px-4 py-2 rounded-lg border border-white/10 text-[12px] text-slate-300 hover:bg-white/5 transition-all">
              Send Reset Email
            </button>
          </div>
        </div>
      )}

      {/* Preferences Tab */}
      {tab === 'preferences' && (
        <div className="bg-[#162032] border border-white/7 rounded-xl p-5 space-y-5">
          <div className="text-[12px] font-bold text-slate-300">Display Preferences</div>

          <div>
            <label className="block text-[10px] text-slate-500 uppercase tracking-wider mb-2">Default Dashboard View</label>
            <div className="flex gap-2 flex-wrap">
              {[
                { val: 'uae',          label: '🇦🇪 UAE (AED)' },
                { val: 'india',        label: '🇮🇳 India (INR)' },
                { val: 'consolidated', label: '🌐 Consolidated' },
              ].map(v => (
                <button key={v.val} onClick={() => setDefaultView(v.val)}
                  className={`px-4 py-2 rounded-lg text-[12px] font-semibold border transition-all ${
                    defaultView === v.val ? 'bg-[#00C9A7] border-[#00C9A7] text-black' : 'bg-[#1E2D40] border-white/10 text-slate-400 hover:text-white'
                  }`}>
                  {v.label}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="block text-[10px] text-slate-500 uppercase tracking-wider mb-2">AED → INR Exchange Rate</label>
            <div className="flex items-center gap-3">
              <span className="text-[12px] text-slate-400">1 AED =</span>
              <input type="number" value={fxRate} onChange={e => setFxRate(e.target.value)} step="0.01"
                className="bg-[#0D1B2A] border border-white/10 rounded-lg px-3 py-2 text-[13px] font-mono font-bold text-[#F4A535] w-28 focus:outline-none focus:border-[#00C9A7]" />
              <span className="text-[12px] text-slate-400">INR</span>
            </div>
            <p className="text-[10px] text-slate-600 mt-1.5">Update periodically to keep consolidated view accurate. Current market rate: ~22.80</p>
          </div>

          <button onClick={saveProfile} disabled={saving}
            className="flex items-center gap-2 px-5 py-2.5 rounded-lg text-black text-[12px] font-bold disabled:opacity-50"
            style={{ background: 'linear-gradient(135deg,#00C9A7,#4A90D9)' }}>
            {saving ? <><Loader2 size={14} className="animate-spin" />Saving…</>
              : saved ? <><CheckCircle size={14} />Saved!</>
              : <><Save size={14} />Save Preferences</>}
          </button>
        </div>
      )}
    </div>
  )
}
