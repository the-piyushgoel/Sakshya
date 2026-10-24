/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        navy: {
          50: '#f0f1f4',
          100: '#dce0e8',
          600: '#334a68',
          700: '#253b59',
          800: '#192e49',
          900: '#12223a',
        },
        saffron: '#d8a83f',
        trust: {
          claimed: '#68758a',
          attested: '#b7791f',
          confirmed: '#23845b',
        },
      },
      boxShadow: {
        soft: '0 12px 34px rgba(19, 44, 67, 0.08)',
      },
    },
  },
  plugins: [],
};
