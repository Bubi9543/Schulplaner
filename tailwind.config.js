/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      fontFamily: {
        sans: ['Inter', 'ui-sans-serif', 'system-ui', '-apple-system', 'Segoe UI', 'Roboto', 'sans-serif'],
        display: ['"Plus Jakarta Sans"', 'Inter', 'ui-sans-serif', 'system-ui', 'sans-serif'],
      },
      colors: {
        ink: {
          50: '#f7f8fb',
          100: '#eef0f6',
          200: '#dde1ec',
          300: '#bcc3d4',
          400: '#8a92a8',
          500: '#5b6378',
          600: '#3f465a',
          700: '#2c3142',
          800: '#1c2030',
          900: '#0f1220',
          950: '#06070f',
        },
      },
      backgroundImage: {
        'aurora-blue': 'radial-gradient(at 20% 10%, rgba(99,102,241,.35) 0, transparent 50%), radial-gradient(at 80% 20%, rgba(56,189,248,.35) 0, transparent 50%), radial-gradient(at 50% 90%, rgba(168,85,247,.25) 0, transparent 50%)',
        'aurora-green': 'radial-gradient(at 20% 10%, rgba(16,185,129,.35) 0, transparent 50%), radial-gradient(at 85% 20%, rgba(132,204,22,.35) 0, transparent 50%), radial-gradient(at 50% 95%, rgba(20,184,166,.25) 0, transparent 50%)',
        'aurora-orange': 'radial-gradient(at 15% 15%, rgba(251,146,60,.35) 0, transparent 50%), radial-gradient(at 85% 20%, rgba(244,114,182,.30) 0, transparent 50%), radial-gradient(at 50% 95%, rgba(250,204,21,.25) 0, transparent 50%)',
        'aurora-violet': 'radial-gradient(at 20% 10%, rgba(167,139,250,.35) 0, transparent 50%), radial-gradient(at 80% 20%, rgba(236,72,153,.30) 0, transparent 50%), radial-gradient(at 50% 95%, rgba(99,102,241,.25) 0, transparent 50%)',
        'aurora-rose': 'radial-gradient(at 20% 10%, rgba(244,114,182,.30) 0, transparent 50%), radial-gradient(at 80% 20%, rgba(251,113,133,.30) 0, transparent 50%), radial-gradient(at 50% 95%, rgba(236,72,153,.20) 0, transparent 50%)',
      },
      boxShadow: {
        soft: '0 2px 8px -2px rgba(15,18,32,.06), 0 8px 32px -8px rgba(15,18,32,.10)',
        glow: '0 0 0 1px rgba(255,255,255,.4) inset, 0 8px 30px -10px rgba(99,102,241,.45)',
      },
      borderRadius: {
        '4xl': '2rem',
      },
      animation: {
        'float': 'float 8s ease-in-out infinite',
        'blob': 'blob 14s ease-in-out infinite',
        'shimmer': 'shimmer 2.4s linear infinite',
        'pop': 'pop .35s cubic-bezier(.18,.89,.32,1.28)',
      },
      keyframes: {
        float: {
          '0%, 100%': { transform: 'translateY(0px)' },
          '50%': { transform: 'translateY(-12px)' },
        },
        blob: {
          '0%, 100%': { transform: 'translate(0px, 0px) scale(1)' },
          '33%': { transform: 'translate(30px, -50px) scale(1.1)' },
          '66%': { transform: 'translate(-20px, 20px) scale(.9)' },
        },
        shimmer: {
          '0%': { backgroundPosition: '-1000px 0' },
          '100%': { backgroundPosition: '1000px 0' },
        },
        pop: {
          '0%': { transform: 'scale(.92)', opacity: '0' },
          '100%': { transform: 'scale(1)', opacity: '1' },
        },
      },
    },
  },
  plugins: [],
}
