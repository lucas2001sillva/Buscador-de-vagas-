export const FEED_URL = 'https://www.arbeitnow.com/api/job-board-api';
export const CACHE_TTL = 10 * 60 * 1000;

export function plainText(value = '') {
  return String(value)
    .replace(/<(script|style)\b[^>]*>[\s\S]*?<\/\1>/gi, '')
    .replace(/<\/(p|div|li|h[1-6])\s*>|<br\s*\/?\s*>/gi, '\n')
    .replace(/<[^>]*>/g, '')
    .replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"').replace(/&#0?39;/g, "'")
    .trim();
}

export function normalizeJob(job) {
  if (!job || typeof job !== 'object' || !job.slug || !job.title || !job.company_name) return null;
  try {
    const url = new URL(job.url);
    if (url.protocol !== 'https:' || url.hostname !== 'www.arbeitnow.com' || url.username || url.password) return null;
    const timestamp = Number(job.created_at) * 1000;
    return {
      id: String(job.slug), title: plainText(job.title), company: plainText(job.company_name),
      location: plainText(job.location) || 'Localização não informada', remote: job.remote === true,
      tags: Array.isArray(job.tags) ? job.tags.filter(t => typeof t === 'string').map(plainText) : [],
      types: Array.isArray(job.job_types) ? job.job_types.filter(t => typeof t === 'string').map(plainText) : [],
      description: plainText(job.description), url: url.href,
      publishedAt: Number.isFinite(timestamp) && timestamp > 0 ? new Date(timestamp).toISOString() : null,
    };
  } catch { return null; }
}

export function createJobsService({ fetchImpl = fetch, now = Date.now } = {}) {
  let cache;
  let inFlight;
  async function refresh() {
    const response = await fetchImpl(FEED_URL, {
      headers: { Accept: 'application/json', 'User-Agent': 'ProximaVaga/1.0 (public job board)' },
      signal: AbortSignal.timeout(15000),
    });
    if (!response.ok) throw new Error(`Fonte respondeu HTTP ${response.status}`);
    const payload = await response.json();
    if (!Array.isArray(payload.data)) throw new Error('Formato inesperado na fonte de vagas');
    const unique = new Map();
    for (const item of payload.data) {
      const job = normalizeJob(item);
      if (job) unique.set(job.id, job);
    }
    if (payload.data.length && !unique.size) throw new Error('A fonte não retornou vagas válidas');
    cache = { jobs: [...unique.values()], source: 'Arbeitnow', sourceUrl: 'https://www.arbeitnow.com', updatedAt: new Date(now()).toISOString() };
    return cache;
  }
  return async function getJobs() {
    if (cache && now() - Date.parse(cache.updatedAt) < CACHE_TTL) return { ...cache, stale: false };
    try {
      if (!inFlight) inFlight = refresh().finally(() => { inFlight = undefined; });
      return { ...await inFlight, stale: false };
    } catch (error) {
      if (cache) return { ...cache, stale: true };
      throw error;
    }
  };
}
