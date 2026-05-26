export default function Loading() {
  return (
    <div className="space-y-5 animate-pulse">
      <div className="h-8 w-48 rounded-lg" style={{ background:'var(--bg2)' }}/>
      <div className="grid grid-cols-4 gap-3">
        {[1,2,3,4].map(i=><div key={i} className="h-20 rounded-xl" style={{ background:'var(--bg2)' }}/>)}
      </div>
      <div className="h-64 rounded-xl" style={{ background:'var(--bg2)' }}/>
    </div>
  )
}
