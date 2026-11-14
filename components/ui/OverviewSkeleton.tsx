// While an overview loads: its shape — title, six tiles, a big chart and a row
// of three cards — so nothing jumps when the numbers arrive
export default function OverviewSkeleton({ tiles = 6, rows = 2 }: { tiles?: number; rows?: number }) {
  const sk = { background: 'linear-gradient(90deg,#ECEEF3 0%,#F6F7FA 50%,#ECEEF3 100%)' }
  return (
    <div className="flex flex-col gap-3.5 md:gap-[18px] animate-pulse" aria-busy="true" aria-label="Loading">
      <div className="flex flex-col gap-2"><div className="h-3.5 w-32 rounded-md" style={sk} /><div className="h-7 w-72 max-w-full rounded-lg" style={sk} /><div className="h-3 w-48 rounded-md" style={sk} /></div>
      <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-2.5 md:gap-3">
        {Array.from({ length: tiles }, (_, i) => (
          <div key={i} className="wl-card px-4 py-3.5 flex flex-col gap-2 h-[148px]">
            <div className="h-2.5 w-3/5 rounded" style={sk} /><div className="h-5 w-4/5 rounded-md" style={sk} /><div className="h-2.5 w-full rounded" style={sk} />
            <div className="mt-auto h-8 w-full rounded-md" style={sk} />
          </div>
        ))}
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_360px] gap-3.5 md:gap-4">
        <div className="wl-card p-5 flex flex-col gap-3 h-[360px]"><div className="h-3.5 w-48 rounded" style={sk} /><div className="flex-1 flex items-end gap-3">{[50, 65, 45, 80, 70, 60].map((h, i) => <div key={i} className="flex-1 rounded-t-md" style={{ ...sk, height: `${h}%` }} />)}</div></div>
        <div className="wl-card p-5 flex flex-col gap-3 h-[360px]"><div className="h-3.5 w-32 rounded" style={sk} /><div className="mx-auto w-40 h-40 rounded-full" style={sk} />{[0, 1, 2].map(i => <div key={i} className="h-3 rounded" style={sk} />)}</div>
      </div>
      {rows > 1 && <div className="grid grid-cols-1 lg:grid-cols-3 gap-3.5 md:gap-4">{[0, 1, 2].map(i => <div key={i} className="wl-card h-[220px]" style={{ background: '#fff' }}><div className="m-5 h-3.5 w-36 rounded" style={sk} /></div>)}</div>}
    </div>
  )
}
