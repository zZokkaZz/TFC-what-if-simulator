import { defineConfig } from 'vitest/config';
import { viteSingleFile } from 'vite-plugin-singlefile';

// Build ra MỘT file dist/index.html tự chứa (JS, CSS, dữ liệu inline) để mở bằng file://
export default defineConfig({
  base: './',
  plugins: [viteSingleFile()],
  esbuild: { jsx: 'automatic', jsxImportSource: 'preact' },
  build: { outDir: 'dist', emptyOutDir: true, assetsInlineLimit: 100_000_000, cssCodeSplit: false },
  test: { include: ['tests/**/*.test.ts'] },
});
