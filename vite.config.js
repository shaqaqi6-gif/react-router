import { defineConfig } from 'vite';

export default defineConfig({
  // الجذر هو مجلد المشروع؛ index.html هو نقطة الدخول
  build: {
    outDir: 'dist',
    target: 'es2018',
    chunkSizeWarningLimit: 2500, // البيانات المرجعية كبيرة (data.js)
  },
});
