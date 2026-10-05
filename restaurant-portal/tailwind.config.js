export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        // لون العلامة الموحّد لوصلّي (#FF6B00) مع درجاته
        primary: '#FF6B00',
        brand: {
          50: '#FFF4EB',
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
        ink: '#1A1A2E',
      },
    },
  },
  plugins: [],
};
