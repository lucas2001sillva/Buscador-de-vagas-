import { normalizeText } from './job-schema.js';

const SOURCE_ORDER = ['randstad', 'gupy', 'linkedin', 'indeed', 'infojobs', 'catho', 'glassdoor', 'programathor', 'frontendbr', 'backendbr', 'reactbr'];
const STATES = Object.fromEntries('Acre:AC|Alagoas:AL|Amapá:AP|Amazonas:AM|Bahia:BA|Ceará:CE|Distrito Federal:DF|Espírito Santo:ES|Goiás:GO|Maranhão:MA|Mato Grosso:MT|Mato Grosso do Sul:MS|Minas Gerais:MG|Pará:PA|Paraíba:PB|Paraná:PR|Pernambuco:PE|Piauí:PI|Rio de Janeiro:RJ|Rio Grande do Norte:RN|Rio Grande do Sul:RS|Rondônia:RO|Roraima:RR|Santa Catarina:SC|São Paulo:SP|Sergipe:SE|Tocantins:TO'.split('|').map(item => { const [name, code] = item.split(':'); return [normalizeText(name), code.toLowerCase()]; }));
const STATE_CODES = new Set(Object.values(STATES));
const DISTINCT_CITY_STATES = { 'sao paulo': 'sp', 'rio de janeiro': 'rj', brasilia: 'df', curitiba: 'pr', 'belo horizonte': 'mg', 'porto alegre': 'rs', florianopolis: 'sc', manaus: 'am', salvador: 'ba', recife: 'pe', fortaleza: 'ce', aracaju: 'se', maceio: 'al', teresina: 'pi', cuiaba: 'mt', macapa: 'ap' };
const clean = value => normalizeText(value).replace(/[^a-z0-9]+/g, ' ').trim().replace(/\s+/g, ' ');

export function canonicalCompany(value) {
  return clean(value).replace(/\b(?:ltda|limitada|inc|incorporated|s a|s a s|eireli|epp)\s*$/g, '').trim();
}

function knownCompany(value) {
  return value.length > 1 && !/^(?:empresa(?: nao informada| confidencial)?|confidencial(?: .*)?|nao informad[oa]|unknown|confidential|a combinar)$/.test(value);
}

export function canonicalJobUrl(value) {
  try {
    const url = new URL(value);
    if (url.protocol !== 'https:' || url.username || url.password) return '';
    const host = url.hostname.toLowerCase();
    if (host.endsWith('.gupy.io')) {
      const numeric = url.pathname.match(/^\/jobs\/(\d+)\/?$/)?.[1];
      if (numeric) return `gupy:${numeric}`;
      const token = url.pathname.match(/^\/job\/([^/]+)/)?.[1];
      if (token) {
        try {
          const payload = JSON.parse(atob(decodeURIComponent(token).replace(/-/g, '+').replace(/_/g, '/')));
          if (/^\d+$/.test(String(payload.jobId))) return `gupy:${payload.jobId}`;
        } catch { /* formato desconhecido: comparar a URL conservadoramente */ }
      }
    }
    if (/(^|\.)linkedin\.com$/.test(host)) {
      const id = url.pathname.match(/\/jobs\/view\/(?:[^/]*-)?(\d+)\/?$/)?.[1] || url.searchParams.get('currentJobId');
      if (id && /^\d+$/.test(id)) return `linkedin:${id}`;
    }
    if (/(^|\.)indeed\.com$/.test(host)) {
      const id = url.searchParams.get('jk') || url.searchParams.get('vjk');
      if (id && /^[a-z0-9]+$/i.test(id)) return `indeed:${id}`;
    }
    if (host === 'www.infojobs.com.br' || host === 'infojobs.com.br') {
      const id = url.pathname.match(/__(\d+)\.aspx$/i)?.[1];
      if (id) return `infojobs:${id}`;
    }
    if (host === 'www.catho.com.br' || host === 'catho.com.br') {
      const id = url.pathname.match(/^\/vagas\/[^/]+\/(\d+)\/?$/)?.[1];
      if (id) return `catho:${id}`;
    }
    if (host.endsWith('glassdoor.com.br') || host.endsWith('.glassdoor.com')) {
      const id = url.searchParams.get('jl');
      if (id && /^\d+$/.test(id)) return `glassdoor:${id}`;
    }
    url.hostname = host.replace(/^www\./, '');
    url.hash = '';
    for (const key of [...url.searchParams.keys()]) {
      if (/^(?:utm_|trk|tracking|source$|jobboardsource$|ref$|refid$|from$|fbclid$|gclid$)/i.test(key)) url.searchParams.delete(key);
    }
    url.searchParams.sort();
    return url.href.replace(/\/$/, '');
  } catch { return ''; }
}

