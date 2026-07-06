/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      fontFamily: {
        sans: ['DM Sans', 'sans-serif'],
        mono: ['DM Mono', 'monospace'],
        display: ['Fraunces', 'serif'],
      },
      colors: {
        bg: '#0a0f1e',
        surface: '#111827',
        surface2: '#1a2235',
        surface3: '#1f2d44',
        border: '#1e3050',
        border2: '#2a4060',
        accent: {
          DEFAULT: '#3b82f6',
          light: '#60a5fa',
        },
      },
    },
  },
  plugins: [],
}
