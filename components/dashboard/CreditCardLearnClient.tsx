'use client'
import { useState, useEffect, useRef } from 'react'
import Link from 'next/link'
import {
  CreditCard, TrendingDown, TrendingUp, AlertTriangle, CheckCircle2,
  ChevronRight, Star, Shield, Zap, BookOpen, Award, Target, Clock,
  ArrowLeft,
} from 'lucide-react'

// ── Scroll animation helpers ──────────────────────────────────────────────────
function useInView(threshold = 0.12) {
  const ref = useRef<HTMLDivElement>(null)
  const [visible, setVisible] = useState(false)
  useEffect(() => {
    const el = ref.current
    if (!el) return
    const obs = new IntersectionObserver(
      ([entry]) => { if (entry.isIntersecting) { setVisible(true); obs.disconnect() } },
      { threshold }
    )
    obs.observe(el)
    return () => obs.disconnect()
  }, [threshold])
  return { ref, visible }
}

function FadeUp({ children, delay = 0, className = '' }: {
  children: React.ReactNode; delay?: number; className?: string
}) {
  const { ref, visible } = useInView()
  return (
    <div ref={ref} className={className} style={{
      opacity: visible ? 1 : 0,
      transform: visible ? 'translateY(0)' : 'translateY(22px)',
      transition: `opacity 0.55s ease ${delay}ms, transform 0.55s ease ${delay}ms`,
    }}>
      {children}
    </div>
  )
}

function AnimBar({ pct, color, delay = 0 }: { pct: number; color: string; delay?: number }) {
  const { ref, visible } = useInView()
  return (
    <div ref={ref} className="h-3 rounded-full overflow-hidden" style={{ background: 'var(--bg2)' }}>
      <div style={{
        height: '100%', borderRadius: 9999,
        width: visible ? `${Math.min(100, pct)}%` : '0%',
        background: color,
        transition: `width 0.9s ease ${delay}ms`,
      }} />
    </div>
  )
}

// ── Data ──────────────────────────────────────────────────────────────────────
const UTIL_BANDS = [
  { range: '0–10%',   label: 'Excellent',  color: '#16A34A', bg: '#F0FDF4', cibil: '+40–50 pts', impact: 'Best possible score impact. Signals you barely need credit.' },
  { range: '11–30%',  label: 'Good',       color: '#2563EB', bg: '#EFF6FF', cibil: '+20–39 pts', impact: 'Ideal range. Lenders see you as a responsible borrower.' },
  { range: '31–50%',  label: 'Fair',       color: '#D97706', bg: '#FFFBEB', cibil: '0 to −20 pts', impact: 'Starting to show strain. Aim to pay down and stay below 30%.' },
  { range: '51–75%',  label: 'High',       color: '#E11D48', bg: '#FFF1F2', cibil: '−30–50 pts', impact: 'CIBIL score drops noticeably. Loan approvals get harder.' },
  { range: '76–100%', label: 'Danger',     color: '#991B1B', bg: '#FEF2F2', cibil: '−50–80 pts', impact: 'Severely damages credit score. Banks may reduce your limit.' },
]

const CIBIL_FACTORS = [
  { label: 'Payment History',      pct: 35, color: '#16A34A', desc: 'On-time payments are the single biggest factor' },
  { label: 'Credit Utilization',   pct: 30, color: '#2563EB', desc: 'Keep below 30% of total credit limit' },
  { label: 'Credit Age',           pct: 15, color: '#7C3AED', desc: 'Older accounts improve your score' },
  { label: 'Credit Mix',           pct: 10, color: '#D97706', desc: 'Mix of credit cards, loans, etc.' },
  { label: 'New Credit Inquiries', pct: 10, color: '#E11D48', desc: 'Too many applications in short time hurts' },
]

