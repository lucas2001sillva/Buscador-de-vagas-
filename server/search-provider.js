import { normalizeText, normalizeWorkModel, normalizeContracts, detectWorkModel, safeJobUrl } from '../shared/job-schema.js';
import { canonicalJobUrl, canonicalLocation } from '../shared/job-identity.js';
import { identifyPortal } from '../shared/portals.js';
import { plainText } from './source-utils.js';
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
  let cached, cachedAt = 0, inFlight;
  return { async getJobs({ fetchImpl = fetch, now = Date.now() } = {}) {
    if (cached && now - cachedAt < PROVIDER_CACHE_TTL) return cached;
    if (!getApiKey()) { const error = new Error('Provedor ainda não conectado'); error.code = 'NOT_CONFIGURED'; throw error; }
    if (!inFlight) inFlight = (async () => {
      const endpoint = new URL('https://serpapi.com/search.json');
      endpoint.search = new URLSearchParams({ engine: 'google_jobs', q: 'vagas no Brasil', location: 'Brazil', gl: 'br', hl: 'pt', api_key: getApiKey() }).toString();
      // A chave permanece no servidor. Não registrar URL, cabeçalhos ou corpo de erro do provedor.
      const response = await fetchImpl(endpoint, { signal: AbortSignal.timeout(20000), headers: { Accept: 'application/json' } });
      if (!response.ok) throw new Error('O provedor de vagas está indisponível ou recusou o acesso');
      cached = normalizeSearchResults(await response.json());
      cachedAt = now;
      return cached;
    })().finally(() => { inFlight = undefined; });
    return inFlight;
  } };
}
