export default function Loading() {
  return (
    <div className="space-y-5 animate-pulse">
      <div className="h-8 rounded-lg w-56" style={{ background:'var(--bg2)' }} />
      <div className="h-16 rounded-2xl" style={{ background:'var(--bg2)' }} />
      <div className="h-72 rounded-xl" style={{ background:'var(--bg2)' }} />
      <div className="grid lg:grid-cols-2 gap-5">
        <div className="h-96 rounded-xl" style={{ background:'var(--bg2)' }} />
        <div className="h-96 rounded-xl" style={{ background:'var(--bg2)' }} />
      </div>
    </div>
  )
}
