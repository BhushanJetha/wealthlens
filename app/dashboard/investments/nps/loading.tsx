export default function Loading() {
  return (
    <div className="space-y-5 animate-pulse">
      <div className="h-8 rounded-lg w-56" style={{ background:'var(--bg2)' }} />
      <div className="grid grid-cols-3 gap-3">
        {[...Array(3)].map((_,i) => <div key={i} className="h-20 rounded-xl" style={{ background:'var(--bg2)' }} />)}
      </div>
      <div className="h-64 rounded-xl" style={{ background:'var(--bg2)' }} />
      <div className="h-48 rounded-xl" style={{ background:'var(--bg2)' }} />
    </div>
  )
}
