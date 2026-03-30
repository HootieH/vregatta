import * as esbuild from 'esbuild';
import { cpSync, mkdirSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

const watch = process.argv.includes('--watch');

const copyStaticFiles = {
  name: 'copy-static',
  setup(build) {
    build.onEnd(() => {
      mkdirSync('dist/popup', { recursive: true });
      mkdirSync('dist/icons', { recursive: true });
      cpSync('src/manifest.json', 'dist/manifest.json', { force: true });
      cpSync('src/popup/popup.html', 'dist/popup/popup.html', { force: true });
      cpSync('src/popup/popup.css', 'dist/popup/popup.css', { force: true });
      cpSync('src/popup/help.html', 'dist/popup/help.html', { force: true });
      cpSync('src/icons', 'dist/icons', { recursive: true, force: true });
      // Dashboard static files
      mkdirSync('dist/dashboard', { recursive: true });
      cpSync('src/dashboard/dashboard.html', 'dist/dashboard/dashboard.html', { force: true });
      cpSync('src/dashboard/dashboard.css', 'dist/dashboard/dashboard.css', { force: true });
      // Leaflet CSS
      cpSync(resolve(__dirname, 'node_modules/leaflet/dist/leaflet.css'), 'dist/dashboard/leaflet.css', { force: true });
      // Rules page static files
      mkdirSync('dist/rules', { recursive: true });
      cpSync('src/rules/rule-page.html', 'dist/rules/rule-page.html', { force: true });
      cpSync('src/rules/rule-page.css', 'dist/rules/rule-page.css', { force: true });
    });
  },
};

const sharedOptions = {
  bundle: true,
  target: 'chrome120',
  sourcemap: true,
  plugins: [copyStaticFiles],
  external: ['zlib'], // Node-only import in colyseus/decoder.js, guarded by typeof require check
};

// Background and popup use ESM
const esmBuild = {
  ...sharedOptions,
  entryPoints: ['src/background.js', 'src/popup/popup.js', 'src/dashboard/dashboard.js', 'src/rules/rule-page.js'],
  outdir: 'dist',
  format: 'esm',
};

// Content script and injected script use IIFE (run in page context)
const iifeBuild = {
  ...sharedOptions,
  entryPoints: ['src/content.js', 'src/injected.js'],
  outdir: 'dist',
  format: 'iife',
  plugins: [copyStaticFiles],
};

if (watch) {
  const ctx1 = await esbuild.context(esmBuild);
  const ctx2 = await esbuild.context(iifeBuild);
  await Promise.all([ctx1.watch(), ctx2.watch()]);
  console.log('Watching for changes...');
} else {
  await esbuild.build(esmBuild);
  await esbuild.build(iifeBuild);
  console.log('Build complete.');
}
