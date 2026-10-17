export default function Loading() {
  return (
    <div className="space-y-5 animate-pulse">
      <div className="h-8 rounded-lg w-56" style={{ background:'var(--bg2)' }} />
      <div className="h-32 rounded-2xl" style={{ background:'var(--bg2)' }} />
      <div className="columns-1 sm:columns-2 lg:columns-3 gap-4">
        {[260, 180, 320, 220, 280, 200].map((h, i) => <div key={i} className="mb-4 rounded-2xl break-inside-avoid" style={{ height: h, background:'var(--bg2)' }} />)}
      </div>
    </div>
  )
}
