import { SOURCES } from './sources.js';
import { deduplicateJobs } from '../shared/job-identity.js';
import { normalizeSearch, searchKey, MAX_SEARCH_PAGE } from '../shared/search.js';
export { deduplicateJobs } from '../shared/job-identity.js';
export const CACHE_TTL = 10 * 60 * 1000;
export const ERROR_RETRY_TTL = 60 * 1000;
function failureReason(error) {
  if (error?.code === 'NOT_CONFIGURED') return 'NOT_CONFIGURED';
  if (Number.isInteger(error?.status) && error.status >= 100 && error.status <= 599) return `HTTP_${error.status}`;
  if (error?.name === 'TimeoutError' || error?.name === 'AbortError') return 'TIMEOUT';
  if (error?.cause?.code) return 'NETWORK_ERROR';
  return 'FORMAT_OR_SOURCE_ERROR';
}
export function createJobsService({ fetchImpl = fetch, now = Date.now, sources = SOURCES } = {}) {
  const searches = new Map();
  function contextFor(search) {
    const key = searchKey(search);
    let context = searches.get(key);
    if (!context) context = { states: new Map(), inFlight: new Map(), usedAt: now() };
    searches.delete(key); searches.set(key, context); context.usedAt = now();
    // Limita memória sem misturar resultados ou cache entre cargos e cidades diferentes.
    if (searches.size > 30) {
      for (const [oldKey, old] of searches) {
        if (!old.inFlight.size && oldKey !== key) { searches.delete(oldKey); break; }
      }
    }
    return context;
  }
  async function refreshSource(source, context, search, page) {
    const key = `${source.id}:${page}`;
    const previous = context.states.get(key);
    const currentTime = now();
    if (previous && currentTime - previous.attemptedAt < (previous.status === 'ok' ? CACHE_TTL : ERROR_RETRY_TTL)) return previous;
    const priorPage = page > 0 ? context.states.get(`${source.id}:${page - 1}`) : null;
    if (priorPage && !priorPage.hasMore) {
      const exhausted = { ...priorPage, jobs: [], hasMore: false };
      context.states.set(key, exhausted);
      return exhausted;
    }
    let state;
    try {
      const result = await source.load({ fetchImpl, now: currentTime, ...search, page });
      const jobs = Array.isArray(result) ? result : result?.jobs;
      if (!Array.isArray(jobs)) throw new Error('Formato de vagas inválido');
      state = { jobs, hasMore: Boolean(result.hasMore), updatedAt: new Date(currentTime).toISOString(), attemptedAt: currentTime, status: result.partial ? 'partial' : 'ok', failureReason: result.partial ? 'PARTIAL_PAGES' : null };
    } catch (error) {
      state = { jobs: previous?.jobs ?? [], hasMore: true, updatedAt: previous?.updatedAt ?? null, attemptedAt: currentTime, status: previous?.updatedAt ? 'stale' : error?.code === 'NOT_CONFIGURED' ? 'not_configured' : 'unavailable', failureReason: failureReason(error) };
    }
    context.states.set(key, state);
    return state;
  }
  async function aggregate(context, search) {
    // Carrega cada próximo lote só após o anterior, respeitando o esgotamento de cada fonte.
    const pages = [];
    for (let page = 0; page <= search.page; page++) {
      let pending = context.inFlight.get(page);
      if (!pending) {
        pending = Promise.all(sources.map(source => refreshSource(source, context, search, page))).finally(() => context.inFlight.delete(page));
        context.inFlight.set(page, pending);
      }
      pages.push(await pending);
    }
    const results = sources.map((_, index) => pages.map(page => page[index]));
    if (!results.flat().some(result => result.updatedAt !== null)) throw new Error('Todas as fontes de vagas estão indisponíveis');
    const received = results.flatMap(pages => pages.flatMap(result => result.jobs.map(job => ({ ...job, sourceStale: result.status === 'stale', sourceUpdatedAt: result.updatedAt }))));
    // URLs repetidas na paginação não são contadas como novos anúncios recebidos.
    const byId = [...new Map(received.map(job => [job.id, job])).values()];
    const jobs = deduplicateJobs(byId);
    const sourceStates = results.map(pages => {
      const failed = pages.find(result => result.status !== 'ok');
      return { ...pages.at(-1), status: failed?.status || 'ok', failureReason: failed?.failureReason || null, updatedAt: pages.map(result => result.updatedAt).filter(Boolean).sort().at(-1) || null };
    });
    return {
      jobs, search: { query: search.query, location: search.location },
      pagination: { page: search.page, hasMore: search.page < MAX_SEARCH_PAGE && sourceStates.some(result => result.hasMore && result.status !== 'not_configured') },
      deduplication: { received: byId.length, unique: jobs.length, removed: byId.length - jobs.length },
      sources: sources.map((source, index) => ({ id: source.id, name: source.name, url: source.url, status: sourceStates[index].status, count: jobs.filter(job => job.sourceId === source.id).length, rawCount: byId.filter(job => job.sourceId === source.id).length, updatedAt: sourceStates[index].updatedAt, failureReason: sourceStates[index].failureReason })),
      updatedAt: sourceStates.map(result => result.updatedAt).filter(Boolean).sort().at(-1),
      stale: sourceStates.some(result => result.status === 'stale'), partial: sourceStates.some(result => result.status !== 'ok'),
    };
  }
  return function getJobs(options = {}) {
    const search = normalizeSearch(options);
    return aggregate(contextFor(search), search);
  };
}
