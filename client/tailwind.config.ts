import type { Config } from 'tailwindcss';

export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        page: '#f7f6f1',
        surface: '#ffffff',
        ink: '#202124',
        muted: '#6f6b62',
        line: '#ded9cf',
        green: {
          DEFAULT: '#257a5a',
          soft: '#e8f4ee',
        },
        red: {
          DEFAULT: '#b54747',
          soft: '#f8eceb',
        },
        gold: {
          DEFAULT: '#a36f10',
          soft: '#f7efd9',
        },
        blue: {
          DEFAULT: '#2f6fa3',
          soft: '#e8f1f7',
        },
      },
      boxShadow: {
        panel: '0 24px 60px -32px rgba(32, 33, 36, 0.28)',
      },
      borderRadius: {
        '4xl': '2rem',
      },
      fontFamily: {
        sans: ['Inter', 'ui-sans-serif', 'system-ui', '-apple-system', 'BlinkMacSystemFont', '"Segoe UI"', 'sans-serif'],
      },
      fontWeight: {
        heavy: '850',
      },
    },
  },
  plugins: [],
} satisfies Config;
