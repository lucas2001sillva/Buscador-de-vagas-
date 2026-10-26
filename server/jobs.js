import { SOURCES } from './sources.js';
import { deduplicateJobs } from '../shared/job-identity.js';
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
      state = { jobs, updatedAt: new Date(currentTime).toISOString(), attemptedAt: currentTime, status: 'ok', failureReason: null };
    } catch (error) {
      state = { jobs: previous?.jobs ?? [], updatedAt: previous?.updatedAt ?? null, attemptedAt: currentTime, status: previous?.updatedAt ? 'stale' : error?.code === 'NOT_CONFIGURED' ? 'not_configured' : 'unavailable', failureReason: failureReason(error) };
    }
    states.set(source.id, state);
    return state;
  }
  async function aggregate() {
    const results = await Promise.all(sources.map(refreshSource));
    if (!results.some(result => result.updatedAt !== null)) throw new Error('Todas as fontes de vagas estão indisponíveis');
    const received = results.flatMap(result => result.jobs.map(job => ({ ...job, sourceStale: result.status === 'stale', sourceUpdatedAt: result.updatedAt })));
    const jobs = deduplicateJobs(received);
    return {
      jobs,
      deduplication: { received: received.length, unique: jobs.length, removed: received.length - jobs.length },
      sources: sources.map((source, index) => ({ id: source.id, name: source.name, url: source.url, status: results[index].status, count: jobs.filter(job => job.sourceId === source.id).length, rawCount: results[index].jobs.length, updatedAt: results[index].updatedAt, failureReason: results[index].failureReason })),
      updatedAt: results.map(result => result.updatedAt).filter(Boolean).sort().at(-1),
      stale: results.some(result => result.status === 'stale'), partial: results.some(result => result.status !== 'ok'),
    };
  }
  return function getJobs() {
    if (!inFlight) inFlight = aggregate().finally(() => { inFlight = undefined; });
    return inFlight;
  };
}
