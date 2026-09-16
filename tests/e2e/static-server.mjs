import { createReadStream } from 'node:fs';
import { readFile, stat } from 'node:fs/promises';
import { createServer } from 'node:http';
import { extname, join, normalize, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(fileURLToPath(new URL('../../', import.meta.url)));
const contentTypes = {
  '.css': 'text/css; charset=utf-8',
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.svg': 'image/svg+xml'
};

function safePath(urlPath) {
  const pathname = decodeURIComponent(String(urlPath || '/').split('?')[0]);
  const relativePath = normalize(pathname).replace(/^[/\\]+/, '');
  const candidate = resolve(root, relativePath);
  return candidate === root || candidate.startsWith(`${root}${sep}`) ? candidate : null;
}

const server = createServer(async (request, response) => {
  try {
    const filePath = safePath(request.url) || join(root, 'index.html');
    const resolvedPath = filePath.endsWith(sep) ? join(filePath, 'index.html') : filePath;
    const info = await stat(resolvedPath);
    if (!info.isFile()) throw new Error('not-file');
    response.writeHead(200, { 'Content-Type': contentTypes[extname(resolvedPath)] || 'application/octet-stream' });
    createReadStream(resolvedPath).pipe(response);
  } catch {
    try {
      const notFound = await readFile(join(root, 'index.html'));
      response.writeHead(404, { 'Content-Type': 'text/html; charset=utf-8' });
      response.end(notFound);
    } catch {
      response.writeHead(500);
      response.end('server error');
    }
  }
});

server.listen(4173, '127.0.0.1', () => {
  process.stdout.write('E2E static server listening on http://127.0.0.1:4173\n');
});