const CARD_LOAN_IMPACTS = [
  { icon: '💸', title: 'Interest Rates 24–48% p.a.',   severity: 'danger',
    desc: 'Credit card loans / EMI on card carry some of the highest interest rates — far more than personal loans (10–16%) or home loans (8–11%).' },
  { icon: '📉', title: 'Reduces Available Credit',      severity: 'warning',
    desc: 'A card loan blocks part of your credit limit, increasing your utilization ratio and hurting your CIBIL score until fully repaid.' },
  { icon: '🔄', title: 'Minimum Due Trap',              severity: 'danger',
    desc: 'Paying only minimum due (usually 5%) means you carry 95% balance with full interest. A ₹1L balance at 3.5%/mo costs ₹3,500 every month in interest.' },
  { icon: '⚠️', title: 'Missed EMI = Double Penalty',   severity: 'danger',
    desc: 'Missing a credit card EMI adds a late fee AND triggers penalty interest on the entire outstanding amount, not just the missed installment.' },
  { icon: '🎯', title: 'Better Alternative Exists',     severity: 'tip',
    desc: 'A personal loan at 12–16% beats a credit card loan at 36–48% for the same amount. Always compare before using card EMI.' },
  { icon: '💳', title: 'Balance Transfer Rescue',       severity: 'tip',
    desc: 'If you\'re stuck in high-interest card debt, a balance transfer to a 0% introductory card or a lower-rate card can save thousands.' },
]

const SMART_USES = [
  { icon: '✈️', title: 'Travel & Lounge Access',       desc: 'Use travel cards for flight bookings — earn miles and get free airport lounge access worth ₹1,500+ per visit.' },
  { icon: '🛒', title: 'Big Purchases for Rewards',    desc: 'Large purchases (electronics, appliances) earn 5–10% cashback or reward points. Pay in full next cycle.' },
  { icon: '🔒', title: 'Online Fraud Protection',      desc: 'Credit cards offer zero-liability fraud protection. Always use them for online shopping — not debit cards.' },
  { icon: '🏥', title: 'Emergency Buffer',             desc: 'Interest-free period (30–55 days) makes credit cards a free emergency fund — if you pay full by due date.' },
  { icon: '💰', title: 'Fuel & Utility Surcharge',     desc: 'Co-branded fuel cards waive surcharge (0.5–1%) on petrol + earn points. Great for high-mileage drivers.' },
  { icon: '🍽️', title: 'Dining & Entertainment',       desc: 'Many cards offer 10–20% off at restaurant partners. Use the right card at the right merchant.' },
]

const PAYMENT_STRATEGIES = [
  { label: 'Pay Full Balance', rating: 5, color: '#16A34A', bg: '#F0FDF4',
    pros: ['Zero interest — completely free credit', 'Maximises CIBIL score benefit', 'Full cashback/rewards retention'],
    cons: ['Requires cash discipline'],
    verdict: 'Always the best option if you can afford it.' },
  { label: 'Pay Above Minimum', rating: 3, color: '#D97706', bg: '#FFFBEB',
    pros: ['Reduces balance faster than minimum', 'Avoids worst-case interest spiral'],
    cons: ['Still pays significant interest', 'Partial rewards may be clawed back'],
    verdict: 'Acceptable short-term. Aim to clear fully next cycle.' },
  { label: 'Minimum Due Only', rating: 1, color: '#E11D48', bg: '#FFF1F2',
    pros: ['Keeps account in good standing'],
    cons: ['Pays 36–48% p.a. interest on balance', 'Debt grows rapidly', 'Major CIBIL score damage over time'],
    verdict: 'Last resort only. Calculate total interest cost — it\'s shocking.' },
]

