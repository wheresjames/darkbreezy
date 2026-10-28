#!/usr/bin/env node
// A development server for web/ (or dist/web): node scripts/serve.mjs [dir] [port].
// Unlike `python3 -m http.server`, it tells browsers to check every file
// before reusing it (Cache-Control: no-cache, with ETags), so a phone on
// the network never runs a mix of old and new files after an edit. Listens
// on every interface, so phones on the same network can reach it.

import { createServer } from 'node:http';
import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import { extname, join, resolve, sep } from 'node:path';
import { networkInterfaces } from 'node:os';

const root = resolve(process.argv[2] || 'web');
const port = Number(process.argv[3] || process.env.PORT || 8000);

const TYPES = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8', '.webmanifest': 'application/manifest+json',
  '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.ico': 'image/x-icon', '.txt': 'text/plain; charset=utf-8',
  '.woff2': 'font/woff2', '.gz': 'application/gzip',
};

createServer(async (req, res) => {
  let path;
  try { path = decodeURIComponent(new URL(req.url, 'http://x').pathname); } catch { res.writeHead(400).end(); return; }
  let file = resolve(join(root, path));
  if (file !== root && !file.startsWith(root + sep)) { res.writeHead(403).end(); return; }
  try {
    let info = await stat(file);
    if (info.isDirectory()) { file = join(file, 'index.html'); info = await stat(file); }
    const etag = `"${info.size.toString(36)}-${Math.floor(info.mtimeMs).toString(36)}"`;
    const headers = {
      'Content-Type': TYPES[extname(file).toLowerCase()] || 'application/octet-stream',
      'Cache-Control': 'no-cache',
      ETag: etag,
      'X-Content-Type-Options': 'nosniff',
    };
    if (req.headers['if-none-match'] === etag) { res.writeHead(304, headers).end(); return; }
    res.writeHead(200, { ...headers, 'Content-Length': info.size });
    if (req.method === 'HEAD') { res.end(); return; }
    createReadStream(file).pipe(res);
  } catch {
    // The site's not-found page, as a host would send it (server.json's notFound).
    try {
      const page = join(root, '404.html');
      await stat(page);
      res.writeHead(404, { 'Content-Type': TYPES['.html'], 'Cache-Control': 'no-cache' });
      createReadStream(page).pipe(res);
    } catch {
      res.writeHead(404, { 'Content-Type': 'text/plain', 'Cache-Control': 'no-cache' }).end('Not found');
    }
  }
}).listen(port, '0.0.0.0', () => {
  const lan = Object.values(networkInterfaces()).flat().filter((a) => a && a.family === 'IPv4' && !a.internal).map((a) => a.address);
  console.log(`Serving ${root} with Cache-Control: no-cache`);
  console.log(`  http://localhost:${port}/`);
  for (const ip of lan) console.log(`  http://${ip}:${port}/  (phones on this network)`);
});
