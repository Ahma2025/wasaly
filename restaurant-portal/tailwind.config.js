// رموز التصميم الموحّدة لوصلّي (D:\wasaly-study\DESIGN.md) — مطابقة لكل التطبيقات الأربعة
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        primary: '#FF6B00',
        brand: {
          50: '#FFF3EA',
          100: '#FFE6D1',
          200: '#FFCBA3',
          300: '#FFA866',
          400: '#FF8A33',
          500: '#FF6B00',
          600: '#E65F00',
          700: '#BF4F00',
          800: '#993F00',
          DEFAULT: '#FF6B00',
        },
        coral: { DEFAULT: '#F53B57', 50: '#FEECEF', 500: '#F53B57' },
        ink: { DEFAULT: '#14142B', 2: '#4E4B66', 3: '#8A8FA3' },
        surface: { DEFAULT: '#F6F7FB', card: '#FFFFFF', line: '#ECEEF4' },
        success: { DEFAULT: '#1DB954', soft: '#E8F8EE' },
        warning: { DEFAULT: '#FFB020', soft: '#FFF6E5' },
        danger: { DEFAULT: '#F04438', soft: '#FEEEED' },
        info: { DEFAULT: '#2E90FA', soft: '#EAF4FF' },
      },
      fontFamily: {
        sans: ['Tajawal', 'Segoe UI', 'system-ui', '-apple-system', 'sans-serif'],
      },
      borderRadius: {
        sm2: '10px',
        md2: '14px',
        lg2: '18px',
        xl2: '24px',
        '4xl': '32px',
      },
      boxShadow: {
        soft: '0 2px 8px rgba(20,20,43,.06)',
        card: '0 8px 24px rgba(20,20,43,.08)',
        float: '0 14px 32px rgba(255,107,0,.28)',
        lift: '0 18px 40px rgba(20,20,43,.12), 0 4px 10px rgba(20,20,43,.05)',
        sheet: '0 -12px 40px rgba(20,20,43,.16)',
      },
      fontSize: {
        micro: ['11px', { lineHeight: '14px', fontWeight: '700' }],
        caption: ['12.5px', { lineHeight: '18px', fontWeight: '500' }],
      },
      transitionTimingFunction: {
        out2: 'cubic-bezier(.2,.8,.2,1)',
        spring: 'cubic-bezier(.34,1.56,.64,1)',
      },
    },
  },
  plugins: [],
};