const GOLDEN_RULES = [
  { icon: '🎯', rule: 'Keep utilization below 30%', detail: 'Across all cards combined, not just per card' },
  { icon: '📅', rule: 'Pay full by due date, always', detail: 'Set auto-pay for statement balance to never miss' },
  { icon: '🚫', rule: 'Never withdraw cash from credit card', detail: '2–3% fee + interest from day 1, no grace period' },
  { icon: '🔍', rule: 'Check your statement every month', detail: 'Spot unauthorised charges early — 30-day dispute window' },
  { icon: '💳', rule: 'Keep old cards active', detail: 'Credit age (15% of CIBIL) improves with older accounts' },
  { icon: '🏦', rule: 'Avoid too many applications', detail: 'Each hard inquiry drops score 5–10 pts. Wait 6 months between applications' },
  { icon: '📊', rule: 'Use different cards for different purposes', detail: 'Travel card for flights, cashback card for groceries, etc.' },
  { icon: '⚡', rule: 'Convert large purchases to EMI', detail: 'Interest-free EMI (if offered) beats paying 3.5%/month interest on balance' },
]

function SectionHeader({ icon: Icon, color, title, sub }: {
  icon: any; color: string; title: string; sub?: string
}) {
  return (
    <div className="mb-5">
      <div className="flex items-center gap-2 mb-0.5">
        <Icon size={17} style={{ color }} />
        <h2 className="text-[16px] font-bold" style={{ color: 'var(--text)' }}>{title}</h2>
      </div>
      {sub && <p className="text-[12px]" style={{ color: 'var(--text3)' }}>{sub}</p>}
    </div>
  )
}

