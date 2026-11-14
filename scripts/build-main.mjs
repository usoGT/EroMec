// Ana süreç (main) ve preload betiğini esbuild ile derler.
import { build, context } from 'esbuild';

const watch = process.argv.includes('--watch');

const common = {
  bundle: true,
  platform: 'node',
  target: 'node22',
  format: 'cjs',
  sourcemap: watch ? 'inline' : false,
  external: ['electron', 'sql.js', 'exceljs'],
  logLevel: 'info',
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
