import { SOURCES } from './sources.js';
export const CACHE_TTL = 10 * 60 * 1000;
export const ERROR_RETRY_TTL = 60 * 1000;
export function deduplicateJobs(jobs) {
  const unique = new Map();
  for (const job of jobs) {
    const url = new URL(job.url);
    url.hash = '';
    for (const key of [...url.searchParams.keys()]) if (key.startsWith('utm_') || key === 'source') url.searchParams.delete(key);
    const key = url.href.replace(/\/$/, '');
    if (!unique.has(key)) unique.set(key, job);
  }
  return [...unique.values()].sort((a, b) => (Date.parse(b.publishedAt) || 0) - (Date.parse(a.publishedAt) || 0));
}
export function createJobsService({ fetchImpl = fetch, now = Date.now, sources = SOURCES } = {}) {
  const states = new Map();
  let inFlight;
  async function refreshSource(source) {
    const previous = states.get(source.id);
    const currentTime = now();
    if (previous && currentTime - previous.attemptedAt < (previous.status === 'ok' ? CACHE_TTL : ERROR_RETRY_TTL)) return previous;
    let state;
    try {
      const jobs = await source.load({ fetchImpl, now: currentTime });
      if (!Array.isArray(jobs)) throw new Error('Formato de vagas inválido');
      state = { jobs, updatedAt: new Date(currentTime).toISOString(), attemptedAt: currentTime, status: 'ok' };
    } catch {
      state = { jobs: previous?.jobs ?? [], updatedAt: previous?.updatedAt ?? null, attemptedAt: currentTime, status: previous?.updatedAt ? 'stale' : 'unavailable' };
    }
    states.set(source.id, state);
    return state;
  }
  async function aggregate() {
    const results = await Promise.all(sources.map(refreshSource));
    if (!results.some(result => result.updatedAt !== null)) throw new Error('Todas as fontes de vagas estão indisponíveis');
    return {
      jobs: deduplicateJobs(results.flatMap(result => result.jobs.map(job => ({ ...job, sourceStale: result.status === 'stale', sourceUpdatedAt: result.updatedAt })))),
      sources: sources.map((source, index) => ({ id: source.id, name: source.name, url: source.url, status: results[index].status, count: results[index].jobs.length, updatedAt: results[index].updatedAt })),
      updatedAt: results.map(result => result.updatedAt).filter(Boolean).sort().at(-1),
      stale: results.some(result => result.status === 'stale'), partial: results.some(result => result.status !== 'ok'),
    };
  }
  return function getJobs() {
    if (!inFlight) inFlight = aggregate().finally(() => { inFlight = undefined; });
    return inFlight;
  };
}