// ── Main Component ────────────────────────────────────────────────────────────
export default function CreditCardLearnClient() {
  const [simBal, setSimBal]     = useState(50000)
  const [simLimit, setSimLimit] = useState(200000)
  const utilPct = simLimit > 0 ? Math.round((simBal / simLimit) * 100) : 0
  const utilBand = UTIL_BANDS.find(b => {
    const [lo, hi] = b.range.replace('%', '').split('–').map(Number)
    return utilPct <= hi
  }) ?? UTIL_BANDS[UTIL_BANDS.length - 1]

  const interestPerMonth = Math.round(simBal * 0.035)

  return (
    <div className="space-y-10 animate-fade-up pb-16">

      {/* ── HERO ── */}
      <FadeUp>
        <div className="wl-card p-6" style={{ background: '#EFF6FF', borderColor: '#2563EB30' }}>
          <Link href="/dashboard/cards"
            className="inline-flex items-center gap-1.5 text-[12px] font-semibold mb-4"
            style={{ color: 'var(--blue)' }}>
            <ArrowLeft size={13} /> Back to Cards
          </Link>
          <div className="flex items-start gap-4">
            <div className="w-12 h-12 rounded-2xl flex items-center justify-center shrink-0"
              style={{ background: '#2563EB' }}>
              <CreditCard size={22} color="#fff" />
            </div>
            <div>
              <h1 className="text-[22px] font-black mb-1" style={{ color: 'var(--text)' }}>
                Credit Card Mastery
              </h1>
              <p className="text-[13px]" style={{ color: 'var(--text2)' }}>
                Everything you need to know: utilization, CIBIL score impact, avoiding debt traps,
                and using your card to work <em>for</em> you.
              </p>
            </div>
          </div>
        </div>
      </FadeUp>

      {/* ── UTILIZATION BANDS ── */}
      <div>
        <FadeUp>
          <SectionHeader icon={Target} color="var(--blue)" title="Credit Utilization & CIBIL Score"
            sub="Utilization is 30% of your CIBIL score — the #2 factor after payment history" />
        </FadeUp>

        <div className="space-y-3">
          {UTIL_BANDS.map((b, i) => (
            <FadeUp key={b.range} delay={i * 70}>
              <div className="wl-card p-4 flex items-center gap-4"
                style={{ borderColor: `${b.color}25` }}>
                <div className="text-center shrink-0 w-16">
                  <div className="text-[11px] font-bold" style={{ color: b.color }}>{b.range}</div>
                  <div className="text-[10px] font-semibold mt-0.5 px-1.5 py-0.5 rounded-full inline-block"
                    style={{ background: b.bg, color: b.color }}>{b.label}</div>
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex justify-between items-center mb-1.5">
                    <span className="text-[12px] font-semibold" style={{ color: b.color }}>
                      CIBIL Impact: {b.cibil}
                    </span>
                  </div>
                  <AnimBar pct={Number(b.range.split('–')[1])} color={b.color} delay={i * 70 + 200} />
                  <p className="text-[11px] mt-1.5" style={{ color: 'var(--text3)' }}>{b.impact}</p>
                </div>
              </div>
            </FadeUp>
          ))}
        </div>

        <FadeUp delay={420} className="mt-3">
          <div className="wl-card p-4" style={{ background: '#F0FDF4', borderColor: '#16A34A30' }}>
            <div className="flex items-center gap-2 mb-1">
              <CheckCircle2 size={14} style={{ color: '#16A34A' }} />
              <span className="text-[12px] font-bold" style={{ color: '#16A34A' }}>The 30% Rule</span>
            </div>
            <p className="text-[12px]" style={{ color: 'var(--text2)' }}>
              Always keep your total credit usage below 30% of your combined credit limit.
              If your total limit is ₹3,00,000 — keep total outstanding below ₹90,000.
              The 10% threshold gets you the best CIBIL boost.
            </p>
          </div>
        </FadeUp>
      </div>

      {/* ── CIBIL SCORE FACTORS ── */}
      <div>
        <FadeUp>
          <SectionHeader icon={Award} color="var(--purple)" title="What Makes Up Your CIBIL Score?"
            sub="Know where to focus — each factor has a different weight" />
        </FadeUp>

        <div className="wl-card p-5">
          <div className="space-y-4">
            {CIBIL_FACTORS.map((f, i) => (
              <FadeUp key={f.label} delay={i * 70}>
                <div>
                  <div className="flex justify-between items-center mb-1.5">
                    <span className="text-[13px] font-semibold" style={{ color: 'var(--text)' }}>
                      {f.label}
                    </span>
                    <span className="text-[13px] font-black" style={{ color: f.color }}>{f.pct}%</span>
                  </div>
                  <AnimBar pct={f.pct} color={f.color} delay={i * 70 + 150} />
                  <p className="text-[11px] mt-1" style={{ color: 'var(--text3)' }}>{f.desc}</p>
                </div>
              </FadeUp>
            ))}
          </div>

          <FadeUp delay={450} className="mt-4">
            <div className="p-3 rounded-xl" style={{ background: 'var(--bg2)' }}>
              <p className="text-[12px]" style={{ color: 'var(--text2)' }}>
                <strong style={{ color: 'var(--text)' }}>Key insight:</strong> Payment history (35%) + Utilization (30%)
                = <strong style={{ color: 'var(--blue)' }}>65% of your CIBIL score</strong>. Master these two and
                you'll have an 800+ score.
              </p>
            </div>
          </FadeUp>
        </div>
      </div>

      {/* ── LIVE UTILIZATION CALCULATOR ── */}
      <div>
        <FadeUp>
          <SectionHeader icon={Zap} color="var(--gold)" title="Utilization Calculator"
            sub="Enter your balance and limit to see how it affects your CIBIL score" />
        </FadeUp>

        <FadeUp delay={80}>
          <div className="wl-card p-5">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-5 mb-5">
              <div>
                <label className="block text-[10px] uppercase tracking-wider font-semibold mb-1.5"
                  style={{ color: 'var(--text3)' }}>Outstanding Balance (₹)</label>
                <input type="number" value={simBal} onChange={e => setSimBal(Number(e.target.value))}
                  className="wl-input"
                  onFocus={e => (e.target.style.borderColor = 'var(--blue)')}
                  onBlur={e => (e.target.style.borderColor = 'var(--border)')} />
              </div>
              <div>
                <label className="block text-[10px] uppercase tracking-wider font-semibold mb-1.5"
                  style={{ color: 'var(--text3)' }}>Total Credit Limit (₹)</label>
                <input type="number" value={simLimit} onChange={e => setSimLimit(Number(e.target.value))}
                  className="wl-input"
                  onFocus={e => (e.target.style.borderColor = 'var(--blue)')}
                  onBlur={e => (e.target.style.borderColor = 'var(--border)')} />
              </div>
            </div>

            {/* Result */}
            <div className="rounded-xl p-4 mb-3" style={{ background: utilBand.bg, border: `1.5px solid ${utilBand.color}30` }}>
              <div className="flex items-center justify-between mb-3">
                <div>
                  <div className="text-[11px] font-semibold uppercase tracking-wide mb-0.5"
                    style={{ color: 'var(--text3)' }}>Your Utilization</div>
                  <div className="text-[36px] font-black leading-none" style={{ color: utilBand.color }}>
                    {utilPct}%
                  </div>
                </div>
                <div className="text-right">
                  <div className="text-[11px] font-semibold mb-0.5" style={{ color: 'var(--text3)' }}>
                    Rating
                  </div>
                  <div className="text-[18px] font-bold" style={{ color: utilBand.color }}>
                    {utilBand.label}
                  </div>
                  <div className="text-[12px] font-bold mt-0.5" style={{ color: utilBand.color }}>
                    {utilBand.cibil}
                  </div>
                </div>
              </div>
              <div className="h-3 rounded-full overflow-hidden mb-2" style={{ background: 'var(--border)' }}>
                <div className="h-full rounded-full transition-all duration-700"
                  style={{ width: `${Math.min(utilPct, 100)}%`, background: utilBand.color }} />
              </div>
              <p className="text-[12px]" style={{ color: 'var(--text2)' }}>{utilBand.impact}</p>
            </div>

            {simBal > 0 && (
              <div className="rounded-xl p-3 flex items-center gap-3"
                style={{ background: '#FFF1F2', border: '1px solid #E11D4825' }}>
                <AlertTriangle size={14} style={{ color: '#E11D48' }} className="shrink-0" />
                <p className="text-[12px]" style={{ color: 'var(--text2)' }}>
                  At 3.5%/month interest, carrying this balance costs{' '}
                  <strong style={{ color: '#E11D48' }}>₹{interestPerMonth.toLocaleString('en-IN')}/month</strong>{' '}
                  = <strong style={{ color: '#E11D48' }}>
                    ₹{(interestPerMonth * 12).toLocaleString('en-IN')}/year
                  </strong> in interest alone.
                </p>
              </div>
            )}
          </div>
        </FadeUp>
      </div>

      {/* ── CREDIT CARD LOAN IMPACT ── */}
      <div>
        <FadeUp>
          <SectionHeader icon={TrendingDown} color="var(--rose)" title="Credit Card Loans & Personal Finance Impact"
            sub="Why card loans are dangerous — and when alternatives are better" />
        </FadeUp>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {CARD_LOAN_IMPACTS.map((item, i) => (
            <FadeUp key={item.title} delay={i * 70}>
              <div className="wl-card p-4 h-full"
                style={item.severity === 'danger'
                  ? { borderColor: '#E11D4825', background: '#FFF8F8' }
                  : item.severity === 'warning'
                  ? { borderColor: '#D9770625', background: '#FFFDF0' }
                  : { borderColor: '#16A34A25', background: '#F7FEF9' }}>
                <div className="flex items-start gap-3">
                  <span className="text-2xl shrink-0">{item.icon}</span>
                  <div>
                    <div className="text-[13px] font-bold mb-1" style={{
                      color: item.severity === 'danger' ? '#E11D48'
                        : item.severity === 'warning' ? '#D97706' : '#16A34A'
                    }}>
                      {item.title}
                    </div>
                    <p className="text-[12px]" style={{ color: 'var(--text2)' }}>{item.desc}</p>
                  </div>
                </div>
              </div>
            </FadeUp>
          ))}
        </div>

        {/* Minimum due trap table */}
        <FadeUp delay={450} className="mt-4">
          <div className="wl-card p-5">
            <h3 className="text-[14px] font-bold mb-3" style={{ color: 'var(--text)' }}>
              💀 The Minimum Due Trap — Real Numbers
            </h3>
            <p className="text-[12px] mb-4" style={{ color: 'var(--text2)' }}>
              You spent ₹1,00,000 on your card. At 3.5%/month interest, here's what happens if you only pay the minimum:
            </p>
            <div className="overflow-x-auto">
              <table className="w-full text-[12px]">
                <thead>
                  <tr style={{ borderBottom: '2px solid var(--border)' }}>
                    {['Month', 'Balance', 'Interest', 'Min Due (5%)', 'You Pay'].map(h => (
                      <th key={h} className="text-left pb-2 pr-3 font-bold"
                        style={{ color: 'var(--text3)' }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {(() => {
                    const rows = []
                    let bal = 100000
                    for (let m = 1; m <= 6; m++) {
                      const interest = Math.round(bal * 0.035)
                      const minDue = Math.round(bal * 0.05)
                      const newBal = bal + interest - minDue
                      rows.push({ m, bal, interest, minDue, newBal })
                      bal = newBal
                    }
                    return rows.map(r => (
                      <tr key={r.m} style={{ borderBottom: '1px solid var(--border)' }}>
                        <td className="py-2 pr-3 font-semibold" style={{ color: 'var(--text)' }}>Month {r.m}</td>
                        <td className="py-2 pr-3 font-mono" style={{ color: 'var(--rose)' }}>
                          ₹{r.bal.toLocaleString('en-IN')}
                        </td>
                        <td className="py-2 pr-3 font-mono" style={{ color: '#E11D48' }}>
                          ₹{r.interest.toLocaleString('en-IN')}
                        </td>
                        <td className="py-2 pr-3 font-mono" style={{ color: 'var(--text2)' }}>
                          ₹{r.minDue.toLocaleString('en-IN')}
                        </td>
                        <td className="py-2 pr-3 font-mono font-bold" style={{
                          color: r.newBal > 100000 ? '#E11D48' : '#16A34A'
                        }}>
                          ₹{r.newBal.toLocaleString('en-IN')}
                        </td>
                      </tr>
                    ))
                  })()}
                </tbody>
              </table>
            </div>
            <div className="mt-3 p-3 rounded-lg" style={{ background: '#FFF1F2' }}>
              <p className="text-[12px] font-semibold" style={{ color: '#E11D48' }}>
                ⚠ After 6 months of paying only the minimum, your ₹1L balance has barely reduced
                — yet you've paid ₹{(Math.round(100000 * 0.05) * 6).toLocaleString('en-IN')} in payments!
                The debt spiral is real.
              </p>
            </div>
          </div>
        </FadeUp>
      </div>

      {/* ── SMART USES ── */}
      <div>
        <FadeUp>
          <SectionHeader icon={TrendingUp} color="var(--sage)" title="Where to Use Your Credit Card Smartly"
            sub="Make your card work for you — rewards, protection, and free float" />
        </FadeUp>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {SMART_USES.map((u, i) => (
            <FadeUp key={u.title} delay={i * 60}>
              <div className="wl-card p-4 flex items-start gap-3">
                <span className="text-2xl shrink-0">{u.icon}</span>
                <div>
                  <div className="text-[13px] font-bold mb-0.5" style={{ color: 'var(--text)' }}>{u.title}</div>
                  <p className="text-[12px]" style={{ color: 'var(--text2)' }}>{u.desc}</p>
                </div>
              </div>
            </FadeUp>
          ))}
        </div>
      </div>

      {/* ── PAYMENT STRATEGY ── */}
      <div>
        <FadeUp>
          <SectionHeader icon={Shield} color="var(--purple)" title="Payment Strategies Compared"
            sub="Which payment approach is right for you?" />
        </FadeUp>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {PAYMENT_STRATEGIES.map((s, i) => (
            <FadeUp key={s.label} delay={i * 80}>
              <div className="wl-card p-5 h-full" style={{ borderColor: `${s.color}30`, background: s.bg }}>
                <div className="flex items-center justify-between mb-3">
                  <div className="text-[14px] font-bold" style={{ color: 'var(--text)' }}>{s.label}</div>
                  <div className="flex gap-0.5">
                    {Array.from({ length: 5 }).map((_, j) => (
                      <Star key={j} size={11} fill={j < s.rating ? s.color : 'none'}
                        style={{ color: s.color }} />
                    ))}
                  </div>
                </div>

                <div className="space-y-1.5 mb-3">
                  {s.pros.map(p => (
                    <div key={p} className="flex items-start gap-1.5 text-[11px]" style={{ color: 'var(--text2)' }}>
                      <CheckCircle2 size={11} className="shrink-0 mt-0.5" style={{ color: '#16A34A' }} /> {p}
                    </div>
                  ))}
                  {s.cons.map(c => (
                    <div key={c} className="flex items-start gap-1.5 text-[11px]" style={{ color: 'var(--text2)' }}>
                      <AlertTriangle size={11} className="shrink-0 mt-0.5" style={{ color: '#E11D48' }} /> {c}
                    </div>
                  ))}
                </div>

                <div className="p-2.5 rounded-lg text-[11px] font-semibold"
                  style={{ background: `${s.color}15`, color: s.color }}>
                  {s.verdict}
                </div>
              </div>
            </FadeUp>
          ))}
        </div>
      </div>

      {/* ── FULL UTILIZATION HARM ── */}
      <FadeUp>
        <div className="wl-card p-5" style={{ background: '#FFF1F2', borderColor: '#E11D4830' }}>
          <div className="flex items-center gap-2 mb-4">
            <AlertTriangle size={16} style={{ color: '#E11D48' }} />
            <h2 className="text-[15px] font-bold" style={{ color: 'var(--text)' }}>
              What Happens When You Max Out Your Credit Card?
            </h2>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {[
              { num: '1', title: 'CIBIL Score Crashes',    desc: 'A card at 100% utilization can drop your CIBIL by 50–80 points immediately. This follows you for years.' },
              { num: '2', title: 'Limit Reduction Risk',   desc: 'Banks can reduce your credit limit unilaterally if you consistently max out, creating a worse utilization ratio.' },
              { num: '3', title: 'Loan Rejection',         desc: 'Banks and NBFCs check credit utilization before approving home loans, car loans, or personal loans. High utilization = rejection.' },
              { num: '4', title: 'Interest Spiral',        desc: 'Max utilization + minimum payments = compound interest on the full limit. ₹2L limit maxed out = ₹7,000+/month interest.' },
              { num: '5', title: 'Over-Limit Fees',        desc: 'Going even ₹1 over your limit triggers ₹500–2,500 over-limit fee + penalty interest rate (often 42–48% p.a.).' },
              { num: '6', title: 'Emergency Fund Gone',    desc: 'A maxed card gives you zero buffer for genuine emergencies, forcing you into even more expensive debt options.' },
            ].map(item => (
              <div key={item.num} className="flex items-start gap-3 p-3 rounded-xl"
                style={{ background: '#fff', border: '1px solid #E11D4815' }}>
                <div className="w-6 h-6 rounded-full flex items-center justify-center shrink-0 text-[11px] font-black"
                  style={{ background: '#E11D48', color: '#fff' }}>{item.num}</div>
                <div>
                  <div className="text-[12px] font-bold mb-0.5" style={{ color: '#E11D48' }}>{item.title}</div>
                  <p className="text-[11px]" style={{ color: 'var(--text2)' }}>{item.desc}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </FadeUp>

      {/* ── GOLDEN RULES ── */}
      <div>
        <FadeUp>
          <SectionHeader icon={BookOpen} color="var(--sage)" title="8 Golden Rules of Credit Card Usage"
            sub="Follow these and your card will always be an asset, never a liability" />
        </FadeUp>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {GOLDEN_RULES.map((r, i) => (
            <FadeUp key={r.rule} delay={i * 50}>
              <div className="wl-card p-4 flex items-start gap-3">
                <span className="text-xl shrink-0">{r.icon}</span>
                <div>
                  <div className="text-[13px] font-bold mb-0.5" style={{ color: 'var(--text)' }}>{r.rule}</div>
                  <p className="text-[11px]" style={{ color: 'var(--text3)' }}>{r.detail}</p>
                </div>
                <span className="text-[11px] font-bold shrink-0 ml-auto" style={{ color: 'var(--border2)' }}>
                  #{i + 1}
                </span>
              </div>
            </FadeUp>
          ))}
        </div>
      </div>

      {/* ── CREDIT SCORE TARGET TABLE ── */}
      <FadeUp>
        <div className="wl-card p-5" style={{ background: '#F0FDF4', borderColor: '#16A34A25' }}>
          <div className="flex items-center gap-2 mb-4">
            <Star size={15} style={{ color: '#16A34A' }} />
            <h2 className="text-[14px] font-bold" style={{ color: 'var(--text)' }}>
              CIBIL Score Ranges — What Each Means
            </h2>
          </div>
          <div className="space-y-2">
            {[
              { range: '750–900', label: 'Excellent',  color: '#16A34A', bg: '#F0FDF4', perks: 'Best loan rates, instant approvals, premium card offers' },
              { range: '700–749', label: 'Good',       color: '#2563EB', bg: '#EFF6FF', perks: 'Easy approvals, competitive rates, most cards available' },
              { range: '650–699', label: 'Fair',       color: '#D97706', bg: '#FFFBEB', perks: 'Some approvals with higher rates, limited premium cards' },
              { range: '600–649', label: 'Poor',       color: '#E11D48', bg: '#FFF1F2', perks: 'Difficult approvals, high rates, secured cards only' },
              { range: 'Below 600', label: 'Very Poor', color: '#991B1B', bg: '#FEF2F2', perks: 'Loan rejections likely, need to rebuild credit urgently' },
            ].map(row => (
              <div key={row.range} className="flex items-center gap-3 p-3 rounded-xl"
                style={{ background: '#fff', border: `1px solid ${row.color}20` }}>
                <div className="w-20 shrink-0">
                  <div className="text-[12px] font-black" style={{ color: row.color }}>{row.range}</div>
                  <div className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full inline-block mt-0.5"
                    style={{ background: row.bg, color: row.color }}>{row.label}</div>
                </div>
                <p className="text-[12px]" style={{ color: 'var(--text2)' }}>{row.perks}</p>
              </div>
            ))}
          </div>
        </div>
      </FadeUp>

      {/* ── CTA ── */}
      <FadeUp>
        <div className="wl-card p-6 text-center" style={{ background: 'var(--bg2)' }}>
          <div className="text-4xl mb-3">💳</div>
          <h2 className="text-[17px] font-bold mb-2" style={{ color: 'var(--text)' }}>
            Ready to take control of your credit?
          </h2>
          <p className="text-[13px] mb-5 max-w-sm mx-auto" style={{ color: 'var(--text2)' }}>
            Track all your cards, monitor utilization, and get alerts before they hurt your CIBIL score.
          </p>
          <Link href="/dashboard/cards"
            className="inline-flex items-center gap-2 px-6 py-2.5 rounded-xl font-bold text-[13px] text-white transition-all hover:opacity-90"
            style={{ background: 'var(--sage)' }}>
            <CreditCard size={14} /> Go to My Cards
          </Link>
        </div>
      </FadeUp>

    </div>
  )
}
