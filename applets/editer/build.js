import { build } from 'esbuild';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const buildOptions = {
  entryPoints: ['frontend/editer.js'],
  bundle: true,
  outfile: 'dist/editer.bundle.js',
  format: 'esm',
  minify: true,
  sourcemap: true,
  resolveExtensions: ['.js', '.ts'],
  external: [
    '/view/applets/navigater/frontend/navigater.js',
    '/view/applets/shared/file-types-config.js',
    '/view/applets/editer/monaco-editor/esm/vs/editor/editor.main.js',
    '/view/scripts/marked.esm.js'
  ],
};

async function buildEditer() {
  try {
    await build(buildOptions);
    console.log('✅ Build completed successfully!');
  } catch (error) {
    console.error('❌ Build failed:', error);
    process.exit(1);
  }
}

buildEditer();