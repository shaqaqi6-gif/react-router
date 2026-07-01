import { defineConfig } from 'vite';

export default defineConfig({
  // الجذر هو مجلد المشروع؛ index.html هو نقطة الدخول
  build: {
    outDir: 'dist',
    target: 'esnext', // يدعم top-level await (اختيار مزوّد المصادقة)
    chunkSizeWarningLimit: 2500, // البيانات المرجعية كبيرة (data.js)
  },
});
