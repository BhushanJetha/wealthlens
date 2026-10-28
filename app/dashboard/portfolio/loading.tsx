// Live fund and share histories load first — shown as a skeleton meanwhile
export default function Loading() {
  return (
    <div className="space-y-5 animate-pulse" aria-label="Reviewing your portfolio">
      <div className="h-8 rounded-lg w-64" style={{ background: 'var(--bg2)' }} />
      <div className="h-12 rounded-xl" style={{ background: 'var(--bg2)' }} />
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {[...Array(4)].map((_, i) => <div key={i} className="h-24 rounded-xl" style={{ background: 'var(--bg2)' }} />)}
      </div>
      <div className="h-72 rounded-xl" style={{ background: 'var(--bg2)' }} />
      <div className="h-48 rounded-xl" style={{ background: 'var(--bg2)' }} />
    </div>
  )
}
