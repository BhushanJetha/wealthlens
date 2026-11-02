'use client'
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Loader2, Copy, Check, MessageCircle } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { toast } from '@/components/ui/toaster'
import { PageHeader } from '@/components/ui/kit'
import { localToday, fmtDay } from '@/lib/insights'
import { SHARED_TEXT, PRIVATE_TEXT } from './JoinClient'
import { setFamilyMode } from '@/components/layout/FamilyBar'

const daysLeft = (iso: string) => Math.max(0, Math.ceil((Date.parse(iso) - Date.now()) / 864e5))

export default function FamilyClient({ familyOn = false, ready, viewing, joined, ownerName, links }: { familyOn?: boolean; ready: boolean; viewing: boolean; joined: any | null; ownerName: string | null; links: any[] }) {
  const router = useRouter()
  const supabase = createClient()
  const [name, setName] = useState('')
  const [busy, setBusy] = useState<string | null>(null)
  const [fresh, setFresh] = useState<string | null>(null)
  const [copied, setCopied] = useState<string | null>(null)
  const [origin, setOrigin] = useState('')
  const [confirmLeave, setConfirmLeave] = useState(false)
  useEffect(() => setOrigin(window.location.origin), [])
  const today = localToday()

  const linkFor = (code: string) => `${origin}/join/${code}`
  const message = (code: string) => `I’d like to add you to my family on WealthLens. You’ll have your own private login. I’ll be able to see your expenses and investments, and you won’t see mine. The screen explains it before you agree: ${linkFor(code)}`

  async function invite() {
    const n = name.trim()
    if (!n) { toast('Add their name first.', 'error'); return }
    setBusy('invite')
    const { data: { user } } = await supabase.auth.getUser()
    const { data, error } = user ? await supabase.from('family_links').insert({ owner_id: user.id, name: n }).select('invite_code').single() : { data: null, error: { message: 'Please sign in again.' } }
    setBusy(null)
    if (error || !data) { toast(error?.message ?? 'Couldn’t create the invite.', 'error'); return }
    setFresh(data.invite_code); setName(''); router.refresh()
  }
  async function copy(code: string) {
    await navigator.clipboard.writeText(linkFor(code))
    setCopied(code); setTimeout(() => setCopied(null), 2000)
  }
  async function cancel(l: any) {
    setBusy(l.id)
    const { error } = await supabase.from('family_links').delete().eq('id', l.id)
    setBusy(null)
    if (error) toast(error.message, 'error'); else router.refresh()
  }
  async function remove(l: any) {
    setBusy(l.id)
    const { error } = await supabase.rpc('remove_family_member', { link: l.id })
    setBusy(null)
    if (error) toast(error.message, 'error'); else { toast(`${l.name} removed. They keep their account and data.`); router.refresh() }
  }
  async function leave() {
    setBusy('leave')
    const { error } = await supabase.rpc('leave_family')
    setBusy(null)
    if (error) toast(error.message, 'error'); else { toast('You left the family. Your data stays yours.'); router.refresh() }
  }

  const frame = (children: React.ReactNode) => (
    <div className="flex flex-col gap-3.5 md:gap-[18px] animate-fade-up max-w-[680px]">
      <PageHeader title="Family" sub="Each person has their own private login. You view your members’ money; they don’t see yours." />
      {children}
    </div>
  )
  if (!ready) return frame(<div className="wl-card px-5 py-5 text-[13.5px]" style={{ color: 'var(--text2)' }}>Family sharing needs migration 038 (supabase/migrations/038_family_sharing.sql). Run it in Supabase, then refresh.</div>)
  if (viewing) return frame(<div className="wl-card px-5 py-5 text-[13.5px]" style={{ color: 'var(--text2)' }}>Switch back to <b>Me</b> at the top of the page to manage your family.</div>)

  // ── A member ──
  if (joined) return frame(<>
    <section className="wl-card px-4 md:px-5 py-4 text-[13.5px] leading-[1.5]" style={{ color: 'var(--text2)' }}>
      <div className="text-[15px] font-semibold" style={{ color: 'var(--text)' }}>You’re in {ownerName ?? 'someone'}’s family</div>
      {joined.joined_at && <div className="text-[12px]" style={{ color: 'var(--text3)' }}>Since {fmtDay(String(joined.joined_at).slice(0, 10))}</div>}
      <p className="mt-3"><b style={{ color: 'var(--text)' }}>{ownerName ?? 'They'} can see</b> your {SHARED_TEXT}, but can’t add or change anything.</p>
      <p className="mt-2"><b style={{ color: 'var(--text)' }}>Private to you:</b> your {PRIVATE_TEXT}.</p>
    </section>
    <section className="wl-card px-4 md:px-5 py-4">
      <h2 className="text-[14px] font-semibold" style={{ color: 'var(--text)' }}>Leave the family</h2>
      <p className="text-[13px] mt-1 leading-[1.5]" style={{ color: 'var(--text2)' }}>Access ends straight away and {ownerName ?? 'they'} will see that you left. Your account and all your data stay yours.</p>
      {confirmLeave ? (
        <div className="flex gap-2 mt-3">
          <button onClick={() => setConfirmLeave(false)} disabled={!!busy} className="wl-btn flex-1 justify-center" style={{ height: 44 }}>Stay</button>
          <button onClick={leave} disabled={!!busy} className="wl-btn flex-1 justify-center" style={{ height: 44, background: '#DC2626', borderColor: '#DC2626', color: '#fff' }}>{busy && <Loader2 size={15} className="animate-spin" />}Yes, leave</button>
        </div>
      ) : (
        <button onClick={() => setConfirmLeave(true)} className="wl-btn w-full justify-center mt-3" style={{ height: 44, background: '#FEF2F2', borderColor: '#F3C9C9', color: '#B91C1C' }}>{ownerName ? `Leave ${ownerName}’s family` : 'Leave the family'}</button>
      )}
    </section>
  </>)

  // ── An owner ──
  const active = links.filter(l => l.status === 'active')
  const waiting = links.filter(l => l.status === 'invited' && l.expires_at > new Date().toISOString())
  const ended = links.filter(l => l.status === 'invited' && l.expires_at <= new Date().toISOString())
  const initial = (n: string) => n.trim().charAt(0).toUpperCase()
  return frame(<>
    {active.length > 0 && (
      <label className="wl-card px-4 md:px-5 py-4 flex items-center gap-3 cursor-pointer">
        <span className="flex-1 min-w-0">
          <span className="block text-[14px] font-semibold" style={{ color: 'var(--text)' }}>Family view</span>
          <span className="block text-[12.5px] mt-0.5" style={{ color: 'var(--text3)' }}>{familyOn ? 'On: the Me, member and Whole family switcher shows at the top of every page.' : 'Off: nothing extra on your screens. Turn it on to see your family’s money.'}</span>
        </span>
        <input type="checkbox" role="switch" checked={familyOn} onChange={e => setFamilyMode(e.target.checked)} aria-label="Family view" className="sr-only peer" />
        <span aria-hidden="true" className="relative w-12 h-7 rounded-full flex-shrink-0 transition-colors peer-focus-visible:ring-2 peer-focus-visible:ring-offset-2" style={{ background: familyOn ? 'var(--accent)' : '#CBD5E1' }}>
          <span className="absolute top-[3px] w-[22px] h-[22px] rounded-full bg-white transition-all" style={{ left: familyOn ? 23 : 3, boxShadow: '0 1px 3px rgba(0,0,0,.25)' }} />
        </span>
      </label>
    )}
    {(active.length > 0 || waiting.length > 0 || ended.length > 0) && (
      <section className="wl-card px-4 md:px-5 py-4">
        <h2 className="text-[14px] font-semibold" style={{ color: 'var(--text)' }}>Members</h2>
        {active.map(l => (
          <div key={l.id} className="flex items-center gap-3 py-2.5 mt-1" style={{ borderTop: '1px solid #F1F5F9' }}>
            <span className="w-[38px] h-[38px] rounded-full flex items-center justify-center text-white font-bold flex-shrink-0" style={{ background: '#6A55E8' }}>{initial(l.name)}</span>
            <span className="flex-1 min-w-0"><span className="block text-[14px] font-semibold truncate" style={{ color: 'var(--text)' }}>{l.name}</span>
              <span className="block text-[12px]" style={{ color: 'var(--text3)' }}>Joined {l.joined_at ? fmtDay(String(l.joined_at).slice(0, 10)) : today}</span></span>
            <button onClick={() => remove(l)} disabled={busy === l.id} className="wl-btn" style={{ height: 44, color: '#B91C1C' }}>Remove</button>
          </div>
        ))}
        {waiting.map(l => (
          <div key={l.id} className="py-2.5" style={{ borderTop: '1px solid #F1F5F9' }}>
            <div className="flex items-center gap-3">
              <span className="w-[38px] h-[38px] rounded-full flex items-center justify-center font-bold flex-shrink-0" style={{ background: '#E8EAF0', color: '#475569' }}>{initial(l.name)}</span>
              <span className="flex-1 min-w-0"><span className="block text-[14px] font-semibold truncate" style={{ color: 'var(--text)' }}>{l.name}</span>
                <span className="block text-[12px]" style={{ color: '#8A5A12' }}>Invite waiting · ends in {daysLeft(l.expires_at)} day{daysLeft(l.expires_at) === 1 ? '' : 's'}</span></span>
              <button onClick={() => cancel(l)} disabled={busy === l.id} className="wl-btn" style={{ height: 44 }}>Cancel</button>
            </div>
            <ShareRow code={l.invite_code} link={linkFor(l.invite_code)} message={message(l.invite_code)} copied={copied === l.invite_code} onCopy={() => copy(l.invite_code)} open={fresh === l.invite_code} />
          </div>
        ))}
        {ended.map(l => (
          <div key={l.id} className="flex items-center gap-3 py-2.5" style={{ borderTop: '1px solid #F1F5F9' }}>
            <span className="flex-1 min-w-0 text-[13px]" style={{ color: 'var(--text3)' }}>{l.name}: invite ended</span>
            <button onClick={() => cancel(l)} disabled={busy === l.id} className="wl-btn" style={{ height: 44 }}>Clear</button>
          </div>
        ))}
      </section>
    )}
    <section className="wl-card px-4 md:px-5 py-4 flex flex-col gap-2.5">
      <h2 className="text-[14px] font-semibold" style={{ color: 'var(--text)' }}>Invite someone</h2>
      <label className="block"><span className="block text-[12px] font-semibold mb-1" style={{ color: 'var(--text2)' }}>Their name</span>
        <input value={name} onChange={e => setName(e.target.value)} maxLength={40} placeholder="e.g. Neha" className="wl-input w-full" style={{ height: 44 }} /></label>
      <button onClick={invite} disabled={busy === 'invite'} className="wl-btn wl-btn-primary justify-center" style={{ height: 44 }}>{busy === 'invite' && <Loader2 size={15} className="animate-spin" />}Create invite link</button>
      <p className="text-[12px]" style={{ color: 'var(--text3)' }}>The link works once and ends in 7 days. Nothing is shared until they read what’s shared and agree.</p>
    </section>
    <section className="rounded-[18px] px-4 md:px-5 py-4 text-[12.5px] leading-[1.5]" style={{ background: '#F0EDFF', border: '1px solid #DAD3FF', color: 'var(--text2)' }}>
      <div className="text-[13.5px] font-semibold mb-1" style={{ color: 'var(--text)' }}>What sharing means</div>
      You can view each member’s {SHARED_TEXT}. They can’t see yours. Their {PRIVATE_TEXT} stay private. You can’t change their entries.
    </section>
  </>)
}

function ShareRow({ link, message, copied, onCopy, open }: { code: string; link: string; message: string; copied: boolean; onCopy: () => void; open: boolean }) {
  return (
    <div className="mt-2.5 flex flex-col gap-2" style={{ outline: open ? '2px solid transparent' : undefined }}>
      <div className="rounded-[11px] px-3 py-2.5 text-[12.5px] break-all" style={{ background: 'var(--bg2)', border: '1px solid var(--line)', color: 'var(--text2)' }}>{link}</div>
      <div className="grid grid-cols-2 gap-2">
        <a href={`https://wa.me/?text=${encodeURIComponent(message)}`} target="_blank" rel="noopener noreferrer" className="wl-btn wl-btn-primary justify-center" style={{ height: 44 }}><MessageCircle size={15} />WhatsApp</a>
        <button onClick={onCopy} className="wl-btn justify-center" style={{ height: 44 }}>{copied ? <Check size={15} /> : <Copy size={15} />}{copied ? 'Copied' : 'Copy link'}</button>
      </div>
    </div>
  )
}
