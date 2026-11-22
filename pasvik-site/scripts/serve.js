import { readFile } from 'node:fs/promises';
import { extname, join, resolve } from 'node:path';

const root = resolve(import.meta.dir, '../dist');
const types = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.webp': 'image/webp' };
const port = Number(Bun.env.FRONTEND_PORT || 8765);
Bun.serve({
  port,
  async fetch(request) {
    const pathname = decodeURIComponent(new URL(request.url).pathname);
    const path = resolve(root, `.${pathname === '/' ? '/index.html' : pathname}`);
    if (!path.startsWith(`${root}/`) && path !== root) return new Response('Forbidden', { status: 403 });
    try {
      return new Response(await readFile(path), { headers: { 'Content-Type': types[extname(path)] || 'application/octet-stream' } });
    } catch {
      return new Response('Not found', { status: 404 });
    }
  },
});
console.log(`Сайт: http://localhost:${port}`);
