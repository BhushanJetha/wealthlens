import type { Config } from 'tailwindcss'

const config: Config = {
  darkMode: ['class'],
  content: ['./pages/**/*.{ts,tsx}', './components/**/*.{ts,tsx}', './app/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        /* Light theme */
        bg:    { DEFAULT: '#F5F2EC', 2: '#EDE9E1' },
        card:  { DEFAULT: '#FFFFFF', 2: '#F9F7F3' },
        bdr:   { DEFAULT: '#E4DFD8', 2: '#D0C9C0' },
        /* Sidebar (forest green) */
        sidebar: { DEFAULT: '#1B3327', 2: '#243F31', 3: '#2D5040' },
        /* Sage green (primary) */
        sage:  { DEFAULT: '#3D7A58', 2: '#2E6044', bg: '#EAF3EE' },
        /* Text */
        ink:   { DEFAULT: '#1A2820', 2: '#4D6357', 3: '#8CA395' },
        /* Semantic */
        income:  { DEFAULT: '#2E7D52', bg: '#E8F5EE' },
        expense: { DEFAULT: '#C96A3A', bg: '#FDF0E8' },
        /* Legacy dark (kept for chat panel) */
        navy:  { DEFAULT: '#0D1B2A', 2: '#162032', 3: '#1E2D40' },
        teal:  { DEFAULT: '#00C9A7', 2: '#00A88A' },
        gold:  { DEFAULT: '#D4920A', bg: '#FEF6E4' },
      },
      fontFamily: {
        mono: ['DM Mono', 'Fira Mono', 'monospace'],
        sans: ['Inter', 'system-ui', 'sans-serif'],
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
