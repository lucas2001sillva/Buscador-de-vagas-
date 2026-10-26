import http from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { dirname, extname, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createApiHandler } from './app.js';
import { createJobsService } from './jobs.js';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const production = process.argv.includes('--production');
const api = createApiHandler(createJobsService());
const mime = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.svg': 'image/svg+xml', '.json': 'application/json' };
const vite = production ? null : await (await import('vite')).createServer({ root, server: { middlewareMode: true }, appType: 'spa' });
if (production) await stat(resolve(root, 'dist/index.html'));

const server = http.createServer(async (req, res) => {
  try {
    if (await api(req, res)) return;
    if (vite) return vite.middlewares(req, res);
    const pathname = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
    const dist = resolve(root, 'dist');
    let file = resolve(dist, `.${pathname}`);
    if (!file.startsWith(dist + sep)) file = resolve(dist, 'index.html');
    try { if (!(await stat(file)).isFile()) throw new Error(); }
    catch {
      if (extname(pathname)) { res.writeHead(404); res.end('Arquivo não encontrado'); return; }
      file = resolve(dist, 'index.html');
    }
    const content = await readFile(file);
    res.setHeader('Content-Type', mime[extname(file)] || 'application/octet-stream');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.end(content);
  } catch {
    res.writeHead(500); res.end('Erro ao processar a solicitação');
  }
});
const port = Number(process.env.PORT || 3000);
server.listen(port, '0.0.0.0', () => console.log(`Próxima Vaga iniciado na porta ${port} (${production ? 'produção' : 'desenvolvimento'})`));
async function close() {
  const timeout = setTimeout(() => process.exit(1), 5000);
  timeout.unref();
  await vite?.close();
  server.close(() => process.exit(0));
  server.closeIdleConnections();
}
process.on('SIGINT', close);
process.on('SIGTERM', close);
