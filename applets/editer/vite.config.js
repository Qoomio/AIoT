import { defineConfig } from 'vite';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export default defineConfig({
  build: {
    lib: {
      entry: 'frontend/editer.js',
      name: 'Editer',
      fileName: 'editer.bundle',
      formats: ['es']
    },
    rollupOptions: {
      external: [
        '/view/applets/navigater/frontend/navigater.js',
        '/view/applets/shared/file-types-config.js',
        '/view/applets/shared/marked.esm.js'
      ],
      output: {
        // CSS를 별도 파일로 추출
        assetFileNames: (assetInfo) => {
          if (assetInfo.name && assetInfo.name.endsWith('.css')) {
            return 'monaco-editor.css';
          }
          return 'assets/[name]-[hash][extname]';
        },
        // 모든 모듈을 단일 파일로 번들링
        manualChunks: () => 'everything'
      }
    },
    outDir: 'dist',
    emptyOutDir: true,
    // Monaco Editor를 번들에 포함
    commonjsOptions: {
      include: [/monaco-editor/, /node_modules/]
    },
    // 라즈베리파이 최적화
    minify: 'terser',
    terserOptions: {
      compress: {
        drop_console: true,
        drop_debugger: true,
        pure_funcs: ['console.log']
      }
    },
    chunkSizeWarningLimit: 10000,
    // 라즈베리파이를 위한 추가 최적화
    target: 'es2015',
    cssCodeSplit: false
  },
  css: {
    // CSS를 별도 파일로 추출
    extract: true
  },
  resolve: {
    alias: {
      // Monaco Editor 경로 별칭 설정
      'monaco-editor': path.resolve(__dirname, 'monaco-editor/esm/vs/editor/editor.main.js'),
      '/view/applets/editer/monaco-editor/esm/vs/editor/editor.main.js': path.resolve(__dirname, 'monaco-editor/esm/vs/editor/editor.main.js')
    }
  },
  optimizeDeps: {
    // Monaco Editor를 미리 번들링
    include: ['monaco-editor']
  }
});