export function createApiHandler(getJobs) {
  return async function handleApi(req, res) {
    const pathname = new URL(req.url, 'http://localhost').pathname;
    if (!pathname.startsWith('/api/')) return false;
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    if (req.method !== 'GET') {
      res.writeHead(405, { Allow: 'GET' });
      res.end(JSON.stringify({ error: 'Método não permitido' }));
    } else if (pathname === '/api/health') {
      res.end(JSON.stringify({ status: 'ok' }));
    } else if (pathname === '/api/jobs') {
      try { res.end(JSON.stringify(await getJobs())); }
      catch {
        res.statusCode = 502;
        res.end(JSON.stringify({ error: 'Não foi possível consultar as fontes de vagas. Tente novamente em alguns instantes.' }));
      }
    } else {
      res.statusCode = 404;
      res.end(JSON.stringify({ error: 'Rota não encontrada' }));
    }
    return true;
  };
}
