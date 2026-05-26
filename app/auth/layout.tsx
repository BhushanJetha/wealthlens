export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen flex items-center justify-center p-4 relative overflow-hidden"
      style={{ background: '#F7F8FA' }}>
      {/* Subtle background accent */}
      <div className="absolute top-0 left-0 right-0 h-1" style={{ background: 'var(--sage)' }} />

      <div className="w-full max-w-md relative z-10">
        {/* Logo */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center gap-3 mb-3">
            <div className="w-10 h-10 rounded-xl flex items-center justify-center text-white font-bold text-lg"
              style={{ background: 'var(--sage)' }}>
              W
            </div>
            <span className="text-2xl font-bold tracking-wide" style={{ color: 'var(--sage)' }}>WEALTHLENS</span>
          </div>
          <p className="text-sm tracking-widest uppercase" style={{ color: 'var(--text3)' }}>Personal Finance OS</p>
        </div>

        {/* Card */}
        <div className="rounded-2xl p-8"
          style={{ background: '#fff', border: '1px solid var(--border)', boxShadow: '0 4px 24px rgba(0,0,0,0.08)' }}>
          {children}
        </div>

        {/* Footer */}
        <p className="text-center text-xs mt-6" style={{ color: 'var(--text3)' }}>
          Bank-grade AES-256 encryption · Your data is private
        </p>
      </div>
    </div>
  )
}