export function canonicalTitle(job) {
  const company = canonicalCompany(job.company);
  let title = normalizeText(job.title)
    .replace(/\((?:a|o|as|os|m\/f(?:\/d)?|f\/m(?:\/d)?|m\/f\/x)\)/g, '')
    .replace(/\[([^\]]+)\]/g, (match, inside) => /junior|pleno|senior|\bjr\b|\bsr\b|pcd|afirmativ/.test(inside) ? inside : '')
    .replace(/\b(?:vaga|oportunidade|emprego)\s+(?:de|para)\s+/g, '')
    .replace(/\bfront[ -]?end\b/g, 'frontend').replace(/\bback[ -]?end\b/g, 'backend').replace(/\bfull[ -]?stack\b/g, 'fullstack')
    .replace(/\b(?:sr|senior)\b\.?/g, 'senior').replace(/\b(?:jr|junior)\b\.?/g, 'junior').replace(/\b(?:pl|plena|pleno)\b\.?/g, 'pleno');
  title = clean(title);
  const suffix = company ? new RegExp(`(?: (?:na|no|at))? ${company.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?: ltda| s a)?$`) : null;
  if (suffix) title = title.replace(suffix, '');
  return title.replace(/\b(?:de|da|do|das|dos)\b/g, '').replace(/\s+/g, ' ').trim();
}

export function canonicalLocation(value) {
  const text = normalizeText(value || '').replace(/\b(?:brasil|brazil)\b/g, '').trim();
  if (!text || /nao informad|confira|a combinar/.test(text)) return { city: '', state: '' };
  if (/^(?:remoto|remote|trabalho remoto|home office|anywhere)[\s,–—-]*$/.test(text)) return { city: '', state: '' };
  const parts = text.split(/\s*[,/|]\s*|\s+-\s+/).map(clean).filter(Boolean);
  const last = parts.at(-1);
  const state = STATES[last] || (STATE_CODES.has(last) ? last : '');
  const city = clean(state ? parts.slice(0, -1).join(' ') : parts.join(' '));
  return { city, state: state || DISTINCT_CITY_STATES[city] || '' };
}

function shingleSet(text) {
  const words = clean(text).split(' ').filter(Boolean);
  if (words.length < 35 || /descricao completa.*(?:pagina|fonte)|anuncio publicado em uma comunidade|vaga publicada no programathor/.test(normalizeText(text))) return null;
  const result = new Set();
  for (let i = 0; i < words.length - 2; i++) result.add(words.slice(i, i + 3).join(' '));
  return result;
}

function similarity(first, second) {
  if (!first || !second) return null;
  let intersection = 0;
  for (const item of first) if (second.has(item)) intersection++;
  const jaccard = intersection / (first.size + second.size - intersection);
  const containment = Math.min(first.size, second.size) >= 60 ? intersection / Math.min(first.size, second.size) : 0;
  return Math.max(jaccard, containment);
}

