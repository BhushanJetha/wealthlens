export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-[#0D1B2A] flex items-center justify-center p-4 relative overflow-hidden">
      {/* Background orbs */}
      <div className="absolute top-[-200px] left-[-200px] w-[600px] h-[600px] rounded-full"
        style={{ background: 'radial-gradient(circle, rgba(0,201,167,0.06) 0%, transparent 70%)' }} />
      <div className="absolute bottom-[-200px] right-[-200px] w-[600px] h-[600px] rounded-full"
        style={{ background: 'radial-gradient(circle, rgba(124,92,191,0.06) 0%, transparent 70%)' }} />

      <div className="w-full max-w-md relative z-10">
        {/* Logo */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center gap-3 mb-3">
            <div className="w-10 h-10 rounded-xl flex items-center justify-center text-black font-bold text-lg"
              style={{ background: 'linear-gradient(135deg, #00C9A7, #4A90D9)' }}>
              ◈
            </div>
            <span className="text-2xl font-bold text-[#00C9A7] tracking-wide">WEALTHLENS</span>
          </div>
          <p className="text-sm text-slate-400 tracking-widest uppercase">Personal Finance OS</p>
        </div>

        {/* Card */}
        <div className="rounded-2xl border border-white/8 p-8"
          style={{ background: 'rgba(22,32,50,0.9)', backdropFilter: 'blur(20px)' }}>
          {children}
        </div>

        {/* Footer */}
        <p className="text-center text-xs text-slate-600 mt-6">
          Bank-grade AES-256 encryption · Your data is private
        </p>
      </div>
    </div>
  )
}
