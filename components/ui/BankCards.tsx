'use client'
/* eslint-disable @next/next/no-img-element */
import { useState } from 'react'
import { Nfc, Wallet } from 'lucide-react'
import { brandOf, networkOf, isPremium, type Brand, type Network } from '@/lib/banks'

// The bank's logo on a white tile; the bank's initials when there's no logo
export function BankLogo({ brand, size = 30 }: { brand: Brand; size?: number }) {
  const [failed, setFailed] = useState(false)
  const initials = brand.label.split(/\s+/).map(w => w[0]).join('').slice(0, 3).toUpperCase()
  return (
    <span className="rounded-[9px] bg-white flex items-center justify-center overflow-hidden flex-shrink-0 shadow-sm" style={{ width: size, height: size }}>
      {brand.domain && !failed
        ? <img src={`/api/bank-logo?d=${brand.domain}`} alt="" width={Math.round(size * 0.72)} height={Math.round(size * 0.72)} onError={() => setFailed(true)} style={{ objectFit: 'contain' }} />
        : <span style={{ color: brand.c1, fontWeight: 800, fontSize: Math.round(size * 0.36), letterSpacing: '-0.02em' }}>{initials}</span>}
    </span>
  )
}

function NetworkMark({ n }: { n: Network }) {
  if (n === 'visa') return <span className="text-[19px] font-black italic tracking-tight leading-none" style={{ fontFamily: 'Arial, sans-serif' }}>VISA</span>
  if (n === 'mastercard') return (
    <span className="flex items-center" aria-label="Mastercard">
      <i className="w-[22px] h-[22px] rounded-full" style={{ background: '#EB001B' }} />
      <i className="w-[22px] h-[22px] rounded-full -ml-[9px]" style={{ background: '#F79E1B', mixBlendMode: 'screen' }} />
    </span>
  )
  if (n === 'amex') return <span className="px-1.5 py-0.5 rounded text-[9px] font-black tracking-wider leading-tight text-center" style={{ border: '1.5px solid rgba(255,255,255,.85)' }}>AMERICAN<br />EXPRESS</span>
  if (n === 'rupay') return <span className="text-[15px] font-black italic">Ru<span style={{ color: '#F7941D' }}>Pay</span></span>
  if (n === 'diners') return <span className="text-[11px] font-bold">Diners Club</span>
  return null
}

const surface = (brand: Brand, premium: boolean) => premium
  ? `radial-gradient(120% 90% at 100% 0%, ${brand.c1}66 0%, transparent 55%), linear-gradient(135deg, #191922 0%, #2C2C38 55%, #121218 100%)`
  : `radial-gradient(120% 90% at 100% 0%, rgba(255,255,255,.18) 0%, transparent 55%), linear-gradient(135deg, ${brand.c1} 0%, ${brand.c2} 100%)`

const Chip = () => (
  <span className="relative w-[38px] h-[28px] rounded-[6px] overflow-hidden" style={{ background: 'linear-gradient(135deg, #F3D98B 0%, #C9A04A 55%, #E8C873 100%)' }} aria-hidden>
    <i className="absolute inset-x-0 top-1/2 h-px" style={{ background: 'rgba(120,85,20,.45)' }} />
    <i className="absolute inset-y-0 left-1/3 w-px" style={{ background: 'rgba(120,85,20,.45)' }} />
    <i className="absolute inset-y-0 right-1/3 w-px" style={{ background: 'rgba(120,85,20,.45)' }} />
  </span>
)

