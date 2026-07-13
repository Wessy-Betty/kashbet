/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      fontFamily: {
        sans: ['Inter', 'sans-serif'],
        mono: ['DM Mono', 'monospace'],
        display: ['Poppins', 'sans-serif'],
      },
      colors: {
        bg: '#0b0b0c',
        surface: '#161617',
        surface2: '#1e1e20',
        surface3: '#27272a',
        border: '#2c2c30',
        border2: '#3c3c42',
        accent: {
          DEFAULT: '#1d7ef4',
          light: '#5aa2f7',
        },
      },
    },
  },
  plugins: [],
}
