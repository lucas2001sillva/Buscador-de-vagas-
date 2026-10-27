import { normalizeSearch } from '../shared/search.js';

export function createApiHandler(getJobs) {
  return async function handleApi(req, res) {
    const url = new URL(req.url, 'http://localhost');
    const pathname = url.pathname;
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
      try {
        const search = normalizeSearch({ query: url.searchParams.get('q') || '', location: url.searchParams.get('location') || '', page: url.searchParams.get('page') || 0 });
        res.end(JSON.stringify(await getJobs(search)));
      }
      catch (error) {
        res.statusCode = error.status === 400 ? 400 : 502;
        res.end(JSON.stringify({ error: error.status === 400 ? 'Pesquisa inválida. Reduza o texto ou reinicie a busca.' : 'Não foi possível consultar as fontes de vagas. Tente novamente em alguns instantes.' }));
      }
    } else {
      res.statusCode = 404;
      res.end(JSON.stringify({ error: 'Rota não encontrada' }));
    }
    return true;
  };
}
