// Home skeleton — mirrors the dashboard layout so content doesn't jump in.
export default function Loading() {
  const block = (h: string, extra = '') => <div className={`${h} rounded-xl ${extra}`} style={{ background: 'var(--bg2)' }} />
  return (
    <div className="max-w-[1280px] mx-auto space-y-5 animate-pulse">
      <div className="space-y-2">{block('h-7 w-64')}{block('h-4 w-48')}</div>
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">{block('h-72', 'lg:col-span-2')}{block('h-72')}</div>
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">{[0, 1, 2, 3].map(i => <div key={i}>{block('h-28')}</div>)}</div>
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">{block('h-64')}{block('h-64', 'lg:col-span-2')}</div>
    </div>
  )
}
