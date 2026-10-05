/** Wasaly Luxe tokens — shared with DESIGN.md (D:\wasaly-study\DESIGN.md) */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        primary: '#FF6B00',
        brand: {
          50: '#FFF3EA', 100: '#FFE4CC', 200: '#FFC999', 300: '#FFA866', 400: '#FF8A33',
          500: '#FF6B00', 600: '#E85F00', 700: '#C24E00', coral: '#F53B57', sun: '#FF8A00',
        },
        ink: { DEFAULT: '#14142B', 2: '#4E4B66', 3: '#8A8FA3', 4: '#B4B8C7' },
        surface: { DEFAULT: '#F6F7FB', card: '#FFFFFF', sunken: '#F1F2F7', line: '#ECEEF4' },
        ok: '#1DB954', warn: '#FFB020', bad: '#F04438', info: '#2E90FA',
        night: { DEFAULT: '#0F0F1A', 2: '#16161F', 3: '#1E1E2A' },
      },
      fontFamily: { sans: ['Tajawal', 'Segoe UI', 'system-ui', '-apple-system', 'sans-serif'] },
      borderRadius: { 'r1': '10px', 'r2': '14px', 'r3': '18px', 'r4': '24px', 'r5': '32px' },
      boxShadow: {
        soft: '0 1px 2px rgba(20,20,43,.04), 0 2px 8px rgba(20,20,43,.05)',
        card: '0 1px 2px rgba(20,20,43,.04), 0 8px 24px rgba(20,20,43,.07)',
        lift: '0 2px 6px rgba(20,20,43,.05), 0 18px 40px rgba(20,20,43,.12)',
        float: '0 14px 32px rgba(255,107,0,.28)',
        brand: '0 10px 28px rgba(245,59,87,.30), 0 3px 8px rgba(255,107,0,.22)',
        ring: '0 0 0 4px rgba(255,138,30,.16)',
      },
      transitionTimingFunction: {
        lux: 'cubic-bezier(.2,.8,.2,1)',
        spring: 'cubic-bezier(.34,1.36,.64,1)',
      },
      keyframes: {
        fadeUp: { from: { opacity: 0, transform: 'translateY(10px)' }, to: { opacity: 1, transform: 'none' } },
        fadeIn: { from: { opacity: 0 }, to: { opacity: 1 } },
        pop: { '0%': { opacity: 0, transform: 'scale(.92)' }, '100%': { opacity: 1, transform: 'none' } },
        pulseRing: { '0%': { transform: 'scale(.6)', opacity: .7 }, '100%': { transform: 'scale(2.4)', opacity: 0 } },
        float: { '0%,100%': { transform: 'translateY(0)' }, '50%': { transform: 'translateY(-10px)' } },
        drift: { '0%,100%': { transform: 'translate(0,0) scale(1)' }, '50%': { transform: 'translate(30px,-20px) scale(1.08)' } },
      },
      animation: {
        'fade-up': 'fadeUp .45s cubic-bezier(.2,.8,.2,1) both',
        'fade-in': 'fadeIn .2s ease both',
        pop: 'pop .35s cubic-bezier(.34,1.36,.64,1) both',
        'pulse-ring': 'pulseRing 1.8s cubic-bezier(.2,.8,.2,1) infinite',
        float: 'float 6s ease-in-out infinite',
        drift: 'drift 14s ease-in-out infinite',
      },
    },
  },
  plugins: [],
};
