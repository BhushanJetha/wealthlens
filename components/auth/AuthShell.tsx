import { Check } from 'lucide-react'

const PROPS = [
  'Upload a bank or card PDF — every transaction is read and tagged for you',
  'UAE + India in one view, with live AED/INR conversion',
  'Learn what each number means, right where you see it',
]

export function AuthLogo({ light }: { light?: boolean }) {
  return (
    <div className="flex items-center gap-2.5">
      <div className="w-[34px] h-[34px] rounded-[10px] flex items-center justify-center text-[16px] font-bold text-white flex-shrink-0"
        style={{ background: light ? '#6A55E8' : 'linear-gradient(135deg, #6A55E8, #7A66F0)' }}>◈</div>
      <div className="text-[18px] font-bold" style={{ color: light ? '#fff' : 'var(--text)' }}>WealthLens</div>
    </div>
  )
}

// Sign-in frame from the design: a violet-gradient story panel beside the form on
// desktop; phones get just the form under a small logo.
export default function AuthShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-dvh flex safe-top" style={{ background: '#fff' }}>
      <aside className="hidden lg:flex w-[46%] max-w-[680px] flex-none flex-col justify-between gap-10 px-11 py-10 text-white"
        style={{ background: 'linear-gradient(160deg, #171447 0%, #3A2F9E 62%, #5B47E0 100%)' }}>
        <AuthLogo light />
        <div>
          <p className="text-[36px] font-bold leading-[1.1] tracking-[-0.02em]">One calm picture of all your money.</p>
          <p className="text-[15px] leading-[1.55] mt-3.5 max-w-[420px]" style={{ color: '#DAD3FF' }}>
            UAE and India accounts, investments, loans and goals — read straight from your statements and explained in plain language.
          </p>
          <ul className="flex flex-col gap-3 mt-[26px]">
            {PROPS.map(p => (
              <li key={p} className="flex gap-3 items-start">
                <span className="w-[22px] h-[22px] rounded-[7px] flex items-center justify-center flex-none" style={{ background: '#6A55E8' }}>
                  <Check size={13} strokeWidth={3} />
                </span>
                <span className="text-[14px] leading-[1.45]">{p}</span>
              </li>
            ))}
          </ul>
        </div>
        <div aria-hidden className="rounded-[14px] px-[18px] py-4 max-w-[480px]"
          style={{ background: 'rgba(255,255,255,.08)', border: '1px solid rgba(255,255,255,.14)' }}>
          <div className="text-[12px]" style={{ color: '#DAD3FF' }}>Net worth · sample</div>
          <div className="text-[28px] font-bold mt-0.5 mb-1.5">
            ₹24.8L <span className="text-[13px] font-semibold" style={{ color: '#86EFAC' }}>▲ 5.1%</span>
          </div>
          <svg viewBox="0 0 100 30" preserveAspectRatio="none" className="w-full h-[46px]">
            <path d="M0 26 L14 22 L28 24 L42 16 L56 18 L70 9 L84 11 L100 3" fill="none" stroke="#B9ABFF" strokeWidth={2} vectorEffect="non-scaling-stroke" />
          </svg>
        </div>
      </aside>

      <main className="flex-1 min-w-0 flex flex-col items-center justify-center px-[22px] py-8 lg:py-10">
        <div className="w-full max-w-[400px]">
          <div className="lg:hidden mb-8"><AuthLogo /></div>
          {children}
        </div>
      </main>
    </div>
  )
}
