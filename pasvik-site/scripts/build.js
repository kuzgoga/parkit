import { cp, mkdir, rm } from 'node:fs/promises';
import { join } from 'node:path';

const root = join(import.meta.dir, '..');
const out = join(root, 'dist');
await rm(out, { recursive: true, force: true });
await mkdir(join(out, 'static'), { recursive: true });
const result = await Bun.build({
  entrypoints: [join(root, 'static/app.js')],
  outdir: join(out, 'static'),
  target: 'browser',
  define: { __API_URL__: JSON.stringify(Bun.env.API_URL || 'http://localhost:3000/api/v1') },
});
if (!result.success) {
  for (const log of result.logs) console.error(log);
  process.exit(1);
}
await cp(join(root, 'index.html'), join(out, 'index.html'));
await cp(join(root, 'static/styles.css'), join(out, 'static/styles.css'));
await cp(join(root, 'static/pasvik-hero.webp'), join(out, 'static/pasvik-hero.webp'));
console.log(`Сайт собран: ${out}`);
