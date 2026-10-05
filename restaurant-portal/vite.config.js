import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  // مسارات نسبية: تعمل داخل تطبيق Capacitor وعند الاستضافة تحت /portal على السيرفر
  base: './',
  plugins: [react()],
  server: { port: 3002, proxy: { '/api': 'http://localhost:5000' } },
  build: { chunkSizeWarningLimit: 1500 },
});