function describe(job) {
  return {
    job, company: canonicalCompany(job.company), title: canonicalTitle(job), location: canonicalLocation(job.location),
    mode: ['remote', 'hybrid', 'onsite'].includes(job.workModel) ? job.workModel : '',
    contracts: new Set(job.types ?? []), url: canonicalJobUrl(job.url), body: shingleSet(job.description || ''),
    reference: job.employerReference ? clean(job.employerReference) : '',
  };
}

function isSameVacancy(a, b) {
  if (a.url && a.url === b.url) return true;
  if (!knownCompany(a.company) || a.company !== b.company || !a.title || a.title !== b.title) return false;
  if (a.reference && b.reference && a.reference !== b.reference) return false;
  if (a.mode && b.mode && a.mode !== b.mode) return false;
  if (a.job.country && b.job.country && a.job.country !== b.job.country) return false;
  if (a.location.city && b.location.city && a.location.city !== b.location.city) return false;
  if (a.location.state && b.location.state && a.location.state !== b.location.state) return false;
  if (a.contracts.size && b.contracts.size && ![...a.contracts].some(type => b.contracts.has(type))) return false;
  if (a.reference && a.reference === b.reference) return true;
  if (a.job.aggregationId && a.job.aggregationId === b.job.aggregationId) return true;
  // IDs diferentes no mesmo portal podem representar requisições distintas com o mesmo cargo.
  if (a.job.sourceId && a.job.sourceId === b.job.sourceId) return false;
  const bodyScore = similarity(a.body, b.body);
  if (bodyScore !== null && bodyScore < 0.55) return false;
  if (bodyScore !== null && bodyScore >= 0.86) return true;
  if (a.company === 'randstad') return false; // anúncios de clientes distintos da agência exigem evidência adicional
  const locationKnown = a.location.city && a.location.city === b.location.city && a.location.state && a.location.state === b.location.state;
  const remoteCountryKnown = a.mode === 'remote' && b.mode === 'remote' && !a.location.city && !b.location.city;
  return Boolean(locationKnown || remoteCountryKnown);
}

function completeness(record) {
  return Number(Boolean(record.body)) * 4 + Number(Boolean(record.mode)) + Number(Boolean(record.location.city)) + Number(record.contracts.size > 0) + Number(Boolean(record.job.publishedAt));
}
function preference(a, b) {
  const stale = Number(Boolean(a.job.sourceStale)) - Number(Boolean(b.job.sourceStale));
  if (stale) return stale;
  const info = completeness(b) - completeness(a);
  if (info) return info;
  const rank = record => { const index = SOURCE_ORDER.indexOf(record.job.sourceId); return index < 0 ? SOURCE_ORDER.length : index; };
  return rank(a) - rank(b) || a.url.localeCompare(b.url) || String(a.job.id).localeCompare(String(b.job.id));
}

export function deduplicateJobs(jobs) {
  const groups = [];
  for (const record of jobs.map(describe).sort(preference)) {
    // Todos os membros devem corresponder; um anúncio incompleto não pode ligar duas vagas diferentes.
    const group = groups.find(items => items.every(item => isSameVacancy(item, record)));
    if (group) group.push(record); else groups.push([record]);
  }
  return groups.map(group => {
    const primary = group[0].job;
    const duplicateIds = [...new Set(group.flatMap(({ job }) => [job.id, ...(job.duplicateIds ?? [])]))].sort();
    return { ...primary, duplicateIds, duplicateCount: duplicateIds.length };
  }).sort((a, b) => (Date.parse(b.publishedAt) || 0) - (Date.parse(a.publishedAt) || 0) || String(a.id).localeCompare(String(b.id)));
}

export function isSavedJob(job, savedJobs) {
  const ids = new Set([job.id, ...(job.duplicateIds ?? [])]);
  const url = canonicalJobUrl(job.url);
  return savedJobs.some(saved => [saved.id, ...(saved.duplicateIds ?? [])].some(id => ids.has(id)) || (url && canonicalJobUrl(saved.url) === url) || isSameVacancy(describe(job), describe(saved)));
}
