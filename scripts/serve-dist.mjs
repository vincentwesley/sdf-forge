// Serve dist/ under /sdf-forge/ (the GitHub Pages subpath) for tests and local previews.
import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';

const PORT = Number(process.env.PORT ?? 4173);
const BASE = '/sdf-forge/';
const ROOT = 'dist';
const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript',
  '.css': 'text/css',
  '.wasm': 'application/wasm',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.webp': 'image/webp',
  '.woff2': 'font/woff2',
  '.json': 'application/json',
  '.webmanifest': 'application/manifest+json',
};

createServer(async (req, res) => {
  const url = new URL(req.url ?? '/', 'http://x');
  if (url.pathname === '/' || url.pathname === '/sdf-forge') {
    res.writeHead(302, { location: BASE });
    return res.end();
  }
  if (!url.pathname.startsWith(BASE)) {
    res.writeHead(404);
    return res.end('not found');
  }
  let rel = decodeURIComponent(url.pathname.slice(BASE.length)) || 'index.html';
  const file = normalize(join(ROOT, rel));
  if (!file.startsWith(ROOT)) {
    res.writeHead(403);
    return res.end();
  }
  try {
    const s = await stat(file);
    const path = s.isDirectory() ? join(file, 'index.html') : file;
    const body = await readFile(path);
    res.writeHead(200, { 'content-type': TYPES[extname(path)] ?? 'application/octet-stream' });
    res.end(body);
  } catch {
    res.writeHead(404);
    res.end('not found');
  }
}).listen(PORT, () => console.log(`serving dist at http://localhost:${PORT}${BASE}`));
