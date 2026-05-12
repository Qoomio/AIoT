import { build } from 'vite';
import { defineConfig } from 'vite';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const viteConfig = defineConfig({
  build: {
    lib: {
      entry: 'frontend/editer.js',
      name: 'Editer',
      fileName: 'editer.bundle',
      formats: ['es']
    },
    rollupOptions: {
      external: [
        '/view/applets/navigator/frontend/navigator.js',
        '/view/applets/shared/file-types-config.js',
        '/view/applets/shared/marked.esm.js'
      ],
      output: {
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
    chunkSizeWarningLimit: 10000
  },
  css: {
    extract: true
  },
  resolve: {
    alias: {
      'monaco-editor': path.resolve(__dirname, 'monaco-editor/esm/vs/editor/editor.main.js'),
      '/view/applets/editer/monaco-editor/esm/vs/editor/editor.main.js': path.resolve(__dirname, 'monaco-editor/esm/vs/editor/editor.main.js')
    }
  },
  optimizeDeps: {
    include: ['monaco-editor']
  }
});

async function buildEditer() {
  try {
    await build(viteConfig);
    console.log('✅ Vite build completed successfully!');
    console.log('📦 Monaco Editor bundled into single file');
  } catch (error) {
    console.error('❌ Vite build failed:', error);
    process.exit(1);
  }
}

buildEditer();