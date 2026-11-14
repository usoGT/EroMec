// Ana süreç (main) ve preload betiğini esbuild ile derler.
import { build, context } from 'esbuild';
import { serverEnv } from './server-env.mjs';

const watch = process.argv.includes('--watch');

const common = {
  bundle: true,
  platform: 'node',
  target: 'node22',
  format: 'cjs',
  sourcemap: watch ? 'inline' : false,
  external: ['electron', 'sql.js', 'exceljs'],
  logLevel: 'info',
  // Ana süreç ağ izni için Supabase adresini bilir (boşsa uygulama tamamen çevrimdışı çalışır).
  define: { 'process.env.EROMEC_SUPABASE_URL': JSON.stringify(serverEnv().url) },
};

const targets = [
  { ...common, entryPoints: ['src/main/main.ts'], outfile: 'dist-electron/main.js' },
  { ...common, entryPoints: ['src/main/preload.ts'], outfile: 'dist-electron/preload.js' },
];

if (watch) {
  for (const t of targets) {
    const ctx = await context(t);
    await ctx.watch();
  }
} else {
  await Promise.all(targets.map((t) => build(t)));
}
