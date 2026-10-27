import { normalizeText, normalizeWorkModel, normalizeContracts, detectWorkModel, safeJobUrl } from '../shared/job-schema.js';
import { canonicalJobUrl, canonicalLocation } from '../shared/job-identity.js';
import { identifyPortal } from '../shared/portals.js';
import { plainText } from './source-utils.js';
import { normalizeSearch, searchKey } from '../shared/search.js';
export const PROVIDER_CACHE_TTL = 60 * 60 * 1000;

export function normalizeSearchResults(payload) {
  if (payload.error) throw new Error('O provedor de busca recusou a consulta');
  if (!Array.isArray(payload.jobs_results)) throw new Error('O provedor não retornou uma lista de vagas válida');
  const jobs = [];
  for (const raw of payload.jobs_results) {
    if (!raw?.title || !raw.company_name || !raw.job_id || !Array.isArray(raw.apply_options)) continue;
    const location = plainText(raw.location || 'Localização não informada');
    if (/\b(portugal|united states|estados unidos|canada|germany|alemanha|spain|espanha|argentina|india)\b/.test(normalizeText(location)) && !/brasil|brazil/.test(normalizeText(location))) continue;
    const extensions = Array.isArray(raw.extensions) ? raw.extensions.filter(item => typeof item === 'string') : [];
    const explicit = detectWorkModel(extensions);
    const workModel = explicit !== 'unknown' ? explicit : raw.detected_extensions?.work_from_home === true ? 'remote' : normalizeWorkModel(raw.workplace_type);
    const contracts = normalizeContracts([...extensions, raw.detected_extensions?.schedule_type || '']);
    for (const option of raw.apply_options) {
      const url = safeJobUrl(option?.link);
      const portal = url && identifyPortal(url);
      if (!portal) continue;
      jobs.push({
        id: `${portal.id}:${canonicalJobUrl(url)}`, aggregationId: `google-jobs:${raw.job_id}`,
        title: plainText(raw.title), company: plainText(raw.company_name), location,
        workModel, remote: workModel === 'remote', types: contracts, tags: [],
        description: plainText(raw.description || ''), url, publishedAt: null,
        country: /brasil|brazil/.test(normalizeText(location)) || canonicalLocation(location).state ? 'BR' : null,
        sourceId: portal.id, sourceName: portal.name, sourceUrl: portal.url, ingestedVia: 'Google Jobs · SerpApi',
      });
    }
  }
  return jobs;
}

export function createGoogleJobsProvider({ getApiKey = () => process.env.SERPAPI_KEY } = {}) {
  const searches = new Map();
  return { async getJobs({ fetchImpl = fetch, now = Date.now(), query = '', location = '', page = 0 } = {}) {
    const search = normalizeSearch({ query, location, page });
    if (!getApiKey()) { const error = new Error('Provedor ainda não conectado'); error.code = 'NOT_CONFIGURED'; throw error; }
    const key = searchKey(search);
    let entry = searches.get(key);
    if (!entry || now - entry.at >= PROVIDER_CACHE_TTL) {
      entry = { at: now, pages: new Map() }; searches.delete(key); searches.set(key, entry);
      if (searches.size > 40) searches.delete(searches.keys().next().value);
    }
    async function readPage(index) {
      const previous = index > 0 ? await readPage(index - 1) : null;
      if (previous && !previous.nextToken) return { jobs: [], nextToken: null };
      const saved = entry.pages.get(index);
      if (saved && !(saved.error && now - saved.at > 60000)) return saved.promise;
      const state = { at: now, error: false };
      state.promise = (async () => {
        const endpoint = new URL('https://serpapi.com/search.json');
        const q = [search.query || 'vagas', search.location ? 'em ' + search.location : 'no Brasil'].join(' ');
        endpoint.search = new URLSearchParams({ engine: 'google_jobs', q, location: 'Brazil', gl: 'br', hl: 'pt', api_key: getApiKey(), ...(previous?.nextToken ? { next_page_token: previous.nextToken } : {}) }).toString();
        // Nunca registrar a URL autenticada nem seguir URLs de paginação fornecidas externamente.
        const response = await fetchImpl(endpoint, { signal: AbortSignal.timeout(20000), headers: { Accept: 'application/json' } });
        if (!response.ok) { const error = new Error('O provedor de vagas recusou a consulta'); error.status = response.status; throw error; }
        const payload = await response.json();
        // A ausência legítima de resultados é diferente de um erro de autenticação/quota.
        const empty = payload.error && /hasn.t returned any results|no results/i.test(payload.error);
        const jobs = empty ? [] : normalizeSearchResults(payload);
        return { jobs, nextToken: typeof payload.serpapi_pagination?.next_page_token === 'string' ? payload.serpapi_pagination.next_page_token : null };
      })().catch(error => { state.error = true; throw error; });
      entry.pages.set(index, state);
      return state.promise;
    }
    // Duas páginas por lote, compartilhadas entre todos os portais e visitantes da mesma busca.
    const first = await readPage(search.page * 2);
    let second;
    try { second = first.nextToken ? await readPage(search.page * 2 + 1) : null; }
    catch { return { jobs: first.jobs, hasMore: true, partial: true }; }
    return { jobs: [...first.jobs, ...(second?.jobs || [])], hasMore: Boolean(second?.nextToken), partial: false };
  } };
}
