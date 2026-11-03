import { useId } from 'react'

// The WealthLens mark: a lens with rising bars. Same drawing as public/brand/logo.svg
// and the app icons (made from it), so the app, the tab and the phone all match.

export default function LogoMark({ size = 30, className = '' }: { size?: number; className?: string }) {
  // Its own gradient id: a copy hidden on one screen size can't lend its colours to another
  const id = `wl-mark-${useId().replace(/:/g, '')}`
  return (
    <svg viewBox="0 0 512 512" width={size} height={size} className={`flex-shrink-0 ${className}`} aria-hidden="true">
      <defs>
        <linearGradient id={id} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#7C68F3" />
          <stop offset="1" stopColor="#4B38C9" />
        </linearGradient>
      </defs>
      <rect width="512" height="512" rx="112" fill={`url(#${id})`} />
      <circle cx="228" cy="228" r="118" fill="none" stroke="#fff" strokeWidth="38" />
      <path d="M311 311 382 382" stroke="#fff" strokeWidth="46" strokeLinecap="round" />
      <rect x="172" y="220" width="28" height="52" rx="8" fill="#fff" />
      <rect x="214" y="188" width="28" height="84" rx="8" fill="#fff" />
      <rect x="256" y="156" width="28" height="116" rx="8" fill="#fff" />
    </svg>
  )
}
