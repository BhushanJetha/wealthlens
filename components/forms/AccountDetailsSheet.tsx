'use client'
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { X, Pencil, Trash2, Copy, Eye, EyeOff, Lock, LockOpen, KeyRound, ShieldCheck, Loader2, Check, AlertTriangle } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { isMissingTable } from '@/lib/supabase/missingTable'
import { createVault, unlockVault, encryptText, decryptText, type VaultMeta } from '@/lib/vault'
import { useVaultStore } from '@/store/vaultStore'
import { toast } from '@/components/ui/toaster'

type Fact = [string, string]
const FIELD = { height: 42, fontSize: 14, borderRadius: 9, background: '#F7F8FA', borderColor: '#E2E8F0' }
const Label = ({ children }: { children: React.ReactNode }) => (
  <div className="text-[11px] font-semibold uppercase tracking-[0.05em] mb-1.5" style={{ color: 'var(--text3)' }}>{children}</div>
)
const mask = (v: string, keep = 4) => v.length <= keep ? v : `${'•'.repeat(Math.min(v.length - keep, 8))}${v.slice(-keep)}`

// Tap-through sheet for a bank account or credit card: the card face, key
// numbers, saved bank details (masked, with reveal + copy) and the net
// banking password, which lives in the locked vault (encrypted on device).
export default function AccountDetailsSheet({ account, details, face, facts, isCard, onClose, onEdit, onDelete }: {
  account: any; details: any | null; face: React.ReactNode; facts: Fact[]; isCard: boolean
  onClose: () => void; onEdit: () => void; onDelete: () => void
}) {
  const router = useRouter()
  const supabase = createClient()
  const { key, unlock, touch, lock } = useVaultStore()

  const blank = { holder_name: '', account_number: '', ifsc: '', iban: '', swift: '', branch: '', customer_id: '', netbanking_user: '', card_network: '', notes: '' }
  const [d, setD] = useState<typeof blank>({ ...blank, ...Object.fromEntries(Object.entries(details ?? {}).filter(([k]) => k in blank).map(([k, v]) => [k, v ?? ''])) })
  const [editing, setEditing] = useState(false)
  const [saving, setSaving] = useState(false)
  const [shown, setShown] = useState<Record<string, boolean>>({})
  const [missing, setMissing] = useState(false)

  // Vault state for this account
  const [meta, setMeta] = useState<VaultMeta | null | undefined>(undefined)   // undefined = loading
  const [item, setItem] = useState<{ iv: string; ct: string } | null>(null)
  const [pass, setPass] = useState(''), [pass2, setPass2] = useState('')
  const [vaultBusy, setVaultBusy] = useState(false), [vaultErr, setVaultErr] = useState('')
  const [secret, setSecret] = useState<string | null>(null)     // decrypted, shown briefly
  const [newSecret, setNewSecret] = useState(''), [changing, setChanging] = useState(false)
  const [resetting, setResetting] = useState(false), [resetText, setResetText] = useState('')

  useEffect(() => {
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', esc); return () => window.removeEventListener('keydown', esc)
  }, [onClose])
  useEffect(() => { (async () => {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return
    const [m, it] = await Promise.all([
      supabase.from('vault_meta').select('salt,iterations,check_iv,check_ct').eq('user_id', user.id).maybeSingle(),
      supabase.from('vault_items').select('iv,ct').eq('account_id', account.id).eq('kind', 'netbanking_password').maybeSingle(),
    ])
    if (isMissingTable(m.error)) { setMissing(true); setMeta(null); return }
    setMeta((m.data as VaultMeta) ?? null)
    setItem(it.data ?? null)
  })() }, [account.id]) // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { if (secret == null) return; const t = setTimeout(() => setSecret(null), 30000); return () => clearTimeout(t) }, [secret])

  const copy = async (label: string, v: string) => {
    try { await navigator.clipboard.writeText(v); toast(`${label} copied`) } catch { toast('Couldn’t copy', 'error') }
  }

  async function saveDetails() {
    if (isCard && d.account_number && !/^\d{4}$/.test(d.account_number.trim())) { toast('For cards, save only the last 4 digits', 'error'); return }
    setSaving(true)
    const { data: { user } } = await supabase.auth.getUser()
    const row = Object.fromEntries(Object.entries(d).map(([k, v]) => [k, String(v).trim() || null]))
    const { error } = await supabase.from('account_details').upsert({ ...row, user_id: user!.id, account_id: account.id, updated_at: new Date().toISOString() }, { onConflict: 'account_id' })
    setSaving(false)
    if (error) { if (isMissingTable(error)) setMissing(true); toast(isMissingTable(error) ? 'Run migration 025 to save bank details' : error.message, 'error'); return }
    // Keep the card's last four in step with what was saved
    const last4 = d.account_number.replace(/\D/g, '').slice(-4)
    if (last4 && last4 !== account.last_four) await supabase.from('accounts').update({ last_four: last4 }).eq('id', account.id)
    toast('Details saved'); setEditing(false); router.refresh()
  }

  // ── Vault actions ───────────────────────────────────────────────────────
  async function setUpVault() {
    if (pass.length < 10) { setVaultErr('Use at least 10 characters — a short sentence works well.'); return }
    if (pass !== pass2) { setVaultErr('The two passphrases don’t match.'); return }
    setVaultBusy(true); setVaultErr('')
    const { data: { user } } = await supabase.auth.getUser()
    const { meta: m, key: k } = await createVault(pass)
    const { error } = await supabase.from('vault_meta').insert({ user_id: user!.id, ...m })
    setVaultBusy(false)
    if (error) { setVaultErr(error.message); return }
    setMeta(m); unlock(k); setPass(''); setPass2(''); toast('Vault ready')
  }
  async function doUnlock() {
    if (!meta) return
    setVaultBusy(true); setVaultErr('')
    const k = await unlockVault(pass, meta)
    setVaultBusy(false)
    if (!k) { setVaultErr('That passphrase didn’t unlock the vault.'); return }
    unlock(k); setPass('')
  }
  async function reveal() {
    if (!key || !item) return
    try { setSecret(await decryptText(key, item.iv, item.ct)); touch() } catch { toast('Couldn’t decrypt — lock and unlock again', 'error') }
  }
  async function saveSecret() {
    if (!key || !newSecret) return
    setVaultBusy(true)
    const { data: { user } } = await supabase.auth.getUser()
    const enc = await encryptText(key, newSecret)
    const { error } = await supabase.from('vault_items').upsert({ user_id: user!.id, account_id: account.id, kind: 'netbanking_password', ...enc, updated_at: new Date().toISOString() }, { onConflict: 'account_id,kind' })
    setVaultBusy(false)
    if (error) { toast(error.message, 'error'); return }
    setItem(enc); setNewSecret(''); setChanging(false); setSecret(null); touch(); toast('Password saved in the vault')
  }
  async function removeSecret() {
    if (!confirm('Remove the saved password for this account?')) return
    await supabase.from('vault_items').delete().eq('account_id', account.id).eq('kind', 'netbanking_password')
    setItem(null); setSecret(null); toast('Password removed')
  }
  async function resetVault() {
    if (resetText !== 'RESET') return
    const { data: { user } } = await supabase.auth.getUser()
    await supabase.from('vault_items').delete().eq('user_id', user!.id)
    await supabase.from('vault_meta').delete().eq('user_id', user!.id)
    lock(); setMeta(null); setItem(null); setResetting(false); setResetText(''); toast('Vault cleared')
  }

  const rows: { k: keyof typeof blank; label: string; secret?: boolean; hide?: boolean }[] = [
    { k: 'holder_name', label: isCard ? 'Name on card' : 'Account holder' },
    { k: 'account_number', label: isCard ? 'Card number (last 4)' : 'Account number', secret: !isCard },
    { k: 'ifsc', label: 'IFSC', hide: isCard || account.currency === 'AED' },
    { k: 'iban', label: 'IBAN', secret: true, hide: isCard },
    { k: 'swift', label: 'SWIFT / BIC', hide: isCard },
    { k: 'branch', label: 'Branch', hide: isCard },
    { k: 'customer_id', label: 'Customer ID', secret: true },
    { k: 'netbanking_user', label: isCard ? 'App / portal user ID' : 'Net banking user ID', secret: true },
    { k: 'notes', label: 'Notes' },
  ]
  const visible = rows.filter(r => !r.hide)
  const filled = visible.filter(r => d[r.k])

  return (
    <div className="fixed inset-0 wl-sheet z-50 flex items-center justify-center p-4" style={{ background: 'rgba(15,23,42,.4)' }} onClick={onClose}>
      <div className="wl-sheet-panel bg-white w-full max-w-[480px] rounded-2xl flex flex-col max-h-[92vh]" style={{ boxShadow: '0 24px 60px rgba(15,23,42,.3)' }}
        onClick={e => e.stopPropagation()} role="dialog" aria-modal="true" aria-label={account.name}>
        <div className="px-5 md:px-6 pt-5 pb-3 flex items-center justify-between gap-3">
          <h2 className="text-[18px] font-bold truncate" style={{ color: 'var(--text)' }}>{account.name}</h2>
          <button onClick={onClose} aria-label="Close" className="w-8 h-8 -mr-1 rounded-lg flex items-center justify-center hover:bg-[var(--bg2)]" style={{ color: 'var(--text3)' }}><X size={18} /></button>
        </div>

        <div className="overflow-y-auto px-5 md:px-6 pb-5 flex flex-col gap-4">
          <div className="max-w-[360px] w-full mx-auto">{face}</div>

          <div className="grid grid-cols-2 gap-2">
            {facts.map(([l, v]) => (
              <div key={l} className="rounded-xl px-3 py-2" style={{ background: '#FAFAFE', border: '1px solid var(--line)' }}>
                <div className="text-[11px]" style={{ color: 'var(--text3)' }}>{l}</div>
                <div className="text-[14px] font-bold tabular-nums truncate" style={{ color: 'var(--text)' }}>{v}</div>
              </div>
            ))}
          </div>
          <div className="flex gap-2">
            <button onClick={onEdit} className="wl-btn flex-1" style={{ height: 38 }}><Pencil size={14} />{isCard ? 'Edit balance & limit' : 'Edit balance'}</button>
            <button onClick={onDelete} className="wl-btn" style={{ height: 38, color: '#DC2626' }}><Trash2 size={14} />Remove</button>
          </div>

          {/* Bank details */}
          <section className="rounded-2xl px-4 py-3.5" style={{ border: '1px solid var(--line)' }}>
            <div className="flex items-center justify-between mb-1">
              <h3 className="text-[14px] font-semibold" style={{ color: 'var(--text)' }}>{isCard ? 'Card details' : 'Bank details'}</h3>
              {!editing && !missing && <button onClick={() => setEditing(true)} className="text-[12.5px] font-semibold flex items-center gap-1" style={{ color: 'var(--accent)' }}><Pencil size={12} />{filled.length ? 'Edit' : 'Add details'}</button>}
            </div>
            {missing ? (
              <div className="text-[12.5px] leading-snug py-1" style={{ color: '#92560B' }}>To save details and passwords, run <b>supabase/migrations/025_bank_details_vault.sql</b> in Supabase.</div>
            ) : editing ? (
              <div className="flex flex-col gap-2.5 mt-2">
                {visible.map(r => (
                  <div key={r.k}>
                    <Label>{r.label}</Label>
                    <input value={d[r.k]} onChange={e => setD(x => ({ ...x, [r.k]: e.target.value }))} className="wl-input" style={FIELD}
                      inputMode={r.k === 'account_number' && isCard ? 'numeric' : undefined} maxLength={r.k === 'account_number' && isCard ? 4 : 64}
                      autoComplete="off" spellCheck={false} placeholder={r.k === 'account_number' && isCard ? 'e.g. 6634' : ''} />
                  </div>
                ))}
                {isCard && (
                  <div>
                    <Label>Network</Label>
                    <select value={d.card_network} onChange={e => setD(x => ({ ...x, card_network: e.target.value }))} className="wl-input" style={FIELD}>
                      <option value="">Detect from the name</option><option value="visa">Visa</option><option value="mastercard">Mastercard</option>
                      <option value="amex">American Express</option><option value="rupay">RuPay</option><option value="diners">Diners Club</option>
                    </select>
                  </div>
                )}
                {isCard && <div className="text-[11.5px]" style={{ color: 'var(--text4)' }}>Never save a full card number, CVV or PIN anywhere — the last 4 digits are enough to recognise the card.</div>}
                <div className="flex gap-2 mt-1">
                  <button onClick={() => setEditing(false)} className="wl-btn" style={{ height: 40, padding: '0 16px' }}>Cancel</button>
                  <button onClick={saveDetails} disabled={saving} className="wl-btn wl-btn-primary flex-1" style={{ height: 40 }}>{saving ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />}Save details</button>
                </div>
              </div>
            ) : filled.length === 0 ? (
              <div className="text-[12.5px] py-1" style={{ color: 'var(--text3)' }}>Keep the {isCard ? 'card' : 'account'}’s details handy: {isCard ? 'name on card, last 4 digits, network' : 'account number, IFSC / IBAN, SWIFT, branch, customer ID and net banking user ID'}.</div>
            ) : filled.map((r, i) => {
              const v = String(d[r.k]), open = shown[r.k] || !r.secret
              return (
                <div key={r.k} className="flex items-center gap-2 py-2" style={{ borderTop: i ? '1px solid var(--track)' : 'none' }}>
                  <div className="flex-1 min-w-0">
                    <div className="text-[11px]" style={{ color: 'var(--text3)' }}>{r.label}</div>
                    <div className="text-[13.5px] font-medium tabular-nums break-all" style={{ color: 'var(--text)' }}>{open ? v : mask(v)}</div>
                  </div>
                  {r.secret && <button onClick={() => setShown(s => ({ ...s, [r.k]: !s[r.k] }))} aria-label={open ? `Hide ${r.label}` : `Show ${r.label}`} className="w-8 h-8 rounded-lg flex items-center justify-center hover:bg-[var(--accent-bg)]" style={{ color: 'var(--text3)' }}>{open ? <EyeOff size={15} /> : <Eye size={15} />}</button>}
                  <button onClick={() => copy(r.label, v)} aria-label={`Copy ${r.label}`} className="w-8 h-8 rounded-lg flex items-center justify-center hover:bg-[var(--accent-bg)]" style={{ color: 'var(--text3)' }}><Copy size={15} /></button>
                </div>
              )
            })}
          </section>

          {/* Password vault */}
          {!missing && (
            <section className="rounded-2xl px-4 py-3.5" style={{ border: '1px solid var(--line)', background: '#FCFBFF' }}>
              <div className="flex items-center justify-between mb-1">
                <h3 className="text-[14px] font-semibold flex items-center gap-2" style={{ color: 'var(--text)' }}><KeyRound size={15} style={{ color: 'var(--accent)' }} />{isCard ? 'App / portal password' : 'Net banking password'}</h3>
                {key && <button onClick={() => { lock(); setSecret(null) }} className="text-[12.5px] font-semibold flex items-center gap-1" style={{ color: 'var(--text3)' }}><Lock size={12} />Lock vault</button>}
              </div>

              {meta === undefined ? <div className="py-3 flex justify-center"><Loader2 size={16} className="animate-spin" style={{ color: 'var(--text3)' }} /></div>
              : meta === null ? (
                <div className="flex flex-col gap-2.5 mt-1">
                  <p className="text-[12.5px] leading-snug" style={{ color: 'var(--text3)' }}>Set a vault passphrase first. Passwords are encrypted on this device with it — WealthLens never sees the passphrase. <b style={{ color: 'var(--text2)' }}>If you forget it, saved passwords can’t be recovered.</b></p>
                  <input type="password" value={pass} onChange={e => setPass(e.target.value)} placeholder="Vault passphrase (10+ characters)" className="wl-input" style={FIELD} autoComplete="new-password" />
                  <input type="password" value={pass2} onChange={e => setPass2(e.target.value)} placeholder="Type it again" className="wl-input" style={FIELD} autoComplete="new-password" />
                  {vaultErr && <div className="text-[12.5px]" style={{ color: '#B4231A' }}>{vaultErr}</div>}
                  <button onClick={setUpVault} disabled={vaultBusy} className="wl-btn wl-btn-primary" style={{ height: 40 }}>{vaultBusy ? <Loader2 size={14} className="animate-spin" /> : <ShieldCheck size={14} />}Create vault</button>
                </div>
              ) : !key ? (
                <div className="flex flex-col gap-2.5 mt-1">
                  <p className="text-[12.5px]" style={{ color: 'var(--text3)' }}>{item ? 'A password is saved. Unlock the vault to see it.' : 'Unlock the vault to save a password.'}</p>
                  <div className="flex gap-2">
                    <input type="password" value={pass} onChange={e => setPass(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') doUnlock() }} placeholder="Vault passphrase" className="wl-input flex-1" style={FIELD} autoComplete="current-password" />
                    <button onClick={doUnlock} disabled={vaultBusy || !pass} className="wl-btn wl-btn-primary" style={{ height: 42 }}>{vaultBusy ? <Loader2 size={14} className="animate-spin" /> : <LockOpen size={14} />}Unlock</button>
                  </div>
                  {vaultErr && <div className="text-[12.5px]" style={{ color: '#B4231A' }}>{vaultErr}</div>}
                  {!resetting ? <button onClick={() => setResetting(true)} className="text-[12px] self-start" style={{ color: 'var(--text4)' }}>Forgot the passphrase?</button> : (
                    <div className="rounded-xl px-3 py-2.5 flex flex-col gap-2" style={{ background: '#FFF6F4', border: '1px solid #F6CFC6' }}>
                      <div className="text-[12.5px] leading-snug" style={{ color: 'var(--text2)' }}>Without it, saved passwords can’t be read. You can clear the vault (all saved passwords) and start again. Type <b>RESET</b> to confirm.</div>
                      <div className="flex gap-2">
                        <input value={resetText} onChange={e => setResetText(e.target.value)} className="wl-input flex-1" style={{ ...FIELD, height: 38 }} />
                        <button onClick={resetVault} disabled={resetText !== 'RESET'} className="wl-btn" style={{ height: 38, color: '#DC2626' }}>Clear vault</button>
                      </div>
                    </div>
                  )}
                </div>
              ) : item && !changing ? (
                <div className="flex items-center gap-2 py-1.5">
                  <div className="flex-1 min-w-0 text-[14px] font-medium tabular-nums break-all" style={{ color: 'var(--text)' }}>{secret ?? '••••••••••'}</div>
                  <button onClick={() => secret ? setSecret(null) : reveal()} aria-label={secret ? 'Hide password' : 'Show password'} className="w-8 h-8 rounded-lg flex items-center justify-center hover:bg-[var(--accent-bg)]" style={{ color: 'var(--text3)' }}>{secret ? <EyeOff size={15} /> : <Eye size={15} />}</button>
                  <button onClick={async () => { if (!key || !item) return; const v = await decryptText(key, item.iv, item.ct); copy('Password', v); touch() }} aria-label="Copy password" className="w-8 h-8 rounded-lg flex items-center justify-center hover:bg-[var(--accent-bg)]" style={{ color: 'var(--text3)' }}><Copy size={15} /></button>
                  <button onClick={() => { setChanging(true); setSecret(null) }} aria-label="Change password" className="w-8 h-8 rounded-lg flex items-center justify-center hover:bg-[var(--accent-bg)]" style={{ color: 'var(--text3)' }}><Pencil size={14} /></button>
                  <button onClick={removeSecret} aria-label="Remove password" className="w-8 h-8 rounded-lg flex items-center justify-center hover:bg-[#FDECE8]" style={{ color: '#DC2626' }}><Trash2 size={14} /></button>
                </div>
              ) : (
                <div className="flex gap-2 mt-1">
                  <input type="password" value={newSecret} onChange={e => setNewSecret(e.target.value)} placeholder={item ? 'New password' : 'Password'} className="wl-input flex-1" style={FIELD} autoComplete="new-password" />
                  <button onClick={saveSecret} disabled={vaultBusy || !newSecret} className="wl-btn wl-btn-primary" style={{ height: 42 }}>{vaultBusy ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />}Save</button>
                  {item && <button onClick={() => { setChanging(false); setNewSecret('') }} className="wl-btn" style={{ height: 42 }}>Cancel</button>}
                </div>
              )}
              <div className="flex items-start gap-1.5 text-[11.5px] leading-snug mt-2" style={{ color: 'var(--text4)' }}>
                <ShieldCheck size={13} className="flex-shrink-0 mt-px" />
                Encrypted on your device (AES-256) with your vault passphrase; only scrambled text is stored. Shown for 30 seconds; the vault locks after 5 minutes.
              </div>
              {key && <div className="flex items-start gap-1.5 text-[11.5px] leading-snug mt-1" style={{ color: '#B96A0B' }}><AlertTriangle size={13} className="flex-shrink-0 mt-px" />Lock the vault on shared devices.</div>}
            </section>
          )}
        </div>
      </div>
    </div>
  )
}
