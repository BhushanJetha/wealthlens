import type { Config } from 'tailwindcss'

// Colours point at the CSS variables in app/globals.css so Tailwind classes and
// inline `var(--…)` styles always agree.
const config: Config = {
  darkMode: ['class'],
  content: ['./pages/**/*.{ts,tsx}', './components/**/*.{ts,tsx}', './app/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        bg:     { DEFAULT: 'var(--bg)', 2: 'var(--bg2)' },
        card:   { DEFAULT: 'var(--card)', 2: 'var(--card2)' },
        bdr:    { DEFAULT: 'var(--border)', 2: 'var(--border2)' },
        accent: { DEFAULT: 'var(--accent)', 2: 'var(--accent2)', bg: 'var(--accent-bg)', border: 'var(--accent-border)' },
        sage:   { DEFAULT: 'var(--accent)', 2: 'var(--accent2)', bg: 'var(--accent-bg)' },
        ink:    { DEFAULT: 'var(--text)', 2: 'var(--text2)', 3: 'var(--text3)', 4: 'var(--text4)' },
        income:  { DEFAULT: 'var(--income)', bg: 'var(--income-bg)' },
        expense: { DEFAULT: 'var(--expense)', bg: 'var(--expense-bg)' },
        gold:    { DEFAULT: 'var(--gold)', bg: 'var(--gold-bg)' },
        /* Legacy dark (kept for chat panel) */
        navy:  { DEFAULT: '#0D1B2A', 2: '#162032', 3: '#1E2D40' },
        teal:  { DEFAULT: '#00C9A7', 2: '#00A88A' },
      },
      fontFamily: {
        // Amounts use `font-mono`; globals.css gives it tabular figures.
        mono: ['var(--font-sans)', 'system-ui', 'sans-serif'],
        sans: ['var(--font-sans)', 'system-ui', '-apple-system', 'Segoe UI', 'sans-serif'],
      },
      keyframes: {
        'fade-in':  { from: { opacity: '0', transform: 'translateY(10px)' }, to: { opacity: '1', transform: 'translateY(0)' } },
        'slide-in': { from: { transform: 'translateX(100%)' }, to: { transform: 'translateX(0)' } },
      },
      animation: {
        'fade-in':  'fade-in 0.4s ease-out',
        'slide-in': 'slide-in 0.25s ease-out',
      },
    },
  },
  plugins: [require('tailwindcss-animate')],
}
export default config
