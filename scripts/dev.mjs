// Geliştirme modu: Vite sunucusunu başlatır, main/preload'u derler ve Electron'u açar.
import { createServer } from 'vite';
import { build } from 'esbuild';
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import { serverEnv } from './server-env.mjs';

const require = createRequire(import.meta.url);
const electronPath = require('electron');

const server = await createServer({ configFile: 'vite.config.mts' });
await server.listen();
const url = server.resolvedUrls.local[0];

const common = { bundle: true, platform: 'node', target: 'node22', format: 'cjs', sourcemap: 'inline', external: ['electron', 'sql.js', 'exceljs'], define: { 'process.env.EROMEC_SUPABASE_URL': JSON.stringify(serverEnv().url) } };
await build({ ...common, entryPoints: ['src/main/main.ts'], outfile: 'dist-electron/main.js' });
await build({ ...common, entryPoints: ['src/main/preload.ts'], outfile: 'dist-electron/preload.js' });

const child = spawn(electronPath, ['.', ...process.argv.slice(2)], { stdio: 'inherit', env: { ...process.env, VITE_DEV_SERVER_URL: url } });
child.on('close', async (code) => {
  await server.close();
  process.exit(code ?? 0);
});
