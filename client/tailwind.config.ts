import type { Config } from 'tailwindcss';

export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        page:    'rgb(var(--color-page)    / <alpha-value>)',
        surface: 'rgb(var(--color-surface) / <alpha-value>)',
        ink:     'rgb(var(--color-ink)     / <alpha-value>)',
        muted:   'rgb(var(--color-muted)   / <alpha-value>)',
        line:    'rgb(var(--color-line)    / <alpha-value>)',
        green: {
          DEFAULT: 'rgb(var(--color-green)      / <alpha-value>)',
          soft:    'rgb(var(--color-green-soft)  / <alpha-value>)',
        },
        red: {
          DEFAULT: 'rgb(var(--color-red)      / <alpha-value>)',
          soft:    'rgb(var(--color-red-soft)  / <alpha-value>)',
        },
        gold: {
          DEFAULT: 'rgb(var(--color-gold)      / <alpha-value>)',
          soft:    'rgb(var(--color-gold-soft)  / <alpha-value>)',
        },
        blue: {
          DEFAULT: 'rgb(var(--color-blue)      / <alpha-value>)',
          soft:    'rgb(var(--color-blue-soft)  / <alpha-value>)',
        },
      },
      fontFamily: {
        sans:    ['DM Sans',          'ui-sans-serif',  'system-ui', 'sans-serif'],
        mono:    ['"JetBrains Mono"', 'ui-monospace',   'monospace'],
        display: ['Syne',             'ui-sans-serif',  'system-ui', 'sans-serif'],
      },
      boxShadow: {
        panel: 'var(--shadow-panel)',
      },
      borderRadius: {
        '4xl': '2rem',
      },
    },
  },
  plugins: [],
} satisfies Config;
