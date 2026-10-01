import { build as esbuild } from 'esbuild';
import { build as vite } from 'vite';
import { mkdir } from 'node:fs/promises';
await mkdir('dist-electron', { recursive: true });
for (const [entry, outfile, platform] of [
  ['src/main/index.ts', 'dist-electron/main.cjs', 'node'],
  ['src/preload/index.ts', 'dist-electron/preload.cjs', 'node']
]) {
  await esbuild({ entryPoints: [entry], outfile, bundle: true, platform, format: 'cjs', target: 'node24', external: ['electron', 'better-sqlite3'], sourcemap: false, minify: true });
}
await vite();
