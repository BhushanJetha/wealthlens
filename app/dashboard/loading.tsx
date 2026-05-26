export default function Loading() {
  return (
    <div className="space-y-5 animate-pulse">
      <div className="h-8 rounded-lg w-48" style={{ background:'var(--bg2)' }} />
      <div className="grid grid-cols-4 gap-3">
        {[...Array(4)].map((_,i) => <div key={i} className="h-24 rounded-xl" style={{ background:'var(--bg2)' }} />)}
      </div>
      <div className="grid grid-cols-3 gap-4">
        {[...Array(3)].map((_,i) => <div key={i} className="h-64 rounded-xl" style={{ background:'var(--bg2)' }} />)}
      </div>
      <div className="grid grid-cols-3 gap-4">
        {[...Array(3)].map((_,i) => <div key={i} className="h-52 rounded-xl" style={{ background:'var(--bg2)' }} />)}
      </div>
    </div>
  )
}
