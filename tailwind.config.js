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
          50:  'rgb(var(--ink-50) / <alpha-value>)',
          100: 'rgb(var(--ink-100) / <alpha-value>)',
          200: 'rgb(var(--ink-200) / <alpha-value>)',
          300: 'rgb(var(--ink-300) / <alpha-value>)',
          400: 'rgb(var(--ink-400) / <alpha-value>)',
          500: 'rgb(var(--ink-500) / <alpha-value>)',
          600: 'rgb(var(--ink-600) / <alpha-value>)',
          700: 'rgb(var(--ink-700) / <alpha-value>)',
          800: 'rgb(var(--ink-800) / <alpha-value>)',
          900: 'rgb(var(--ink-900) / <alpha-value>)',
          950: 'rgb(6 7 15 / <alpha-value>)',
        },
        theme: {
          DEFAULT: 'rgb(var(--theme-primary-rgb) / <alpha-value>)',
          soft: 'rgb(var(--theme-primary-soft-rgb) / <alpha-value>)',
          deep: 'rgb(var(--theme-primary-deep-rgb) / <alpha-value>)',
          secondary: 'rgb(var(--theme-secondary-rgb) / <alpha-value>)',
          accent: 'rgb(var(--theme-accent-rgb) / <alpha-value>)',
        },
      },
      boxShadow: {
        soft: '0 2px 8px -2px rgba(15,18,32,.06), 0 8px 32px -8px rgba(15,18,32,.10)',
        glow: '0 0 0 1px rgba(255,255,255,.4) inset, 0 8px 30px -10px rgb(var(--theme-primary-rgb) / 0.45)',
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
