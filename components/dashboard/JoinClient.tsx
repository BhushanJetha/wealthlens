'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { Loader2 } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { toast } from '@/components/ui/toaster'

export const SHARED_TEXT = 'expenses, income, accounts and balances, cards, investments, loans, budgets, goals and reports'
export const PRIVATE_TEXT = 'password vault, saved bank details and AI chats'

const STOPPED: Record<string, string> = {
  not_found: 'This invite link isn’t valid. Ask for a new one.',
  used: 'This invite has already been used. Ask for a new one.',
  expired: 'This invite has ended. Invites last 7 days, so ask for a new one.',
  own: 'This is your own invite. Send the link to the person you’re inviting.',
  in_family: 'You’re already in a family. Leave it in Settings before joining another.',
  has_members: 'You have family members of your own, so you can’t join someone else’s family. Remove them in Settings first.',
}

// Nothing is shared until this person has read what's shared and agreed
export default function JoinClient({ code, email, state, ownerName }: { code: string; email: string | null; state: string; ownerName: string | null }) {
  const router = useRouter()
  const [busy, setBusy] = useState(false)
  const [outcome, setOutcome] = useState(state)
  const who = ownerName ?? 'Someone'

  async function join() {
    setBusy(true)
    const { data, error } = await createClient().rpc('accept_family_invite', { code })
    setBusy(false)
    if (error) { toast(error.message, 'error'); return }
    if (data !== 'joined') { setOutcome(String(data)); return }
    toast(`You’re in ${who}’s family`)
    window.location.assign('/dashboard')
  }

  return (
    <div className="min-h-screen flex items-center justify-center px-4 py-8" style={{ background: 'var(--canvas)' }}>
      <div className="w-full max-w-[440px] flex flex-col gap-3.5">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/icon-192.png" alt="" width={56} height={56} className="rounded-2xl" />
        {outcome !== 'valid' ? (
          <div className="wl-card px-5 py-5">
            <h1 className="text-[20px] font-bold" style={{ color: 'var(--text)' }}>This invite can’t be used</h1>
            <p className="text-[14px] mt-2 leading-[1.5]" style={{ color: 'var(--text2)' }}>{STOPPED[outcome] ?? STOPPED.not_found}</p>
            <Link href="/dashboard" className="wl-btn mt-4 inline-flex" style={{ height: 44 }}>Go to WealthLens</Link>
          </div>
        ) : (
          <>
            <div>
              <h1 className="text-[24px] font-bold leading-[1.25]" style={{ color: 'var(--text)' }}>{who} invited you to their family on WealthLens</h1>
              <p className="text-[14px] mt-2 leading-[1.5]" style={{ color: 'var(--text2)' }}>You keep your own private login and every feature, for your own money.</p>
            </div>
            <div className="wl-card px-4 py-4 text-[13.5px] leading-[1.5]" style={{ color: 'var(--text2)' }}>
              <div className="font-bold" style={{ color: '#7A4A06' }}>{who} will be able to see</div>
              <p className="mt-1">Your {SHARED_TEXT}.</p>
              <div className="font-bold mt-3" style={{ color: '#14603F' }}>Staying private to you</div>
              <p className="mt-1">Your {PRIVATE_TEXT}.</p>
              <div className="font-bold mt-3" style={{ color: 'var(--text)' }}>You won’t see {who}’s data</div>
              <p className="mt-1">{who} can only view your entries, not change them. You can leave the family any time in Settings, and that ends the access straight away.</p>
            </div>
            <button onClick={join} disabled={busy} className="wl-btn wl-btn-primary justify-center" style={{ height: 48, fontSize: 15 }}>
              {busy && <Loader2 size={16} className="animate-spin" />}I agree, join the family
            </button>
            <button onClick={() => router.push('/dashboard')} disabled={busy} className="wl-btn justify-center" style={{ height: 48, fontSize: 15 }}>No thanks</button>
            {email && <p className="text-center text-[12px]" style={{ color: 'var(--text3)' }}>Signed in as {email}</p>}
          </>
        )}
      </div>
    </div>
  )
}
