/** @type {import('tailwindcss').Config} */
// Semantic colours come from CSS variables (src/index.css), so light and dark mode switch in one place.
const v = (name) => `rgb(var(--${name}) / <alpha-value>)`;

export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  darkMode: 'class',
  theme: {
    extend: {
      fontFamily: {
        sans: ['Inter', 'ui-sans-serif', 'system-ui', '-apple-system', 'Segoe UI', 'Roboto', 'sans-serif'],
        display: ['"Plus Jakarta Sans"', 'Inter', 'ui-sans-serif', 'system-ui', 'sans-serif'],
      },
      colors: {
        // brand (fixed)
        barca: {
          navy: '#004D98', 'navy-dark': '#003875', 'navy-deep': '#002A5C', 'navy-light': '#EBF2FC',
          red: '#A50044', 'red-light': '#FBEBF2', gold: '#EDBB00', 'gold-light': '#FDF9E3',
        },
        // semantic (theme-aware)
        canvas: v('canvas'),        // page background
        surface: v('surface'),      // cards
        'surface-2': v('surface-2'),// subtle fills, inputs, tracks
        line: v('line'),            // borders, dividers
        ink: v('ink'),              // primary text
        'ink-2': v('ink-2'),        // secondary text
        'ink-3': v('ink-3'),        // muted text, captions
        brand: v('brand'),          // primary actions, active states
        'brand-soft': v('brand-soft'),
        'brand-ink': v('brand-ink'),// text on brand-soft
        accent: v('accent'),        // gold: XP, streak, highlights
        'accent-soft': v('accent-soft'),
        good: v('good'), 'good-soft': v('good-soft'),
        warn: v('warn'), 'warn-soft': v('warn-soft'),
        bad: v('bad'), 'bad-soft': v('bad-soft'),
      },
      boxShadow: {
        soft: '0 1px 2px rgb(16 24 40 / 0.04), 0 1px 3px rgb(16 24 40 / 0.06)',
        lift: '0 6px 16px rgb(16 24 40 / 0.08), 0 2px 4px rgb(16 24 40 / 0.04)',
        glow: '0 0 0 4px rgb(var(--brand) / 0.15)',
      },
      borderRadius: { '4xl': '2rem' },
      keyframes: {
        'fade-in': { from: { opacity: 0 }, to: { opacity: 1 } },
        'slide-up': { from: { opacity: 0, transform: 'translateY(8px)' }, to: { opacity: 1, transform: 'translateY(0)' } },
        'slide-in-right': { from: { opacity: 0, transform: 'translateX(16px)' }, to: { opacity: 1, transform: 'translateX(0)' } },
        pop: { '0%': { transform: 'scale(1)' }, '40%': { transform: 'scale(1.06)' }, '100%': { transform: 'scale(1)' } },
        shake: { '0%,100%': { transform: 'translateX(0)' }, '25%': { transform: 'translateX(-4px)' }, '75%': { transform: 'translateX(4px)' } },
        shimmer: { from: { backgroundPosition: '-200% 0' }, to: { backgroundPosition: '200% 0' } },
        'burst': { '0%': { transform: 'scale(0.6)', opacity: 0 }, '60%': { transform: 'scale(1.1)', opacity: 1 }, '100%': { transform: 'scale(1)', opacity: 1 } },
      },
      animation: {
        'fade-in': 'fade-in 200ms ease-out both',
        'slide-up': 'slide-up 250ms cubic-bezier(.2,.8,.2,1) both',
        'slide-in-right': 'slide-in-right 250ms cubic-bezier(.2,.8,.2,1) both',
        pop: 'pop 300ms ease-out',
        shake: 'shake 250ms ease-in-out',
        shimmer: 'shimmer 1.6s linear infinite',
        burst: 'burst 400ms cubic-bezier(.2,.8,.2,1) both',
      },
    },
  },
  plugins: [],
};