// A credit card drawn in its bank's colours (dark "metal" for premium cards)
export function CreditCardFace({ card, details, className = '' }: { card: any; details?: any; className?: string }) {
  const brand = brandOf(card.bank_name, card.name)
  const premium = isPremium(card.name)
  const network = networkOf(details?.card_network, card.name, card.bank_name)
  const last4 = details?.account_number ? String(details.account_number).replace(/\D/g, '').slice(-4) : card.last_four
  const product = String(card.name ?? '').replace(new RegExp(brand.label, 'i'), '').replace(/^[\s–-]+/, '').trim() || card.name
  return (
    <div className={`relative w-full aspect-[1.586] rounded-[18px] overflow-hidden text-white select-none ${className}`}
      style={{ background: surface(brand, premium), boxShadow: '0 14px 30px rgba(15,23,42,.22), inset 0 1px 0 rgba(255,255,255,.12)' }}
      role="img" aria-label={`${card.name} card${last4 ? ` ending ${last4}` : ''}`}>
      <div className="absolute inset-0 p-[6%] flex flex-col">
        <div className="flex items-center justify-between gap-2">
          <span className="flex items-center gap-2 min-w-0">
            <BankLogo brand={brand} size={30} />
            <span className="text-[13px] font-bold truncate drop-shadow-sm">{brand.label}</span>
          </span>
          <span className="text-[10px] font-semibold uppercase tracking-[0.12em] opacity-80">{premium ? 'Premium' : 'Credit'}</span>
        </div>
        <div className="flex items-center gap-2.5 mt-[7%]">
          <Chip />
          <Nfc size={20} className="opacity-75" />
        </div>
        <div className="mt-auto text-[15px] md:text-[16px] tracking-[0.16em] tabular-nums font-medium opacity-95">
          •••• •••• •••• {last4 || '••••'}
        </div>
        <div className="flex items-end justify-between gap-2 mt-2">
          <div className="min-w-0">
            <div className="text-[9.5px] uppercase tracking-[0.12em] opacity-70">{details?.holder_name ? 'Card holder' : 'Card'}</div>
            <div className="text-[12px] font-semibold uppercase tracking-[0.06em] truncate">{details?.holder_name || product}</div>
          </div>
          <NetworkMark n={network} />
        </div>
      </div>
    </div>
  )
}

const TYPE_LABEL: Record<string, string> = { savings: 'Savings', current: 'Current', wallet: 'Cash', nol: 'Nol card', salary: 'Salary' }

// A bank account as a card: bank colours and logo, type, masked number, balance
export function AccountCardFace({ account, details, balance, sub, className = '' }: {
  account: any; details?: any; balance: string; sub?: string; className?: string
}) {
  const isCash = account.account_type === 'wallet'
  const brand: Brand = isCash ? { key: 'cash', label: 'Cash', domain: null, c1: '#1E8F5F', c2: '#0B4A30' } : brandOf(account.bank_name, account.name)
  const kind = /\bnre\b/i.test(account.name ?? '') ? 'NRE' : /\bnro\b/i.test(account.name ?? '') ? 'NRO' : TYPE_LABEL[account.account_type] ?? 'Account'
  const last4 = details?.account_number ? String(details.account_number).replace(/\s/g, '').slice(-4) : account.last_four
  return (
    <div className={`relative w-full aspect-[1.7] rounded-[18px] overflow-hidden text-white select-none ${className}`}
      style={{ background: surface(brand, false), boxShadow: '0 14px 30px rgba(15,23,42,.18), inset 0 1px 0 rgba(255,255,255,.12)' }}
      role="img" aria-label={`${account.name}, ${kind}, balance ${balance}`}>
      <div className="absolute inset-0 p-[6%] flex flex-col">
        <div className="flex items-center justify-between gap-2">
          <span className="flex items-center gap-2 min-w-0">
            {isCash ? <span className="w-[30px] h-[30px] rounded-[9px] bg-white flex items-center justify-center" style={{ color: brand.c1 }}><Wallet size={16} /></span> : <BankLogo brand={brand} size={30} />}
            <span className="text-[13px] font-bold truncate drop-shadow-sm">{isCash ? 'Cash wallet' : brand.label}</span>
          </span>
          <span className="rounded-full px-2 py-0.5 text-[10.5px] font-semibold" style={{ background: 'rgba(255,255,255,.18)' }}>{kind}</span>
        </div>
        <div className="mt-[6%] text-[14.5px] font-semibold truncate">{account.name}</div>
        <div className="text-[12px] tracking-[0.14em] tabular-nums opacity-80">{isCash ? (account.currency === 'AED' ? 'UAE · AED' : 'India · INR') : `•••• ${last4 || '••••'}`}</div>
        <div className="mt-auto flex items-end justify-between gap-2">
          <div className="min-w-0">
            <div className="text-[10px] uppercase tracking-[0.12em] opacity-70">Balance</div>
            <div className="text-[22px] md:text-[24px] font-bold tabular-nums leading-tight truncate">{balance}</div>
          </div>
          {sub && <div className="text-[11px] opacity-80 text-right flex-shrink-0">{sub}</div>}
        </div>
      </div>
    </div>
  )
}
