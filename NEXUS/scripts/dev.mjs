import { spawn } from 'node:child_process';
import electron from 'electron';
import { build } from 'esbuild';
import { createServer } from 'vite';
const server = await createServer({ server: { port: 5173, strictPort: true } });
await server.listen();
for (const [entry, outfile] of [['src/main/index.ts','dist-electron/main.cjs'],['src/preload/index.ts','dist-electron/preload.cjs']]) {
  await build({ entryPoints: [entry], outfile, bundle: true, platform: 'node', format: 'cjs', target: 'node24', external: ['electron','better-sqlite3'] });
}
const child = spawn(electron, ['.'], { stdio: 'inherit', env: { ...process.env, NEXUS_DEV_URL: 'http://localhost:5173' } });
child.on('exit', async code => { await server.close(); process.exit(code ?? 0); });
