'use client'
import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import { isMissingTable } from '@/lib/supabase/missingTable'
import { useViewStore } from '@/store/viewStore'
import { handwritten } from '@/lib/fonts'
import { fmtMoney, type Cur } from '@/lib/freedom'
import { QUOTES, TIP_LISTS, TOPICS, type Quote, type TipList, type Topic } from '@/lib/inspiration'
import {
  Heart, Plus, Shuffle, X, Trash2, ExternalLink, Copy, Check, Loader2,
  PiggyBank, TrendingUp, BookOpen, Sprout, Sun, ImageOff, Sparkles, ArrowRight,
} from 'lucide-react'

// ─── Helpers ──────────────────────────────────────────────────────────────────
function seeded(seed: number) {
  return () => {
    seed = (seed + 0x6D2B79F5) | 0
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}
const dayNumber = () => Math.floor(Date.now() / 86400000)
// Future value of a monthly SIP
const sipFV = (monthly: number, annual: number, years: number) => {
  const r = annual / 12, n = years * 12
  return monthly * ((Math.pow(1 + r, n) - 1) / r) * (1 + r)
}
const topicMeta = (t: Topic) => TOPICS.find(x => x.key === t)!
const SAVED_KEY = 'wl-mindset-saved'

// ─── Decorations ──────────────────────────────────────────────────────────────
const Swoosh = ({ color }: { color: string }) => (
  <svg viewBox="0 0 200 16" className="mx-auto mt-1.5 w-28 h-3" aria-hidden><path d="M4 11 C 50 2, 120 2, 196 9" stroke={color} strokeWidth="3" fill="none" strokeLinecap="round" /></svg>
)
function Doodle({ kind, color }: { kind: number; color: string }) {
  if (kind === 0) return ( // crown
    <svg viewBox="0 0 40 24" className="mx-auto mb-2 w-9 h-6" aria-hidden><path d="M3 20 L6 6 L14 14 L20 3 L26 14 L34 6 L37 20 Z" stroke={color} strokeWidth="2.2" fill="none" strokeLinejoin="round" /></svg>
  )
  if (kind === 1) return <Sparkles size={22} className="mx-auto mb-2" style={{ color }} aria-hidden />
  return <Heart size={20} className="mx-auto mb-2" style={{ color }} aria-hidden />
}
function TopicTag({ topic, light = false }: { topic: Topic; light?: boolean }) {
  const t = topicMeta(topic)
  return (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold"
      style={{ background: light ? 'rgba(255,255,255,0.7)' : 'var(--bg2)', color: 'var(--text2)' }}>
      {t.emoji} {t.label}
    </span>
  )
}

// ─── Pin shell (hover actions) ────────────────────────────────────────────────
function Pin({ children, saved, onSave, extra }: { children: React.ReactNode; saved: boolean; onSave: () => void; extra?: React.ReactNode }) {
  return (
    <div className="group relative mb-4 break-inside-avoid rounded-2xl overflow-hidden transition-shadow hover:shadow-xl"
      style={{ boxShadow: '0 1px 3px rgba(0,0,0,0.08)', border: '1px solid var(--border)' }}>
      {children}
      <div className="absolute top-2 right-2 flex gap-1.5 transition-opacity sm:opacity-0 sm:group-hover:opacity-100"
        style={saved ? { opacity: 1 } : undefined}>
        {extra}
        <button onClick={onSave} aria-label={saved ? 'Remove from saved' : 'Save'}
          className="w-8 h-8 rounded-full flex items-center justify-center shadow" style={{ background: 'rgba(255,255,255,0.92)' }}>
          <Heart size={14} fill={saved ? '#E11D48' : 'none'} color={saved ? '#E11D48' : '#374151'} />
        </button>
      </div>
    </div>
  )
}
function RoundBtn({ onClick, label, children }: { onClick: () => void; label: string; children: React.ReactNode }) {
  return (
    <button onClick={onClick} aria-label={label} title={label}
      className="w-8 h-8 rounded-full flex items-center justify-center shadow" style={{ background: 'rgba(255,255,255,0.92)', color: '#374151' }}>
      {children}
    </button>
  )
}
function CopyBtn({ text }: { text: string }) {
  const [ok, setOk] = useState(false)
  return (
    <RoundBtn label="Copy quote" onClick={async () => {
      try { await navigator.clipboard.writeText(text); setOk(true); setTimeout(() => setOk(false), 1500) } catch {}
    }}>
      {ok ? <Check size={14} color="#16A34A" /> : <Copy size={13} />}
    </RoundBtn>
  )
}

// ─── Quote cards ──────────────────────────────────────────────────────────────
const PALETTES = [
  { bg: 'linear-gradient(165deg,#FEF3C7 0%,#FBCFE8 55%,#DDD6FE 100%)', ink: '#3B0764', accent: '#DB2777' },
  { bg: 'linear-gradient(180deg,#BFDBFE 0%,#E0F2FE 45%,#FEF9C3 100%)', ink: '#0C4A6E', accent: '#0284C7' },
  { bg: 'linear-gradient(165deg,#D1FAE5 0%,#F0FDF4 50%,#ECFCCB 100%)', ink: '#14532D', accent: '#16A34A' },
  { bg: 'linear-gradient(165deg,#FFEDD5 0%,#FFE4E6 100%)',              ink: '#7C2D12', accent: '#EA580C' },
  { bg: 'linear-gradient(165deg,#E0E7FF 0%,#FAE8FF 100%)',              ink: '#312E81', accent: '#7C3AED' },
]
const VARIANTS = ['gradient', 'notebook', 'gradient', 'sticky', 'minimal', 'gradient'] as const

export function QuoteCard({ q, i }: { q: Quote; i: number }) {
  const variant = VARIANTS[i % VARIANTS.length]
  const p = PALETTES[i % PALETTES.length]
  const size = q.text.length < 50 ? 34 : q.text.length < 90 ? 28 : 24
  const hand = handwritten.className

  if (variant === 'notebook') return (
    <div className="relative pl-12 pr-6 pt-[54px] pb-6"
      style={{ background: '#FFFDF5', backgroundImage: 'repeating-linear-gradient(to bottom, transparent 0, transparent 31px, #DBEAFE 31px, #DBEAFE 32px)', backgroundPosition: '0 22px' }}>
      <div className="absolute left-8 top-0 bottom-0 w-px" style={{ background: '#FCA5A5' }} />
      <p className={hand} style={{ color: '#1E3A8A', fontSize: 26, lineHeight: '32px', fontWeight: 700 }}>{q.text}</p>
      {q.author && <p className={hand} style={{ color: '#475569', fontSize: 20, lineHeight: '32px' }}>— {q.author}</p>}
      <div className="mt-2"><TopicTag topic={q.topic} /></div>
    </div>
  )
  if (variant === 'sticky') return (
    <div className="px-5 pt-7 pb-6" style={{ background: '#F8FAFC' }}>
      <div className="relative px-5 pt-7 pb-5 shadow-md" style={{ background: '#FEF08A', transform: `rotate(${i % 2 ? 1.5 : -1.5}deg)` }}>
        <div className="absolute -top-2.5 left-1/2 -translate-x-1/2 w-20 h-5 rotate-[-3deg]" style={{ background: 'rgba(255,255,255,0.65)', boxShadow: '0 1px 2px rgba(0,0,0,0.08)' }} />
        <p className={hand} style={{ color: '#3F3F46', fontSize: size - 4, lineHeight: 1.15, fontWeight: 700 }}>{q.text}</p>
        {q.author && <p className={`${hand} mt-2 text-right`} style={{ color: '#52525B', fontSize: 19 }}>— {q.author}</p>}
      </div>
      <div className="mt-4"><TopicTag topic={q.topic} /></div>
    </div>
  )
  if (variant === 'minimal') return (
    <div className="px-6 pt-8 pb-6" style={{ background: '#fff' }}>
      <div className="text-[64px] leading-[0.6] font-black" style={{ color: p.accent, fontFamily: 'Georgia, serif' }}>“</div>
      <p className="text-[17px] font-semibold leading-snug mt-2" style={{ color: 'var(--text)' }}>{q.text}</p>
      {q.author && <p className="text-[11px] font-bold uppercase tracking-[0.16em] mt-3" style={{ color: p.accent }}>{q.author}</p>}
      <div className="mt-4"><TopicTag topic={q.topic} /></div>
    </div>
  )
  return (
    <div className="px-6 pt-10 pb-6 text-center" style={{ background: p.bg, minHeight: q.text.length < 60 ? 250 : 210 }}>
      <Doodle kind={i % 3} color={p.accent} />
      <p className={hand} style={{ color: p.ink, fontSize: size, lineHeight: 1.12, fontWeight: 700 }}>{q.text}</p>
      <Swoosh color={p.accent} />
      {q.author && <div className="mt-2 text-[10px] font-bold uppercase tracking-[0.18em]" style={{ color: p.ink, opacity: 0.7 }}>— {q.author}</div>}
      <div className="mt-4"><TopicTag topic={q.topic} light /></div>
    </div>
  )
}

// ─── Infographic cards ────────────────────────────────────────────────────────
function TipListCard({ t }: { t: TipList }) {
  return (
    <div style={{ background: '#fff' }}>
      <div className="px-5 pt-6 pb-3 pr-14" style={{ background: `${t.accent}12` }}>
        <div className={handwritten.className} style={{ fontSize: 30, color: t.accent, lineHeight: 1.05, fontWeight: 700 }}>{t.title}</div>
      </div>
      <ol className="px-4 py-3.5 space-y-2.5">
        {t.items.map((it, k) => (
          <li key={it.title} className="flex items-start gap-3">
            <span className="w-6 h-6 rounded-full text-white text-[11px] font-black flex items-center justify-center shrink-0 mt-0.5" style={{ background: t.accent }}>
              {t.check ? '✓' : k + 1}
            </span>
            <div className="flex-1 min-w-0">
              <div className="text-[12.5px] font-bold leading-tight" style={{ color: 'var(--text)' }}>{it.title}</div>
              <div className="text-[11px] leading-snug" style={{ color: 'var(--text3)' }}>{it.desc}</div>
            </div>
            <span className="text-[22px] leading-none" aria-hidden>{it.emoji}</span>
          </li>
        ))}
      </ol>
      {t.footer && (
        <div className="px-5 py-3 text-[12px] font-semibold" style={{ background: `${t.accent}0D`, color: t.accent, borderTop: `1px dashed ${t.accent}40` }}>{t.footer}</div>
      )}
      <div className="px-5 pb-4 pt-1"><TopicTag topic={t.topic} /></div>
    </div>
  )
}

const SIGNS = [
  { label: 'Save', icon: PiggyBank, bg: '#F9A8D4' },
  { label: 'Invest', icon: TrendingUp, bg: '#FCD34D' },
  { label: 'Learn', icon: BookOpen, bg: '#86EFAC' },
  { label: 'Grow', icon: Sprout, bg: '#93C5FD' },
  { label: 'Be Patient', icon: Heart, bg: '#C4B5FD' },
  { label: 'Build Your Future', icon: Sun, bg: '#FDE68A' },
]
export function SignpostCard() {
  const hand = handwritten.className
  return (
    <div className="relative px-5 pt-9 overflow-hidden" style={{ background: 'linear-gradient(180deg,#BFDBFE 0%,#FCE7F3 42%,#FDBA74 78%,#FCD34D 100%)' }}>
      <div className="text-center">
        <div className={hand} style={{ fontSize: 42, color: '#14532D', lineHeight: 0.95, fontWeight: 700 }}>Financial<br />Freedom</div>
        <div className={hand} style={{ fontSize: 24, color: '#14532D', lineHeight: 1.1, marginTop: 6 }}>
          is a <span style={{ background: 'rgba(244,114,182,0.45)', padding: '0 4px' }}>process</span>,<br />not a destination.
        </div>
      </div>
      <div className="relative mt-5 pb-16 pl-4">
        <div className="absolute left-8 top-0 bottom-6 w-3 rounded-sm" style={{ background: '#A16207' }} />
        {SIGNS.map((s, k) => (
          <div key={s.label} className="relative z-10 flex items-center gap-2 h-10 pl-4 pr-9 mb-2.5 w-fit shadow-sm"
            style={{ background: s.bg, clipPath: 'polygon(0 0, calc(100% - 18px) 0, 100% 50%, calc(100% - 18px) 100%, 0 100%)', transform: `rotate(${k % 2 ? 1.5 : -1.5}deg)` }}>
            <span className={hand} style={{ fontSize: 23, color: '#1F2937', fontWeight: 700 }}>{s.label}</span>
            <s.icon size={15} color="#1F2937" />
          </div>
        ))}
      </div>
      <svg viewBox="0 0 300 60" preserveAspectRatio="none" className="absolute bottom-0 left-0 w-full h-14" aria-hidden>
        <path d="M0 40 C 60 10, 120 50, 180 28 S 270 20, 300 32 L300 60 L0 60 Z" fill="#4ADE80" opacity="0.8" />
        <path d="M0 50 C 80 30, 160 60, 300 42 L300 60 L0 60 Z" fill="#16A34A" opacity="0.85" />
      </svg>
    </div>
  )
}

const STAIRS = [
  { label: 'Savings', sub: 'any time', h: 26, c: '#BFDBFE' },
  { label: 'RD', sub: '1–3 yrs', h: 40, c: '#A5F3FC' },
  { label: 'FD', sub: '1–5 yrs', h: 54, c: '#99F6E4' },
  { label: 'Bonds', sub: '3–7 yrs', h: 68, c: '#BBF7D0' },
  { label: 'Mutual Funds', sub: '5+ yrs', h: 84, c: '#FDE68A' },
  { label: 'Stocks', sub: '7+ yrs', h: 100, c: '#FECDD3' },
]
function StaircaseCard() {
  return (
    <div className="px-5 pt-6 pb-5" style={{ background: '#fff' }}>
      <div className={handwritten.className} style={{ fontSize: 30, color: '#0F766E', lineHeight: 1, fontWeight: 700 }}>The Investment Staircase</div>
      <p className="text-[11px] mt-1 mb-4" style={{ color: 'var(--text3)' }}>The further away your goal, the higher you can climb.</p>
      <div className="flex items-end gap-1.5 h-[150px]">
        {STAIRS.map(s => (
          <div key={s.label} className="flex-1 flex flex-col items-center justify-end h-full">
            <div className="text-[9px] font-bold text-center leading-tight mb-1" style={{ color: 'var(--text2)' }}>{s.label}</div>
            <div className="w-full rounded-t-md" style={{ height: `${s.h}%`, background: s.c, border: '1px solid rgba(0,0,0,0.06)' }} />
          </div>
        ))}
      </div>
      <div className="flex gap-1.5 mt-1">
        {STAIRS.map(s => <div key={s.label} className="flex-1 text-[8.5px] text-center" style={{ color: 'var(--text3)' }}>{s.sub}</div>)}
      </div>
      <div className="mt-3 h-1.5 rounded-full" style={{ background: 'linear-gradient(90deg,#60A5FA,#34D399,#FBBF24,#FB7185)' }} />
      <div className="flex justify-between text-[10px] font-semibold mt-1" style={{ color: 'var(--text3)' }}>
        <span>Lower risk · steady</span><span>Higher growth · more ups & downs</span>
      </div>
      <div className="mt-3"><TopicTag topic="investing" /></div>
    </div>
  )
}

function SplitCard({ cur }: { cur: Cur }) {
  const salary = cur === 'AED' ? 15000 : 100000
  const rows = [
    { label: 'Needs', pct: 50, c: '#60A5FA', eg: 'Rent, food, bills, EMIs' },
    { label: 'Wants', pct: 30, c: '#F472B6', eg: 'Dining out, shopping, trips' },
    { label: 'Save', pct: 20, c: '#34D399', eg: 'SIP, emergency fund, goals' },
  ]
  return (
    <div className="px-5 pt-6 pb-5" style={{ background: 'linear-gradient(180deg,#F0F9FF 0%,#fff 60%)' }}>
      <div className={handwritten.className} style={{ fontSize: 32, color: '#1D4ED8', lineHeight: 1, fontWeight: 700 }}>The 50 / 30 / 20 Rule</div>
      <p className="text-[11px] mt-1 mb-3" style={{ color: 'var(--text3)' }}>On a take-home of {fmtMoney(salary, cur)} a month:</p>
      <div className="flex h-4 rounded-full overflow-hidden mb-3">
        {rows.map(r => <div key={r.label} style={{ width: `${r.pct}%`, background: r.c }} />)}
      </div>
      <div className="space-y-2">
        {rows.map(r => (
          <div key={r.label} className="flex items-center gap-2.5">
            <span className="w-2.5 h-2.5 rounded-sm shrink-0" style={{ background: r.c }} />
            <div className="flex-1 min-w-0">
              <div className="text-[12px] font-bold" style={{ color: 'var(--text)' }}>{r.label} · {r.pct}%</div>
              <div className="text-[10.5px]" style={{ color: 'var(--text3)' }}>{r.eg}</div>
            </div>
            <span className="text-[12px] font-mono font-bold" style={{ color: 'var(--text)' }}>{fmtMoney(salary * r.pct / 100, cur)}</span>
          </div>
        ))}
      </div>
      <div className="mt-3"><TopicTag topic="saving" /></div>
    </div>
  )
}

function CompoundCard({ cur }: { cur: Cur }) {
  const monthly = cur === 'AED' ? 1000 : 5000
  const pts = [10, 20, 30].map(y => ({ y, v: sipFV(monthly, 0.12, y), put: monthly * 12 * y }))
  const max = pts[2].v
  return (
    <div className="px-5 pt-6 pb-5" style={{ background: 'linear-gradient(180deg,#ECFDF5 0%,#fff 70%)' }}>
      <div className={handwritten.className} style={{ fontSize: 32, color: '#047857', lineHeight: 1, fontWeight: 700 }}>The Magic of Compounding</div>
      <p className="text-[11px] mt-1 mb-4" style={{ color: 'var(--text3)' }}>{fmtMoney(monthly, cur)} a month in a SIP at 12% a year</p>
      <div className="flex items-end gap-4 h-[140px] px-2">
        {pts.map(p => (
          <div key={p.y} className="flex-1 flex flex-col items-center justify-end h-full">
            <div className="text-[11px] font-black font-mono mb-1" style={{ color: '#047857' }}>{fmtMoney(p.v, cur)}</div>
            <div className="w-full rounded-t-lg relative" style={{ height: `${Math.max(8, p.v / max * 100)}%`, background: 'linear-gradient(180deg,#34D399,#059669)' }}>
              <div className="absolute bottom-0 left-0 right-0 rounded-t" style={{ height: `${p.put / p.v * 100}%`, background: 'rgba(255,255,255,0.45)' }} />
            </div>
            <div className="text-[10px] font-bold mt-1" style={{ color: 'var(--text2)' }}>{p.y} yrs</div>
          </div>
        ))}
      </div>
      <p className="text-[11.5px] mt-3 font-semibold" style={{ color: 'var(--text2)' }}>
        You put in {fmtMoney(pts[2].put, cur)}. Time turns it into {fmtMoney(pts[2].v, cur)}.
      </p>
      <p className="text-[10px] mt-0.5" style={{ color: 'var(--text3)' }}>Light part of each bar = what you invested. Illustrative, not guaranteed.</p>
      <div className="mt-3"><TopicTag topic="investing" /></div>
    </div>
  )
}

function Rule72Card() {
  const rows = [{ k: 'Savings account', r: 3 }, { k: 'Fixed deposit', r: 7 }, { k: 'Equity mutual fund', r: 12 }]
  return (
    <div className="px-5 pt-7 pb-5 text-center" style={{ background: 'linear-gradient(165deg,#FEF9C3 0%,#FFEDD5 100%)' }}>
      <div className="text-[11px] font-bold uppercase tracking-[0.2em]" style={{ color: '#B45309' }}>The Rule of 72</div>
      <div className={handwritten.className} style={{ fontSize: 34, color: '#78350F', lineHeight: 1.05, fontWeight: 700, marginTop: 6 }}>72 ÷ return<br />= years to double</div>
      <div className="mt-4 space-y-1.5 text-left">
        {rows.map(x => (
          <div key={x.k} className="flex items-center justify-between rounded-lg px-3 py-2" style={{ background: 'rgba(255,255,255,0.7)' }}>
            <span className="text-[12px] font-semibold" style={{ color: 'var(--text2)' }}>{x.k} · {x.r}%</span>
            <span className="text-[12px] font-black font-mono" style={{ color: '#B45309' }}>{Math.round(72 / x.r)} yrs</span>
          </div>
        ))}
      </div>
      <div className="mt-4 text-left"><TopicTag topic="investing" light /></div>
    </div>
  )
}

function JarCard() {
  return (
    <div className="px-5 pt-6 pb-5" style={{ background: '#fff' }}>
      <div className="flex items-center gap-4">
        <svg viewBox="0 0 80 110" className="w-20 h-28 shrink-0" aria-hidden>
          <rect x="22" y="4" width="36" height="10" rx="3" fill="#A16207" />
          <path d="M18 16 h44 v6 c8 4 12 10 12 20 v52 c0 8 -6 12 -14 12 h-40 c-8 0 -14 -4 -14 -12 v-52 c0 -10 4 -16 12 -20 z" fill="#F0FDF4" stroke="#16A34A" strokeWidth="2.5" />
          <path d="M8 62 h64 v32 c0 8 -6 12 -14 12 h-36 c-8 0 -14 -4 -14 -12 z" fill="#86EFAC" />
          <line x1="64" y1="62" x2="76" y2="62" stroke="#15803D" strokeWidth="1.5" strokeDasharray="2 2" />
          <line x1="64" y1="30" x2="76" y2="30" stroke="#15803D" strokeWidth="1.5" strokeDasharray="2 2" />
          <circle cx="30" cy="84" r="5" fill="#FACC15" /><circle cx="46" cy="90" r="5" fill="#FACC15" /><circle cx="54" cy="76" r="5" fill="#FACC15" />
        </svg>
        <div>
          <div className={handwritten.className} style={{ fontSize: 30, color: '#15803D', lineHeight: 1, fontWeight: 700 }}>Emergency Fund Jar</div>
          <div className="text-[11px] mt-2 space-y-1" style={{ color: 'var(--text2)' }}>
            <div><b>3 months</b> of expenses — starter</div>
            <div><b>6 months</b> — safe & sound</div>
          </div>
        </div>
      </div>
      <p className="text-[11.5px] mt-3" style={{ color: 'var(--text3)' }}>Keep it boring and easy to reach: savings account, sweep-in FD or a liquid fund. Not stocks.</p>
      <div className="mt-3"><TopicTag topic="protection" /></div>
    </div>
  )
}

function LeakCard({ cur }: { cur: Cur }) {
  const daily = cur === 'AED' ? 20 : 200
  const yearly = daily * 365
  const grown = sipFV(yearly / 12, 0.12, 10)
  return (
    <div className="px-5 pt-6 pb-5" style={{ background: 'linear-gradient(180deg,#FFF1F2 0%,#fff 65%)' }}>
      <div className={handwritten.className} style={{ fontSize: 30, color: '#BE123C', lineHeight: 1, fontWeight: 700 }}>Small Leaks, Big Ships</div>
      <div className="mt-4 space-y-2">
        {[
          { e: '☕', t: `${fmtMoney(daily, cur)} a day on extras`, s: 'coffee, snacks, delivery fees' },
          { e: '📅', t: `${fmtMoney(yearly, cur)} a year`, s: 'gone without noticing' },
          { e: '🌱', t: `≈ ${fmtMoney(grown, cur)} in 10 years`, s: 'if invested monthly at 12%' },
        ].map((r, k) => (
          <div key={k} className="flex items-center gap-3 rounded-xl px-3 py-2" style={{ background: k === 2 ? '#DCFCE7' : 'rgba(255,255,255,0.8)', border: '1px solid var(--border)' }}>
            <span className="text-[20px]" aria-hidden>{r.e}</span>
            <div>
              <div className="text-[12.5px] font-bold" style={{ color: 'var(--text)' }}>{r.t}</div>
              <div className="text-[10.5px]" style={{ color: 'var(--text3)' }}>{r.s}</div>
            </div>
          </div>
        ))}
      </div>
      <div className="mt-3"><TopicTag topic="saving" /></div>
    </div>
  )
}

function FreedomNumberCard({ cur }: { cur: Cur }) {
  const monthly = cur === 'AED' ? 10000 : 50000
  return (
    <div className="px-5 pt-7 pb-5 text-center" style={{ background: 'linear-gradient(165deg,#EDE9FE 0%,#E0F2FE 100%)' }}>
      <div className="text-[11px] font-bold uppercase tracking-[0.2em]" style={{ color: '#6D28D9' }}>Your Freedom Number</div>
      <div className={handwritten.className} style={{ fontSize: 34, color: '#4C1D95', lineHeight: 1.05, fontWeight: 700, marginTop: 6 }}>Yearly expenses × 25</div>
      <div className="mt-4 rounded-xl px-4 py-3 text-[12px]" style={{ background: 'rgba(255,255,255,0.75)', color: 'var(--text2)' }}>
        {fmtMoney(monthly, cur)}/month → {fmtMoney(monthly * 12, cur)}/year →{' '}
        <b style={{ color: '#6D28D9' }}>{fmtMoney(monthly * 12 * 25, cur)}</b>
      </div>
      <p className="text-[11px] mt-3" style={{ color: 'var(--text3)' }}>Withdraw about 4% a year and your money can last 30+ years.</p>
      <Link href="/dashboard/financial-health" className="inline-flex items-center gap-1 mt-3 text-[12px] font-bold" style={{ color: '#6D28D9' }}>
        Find your number <ArrowRight size={12} />
      </Link>
    </div>
  )
}

// ─── User pins ────────────────────────────────────────────────────────────────
function UserPinBody({ pin }: { pin: any }) {
  const [broken, setBroken] = useState(false)
  return (
    <div style={{ background: '#fff' }}>
      {broken ? (
        <div className="h-48 flex flex-col items-center justify-center gap-2 text-[11px]" style={{ background: 'var(--bg2)', color: 'var(--text3)' }}>
          <ImageOff size={20} /> Image unavailable
        </div>
      ) : (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={pin.image_url} alt={pin.title || 'Pinned image'} loading="lazy" referrerPolicy="no-referrer"
          className="w-full h-auto block" onError={() => setBroken(true)} />
      )}
      {(pin.title || pin.source_url) && (
        <div className="px-3 py-2 flex items-center gap-2">
          <span className="text-[12px] font-semibold flex-1 min-w-0 truncate" style={{ color: 'var(--text)' }}>{pin.title}</span>
          {pin.source_url && (
            <a href={pin.source_url} target="_blank" rel="noopener noreferrer" className="shrink-0" style={{ color: 'var(--text3)' }} aria-label="Open source">
              <ExternalLink size={12} />
            </a>
          )}
        </div>
      )}
    </div>
  )
}

function AddPinModal({ onClose, onAdded }: { onClose: () => void; onAdded: (pin: any) => void }) {
  const [url, setUrl] = useState('')
  const [preview, setPreview] = useState<{ image: string; source?: string } | null>(null)
  const [title, setTitle] = useState('')
  const [topic, setTopic] = useState<Topic>('freedom')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  async function find() {
    setError(''); setPreview(null)
    let u: URL
    try { u = new URL(url.trim()) } catch { setError('Paste a full link starting with https://'); return }
    const isPinterest = /(^|\.)pinterest\.|^pin\.it$|(^|\.)pinimg\.com$/i.test(u.hostname)
    if (!isPinterest) { setPreview({ image: u.toString() }); return }   // direct image address
    setBusy(true)
    try {
      const res = await fetch(`/api/pin-preview?url=${encodeURIComponent(u.toString())}`)
      const d = await res.json()
      if (!res.ok) throw new Error(d.error || 'Could not read that pin')
      setPreview({ image: d.image, source: d.source || u.toString() })
      if (d.title && !title) setTitle(d.title)
    } catch (e: any) { setError(e.message) } finally { setBusy(false) }
  }

  async function save() {
    if (!preview) return
    setBusy(true); setError('')
    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()
    const { data, error: err } = await supabase.from('vision_pins').insert({
      user_id: user!.id, image_url: preview.image, source_url: preview.source ?? null, title: title.trim() || null, topic,
    }).select().single()
    setBusy(false)
    if (err) { setError(isMissingTable(err) ? 'Run supabase/migrations/022_freedom.sql in the Supabase SQL Editor to save pins.' : err.message); return }
    onAdded(data); onClose()
  }

  return (
    <div className="fixed inset-0 bg-black/40 z-50 overflow-y-auto" onClick={onClose}>
      <div className="flex min-h-full items-center justify-center p-4 py-8">
        <div className="wl-card p-5 w-full max-w-md" onClick={e => e.stopPropagation()}>
          <div className="flex items-center justify-between mb-4">
            <div className="text-[15px] font-bold" style={{ color: 'var(--text)' }}>Add a pin to your board</div>
            <button onClick={onClose} style={{ color: 'var(--text3)' }} aria-label="Close"><X size={16} /></button>
          </div>
          <label className="block text-[10px] uppercase tracking-wider font-semibold mb-1.5" style={{ color: 'var(--text3)' }}>Pinterest link or image address</label>
          <div className="flex gap-2">
            <input value={url} onChange={e => setUrl(e.target.value)} onKeyDown={e => e.key === 'Enter' && find()}
              placeholder="https://in.pinterest.com/pin/…" className="wl-input flex-1" style={{ background: 'var(--bg2)' }} />
            <button onClick={find} disabled={busy || !url.trim()} className="px-3 rounded-lg text-[12px] font-bold text-white disabled:opacity-40" style={{ background: 'var(--sage)' }}>
              {busy && !preview ? <Loader2 size={14} className="animate-spin" /> : 'Find'}
            </button>
          </div>
          {preview && (
            <div className="mt-4 space-y-3">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={preview.image} alt="Preview" referrerPolicy="no-referrer" className="w-full max-h-72 object-contain rounded-xl" style={{ background: 'var(--bg2)' }}
                onError={() => { setPreview(null); setError('That image could not be loaded — check the link.') }} />
              <input value={title} onChange={e => setTitle(e.target.value)} placeholder="Caption (optional)" className="wl-input w-full" style={{ background: 'var(--bg2)' }} />
              <div className="flex flex-wrap gap-1.5">
                {TOPICS.map(t => (
                  <button key={t.key} onClick={() => setTopic(t.key)} className="px-2.5 py-1 rounded-lg text-[11px] font-semibold border"
                    style={topic === t.key ? { background: 'var(--sage-bg)', borderColor: 'var(--sage)', color: 'var(--sage)' } : { borderColor: 'var(--border)', color: 'var(--text3)' }}>
                    {t.emoji} {t.label}
                  </button>
                ))}
              </div>
              <button onClick={save} disabled={busy} className="w-full py-2.5 rounded-xl text-[13px] font-bold text-white disabled:opacity-40" style={{ background: 'var(--sage)' }}>
                {busy ? 'Saving…' : 'Save to my board'}
              </button>
            </div>
          )}
          {error && <p className="mt-3 text-[12px]" style={{ color: 'var(--rose)' }}>{error}</p>}
          <p className="mt-4 text-[10.5px]" style={{ color: 'var(--text3)' }}>
            On Pinterest tap ••• → Copy link, then paste it here. Pins are private to your board.
          </p>
        </div>
      </div>
    </div>
  )
}

// ─── Page ─────────────────────────────────────────────────────────────────────
type Filter = 'all' | 'saved' | 'mine' | Topic
type Item = { id: string; topic: Topic; body: React.ReactNode; extra?: React.ReactNode; mine?: boolean }

export default function InspireClient({ pins: initialPins }: { pins: any[] }) {
  const { view } = useViewStore()
  const cur: Cur = view === 'uae' ? 'AED' : 'INR'
  const [pins, setPins] = useState<any[]>(initialPins)
  const [filter, setFilter] = useState<Filter>('all')
  const [seed, setSeed] = useState(dayNumber)
  const [saved, setSaved] = useState<Set<string>>(new Set())
  const [adding, setAdding] = useState(false)

  useEffect(() => {
    try { setSaved(new Set(JSON.parse(localStorage.getItem(SAVED_KEY) || '[]'))) } catch {}
  }, [])
  function toggleSave(id: string) {
    setSaved(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id); else next.add(id)
      try { localStorage.setItem(SAVED_KEY, JSON.stringify(Array.from(next))) } catch {}
      return next
    })
  }
  async function deletePin(id: string) {
    const { error } = await createClient().from('vision_pins').delete().eq('id', id)
    if (!error) setPins(p => p.filter(x => x.id !== id))
  }

  const builtIns = useMemo<Item[]>(() => {
    const items: Item[] = [
      ...QUOTES.map((q, i) => ({ id: `q${i}`, topic: q.topic, body: <QuoteCard q={q} i={i} />,
        extra: <CopyBtn text={`“${q.text}”${q.author ? ` — ${q.author}` : ''}`} /> })),
      ...TIP_LISTS.map(t => ({ id: `tip-${t.id}`, topic: t.topic, body: <TipListCard t={t} /> })),
      { id: 'signpost', topic: 'freedom', body: <SignpostCard /> },
      { id: 'stairs', topic: 'investing', body: <StaircaseCard /> },
      { id: 'split', topic: 'saving', body: <SplitCard cur={cur} /> },
      { id: 'compound', topic: 'investing', body: <CompoundCard cur={cur} /> },
      { id: 'rule72', topic: 'investing', body: <Rule72Card /> },
      { id: 'jar', topic: 'protection', body: <JarCard /> },
      { id: 'leak', topic: 'saving', body: <LeakCard cur={cur} /> },
      { id: 'fi', topic: 'freedom', body: <FreedomNumberCard cur={cur} /> },
    ]
    // Seeded shuffle so the board feels fresh each day (and on "Shuffle")
    const rnd = seeded(seed)
    for (let i = items.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [items[i], items[j]] = [items[j], items[i]] }
    return items
  }, [seed, cur])

  const mine: Item[] = pins.map(p => ({
    id: `pin:${p.id}`, topic: (p.topic as Topic) || 'freedom', mine: true, body: <UserPinBody pin={p} />,
    extra: <RoundBtn label="Remove pin" onClick={() => deletePin(p.id)}><Trash2 size={13} /></RoundBtn>,
  }))
  const all = [...mine, ...builtIns]
  const visible = all.filter(it =>
    filter === 'all' ? true : filter === 'saved' ? saved.has(it.id) : filter === 'mine' ? it.mine : it.topic === filter)

  const qod = QUOTES[dayNumber() % QUOTES.length]
  const chips: { key: Filter; label: string }[] = [
    { key: 'all', label: 'All' },
    { key: 'saved', label: `♥ Saved${saved.size ? ` (${saved.size})` : ''}` },
    { key: 'mine', label: `📌 My pins${pins.length ? ` (${pins.length})` : ''}` },
    ...TOPICS.map(t => ({ key: t.key as Filter, label: `${t.emoji} ${t.label}` })),
  ]

  return (
    <div className="space-y-5 animate-fade-up pb-12">
      <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold" style={{ color: 'var(--text)' }}>Money Mindset</h1>
          <p className="text-[12px] mt-0.5" style={{ color: 'var(--text3)' }}>Ideas and reminders to keep you going on the road to financial freedom</p>
        </div>
        <div className="flex gap-2">
          <button onClick={() => setSeed(s => s + 1)} className="flex-1 sm:flex-none flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg text-[12px] font-semibold border"
            style={{ borderColor: 'var(--border)', color: 'var(--text2)', background: 'var(--bg2)' }}>
            <Shuffle size={13} /> Shuffle
          </button>
          <button onClick={() => setAdding(true)} className="flex-1 sm:flex-none flex items-center justify-center gap-1.5 px-4 py-2 rounded-lg text-[12px] font-bold text-white"
            style={{ background: 'var(--sage)' }}>
            <Plus size={14} /> Add pin
          </button>
        </div>
      </div>

      {/* Quote of the day */}
      <div className="rounded-2xl px-6 py-7 sm:px-10 text-center relative overflow-hidden"
        style={{ background: 'linear-gradient(120deg,#FEF3C7 0%,#FBCFE8 50%,#C7D2FE 100%)' }}>
        <div className="text-[10px] font-bold uppercase tracking-[0.25em] mb-2" style={{ color: '#9D174D' }}>Quote of the day</div>
        <p className={handwritten.className} style={{ fontSize: 'clamp(26px, 4vw, 40px)', color: '#3B0764', lineHeight: 1.1, fontWeight: 700 }}>{qod.text}</p>
        {qod.author && <div className="mt-2 text-[11px] font-bold uppercase tracking-[0.18em]" style={{ color: '#6B21A8' }}>— {qod.author}</div>}
      </div>

      {/* Filters */}
      <div className="flex gap-1.5 overflow-x-auto pb-1 -mx-4 px-4 sm:mx-0 sm:px-0 sm:flex-wrap">
        {chips.map(c => (
          <button key={c.key} onClick={() => setFilter(c.key)}
            className="shrink-0 px-3 py-1.5 rounded-full text-[12px] font-semibold border transition-all"
            style={filter === c.key
              ? { background: 'var(--text)', borderColor: 'var(--text)', color: '#fff' }
              : { background: '#fff', borderColor: 'var(--border)', color: 'var(--text2)' }}>
            {c.label}
          </button>
        ))}
      </div>

      {visible.length === 0 ? (
        <div className="wl-card py-16 text-center text-[13px]" style={{ color: 'var(--text3)' }}>
          {filter === 'saved' ? 'Tap ♡ on any card to save it here.'
            : filter === 'mine' ? <>Paste a Pinterest link to add your own pins. <button onClick={() => setAdding(true)} className="font-bold" style={{ color: 'var(--sage)' }}>Add pin</button></>
            : 'Nothing here yet.'}
        </div>
      ) : (
        <div className="columns-1 sm:columns-2 lg:columns-3 2xl:columns-4 gap-4">
          {visible.map(it => (
            <Pin key={it.id} saved={saved.has(it.id)} onSave={() => toggleSave(it.id)} extra={it.extra}>{it.body}</Pin>
          ))}
        </div>
      )}

      {adding && <AddPinModal onClose={() => setAdding(false)} onAdded={p => { setPins(prev => [p, ...prev]); setFilter('all') }} />}
    </div>
  )
}
