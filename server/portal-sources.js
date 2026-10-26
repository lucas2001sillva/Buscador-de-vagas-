import { load } from 'cheerio';
import { normalizeContracts, normalizeWorkModel, safeJobUrl, normalizeText } from '../shared/job-schema.js';
import { canonicalJobUrl } from '../shared/job-identity.js';
import { plainText, isoDate, fetchPublic } from './source-utils.js';
import { createGoogleJobsProvider } from './search-provider.js';

import { PORTALS, identifyPortal } from '../shared/portals.js';
export { PORTALS, identifyPortal } from '../shared/portals.js';

function baseJob(portal, { id, title, company, location, workModel = 'unknown', types = [], description = '', url, publishedAt = null, ...extra }) {
  const safe = safeJobUrl(url);
  if (!id || !title || !company || !safe || identifyPortal(safe)?.id !== portal.id) return null;
  return { id: `${portal.id}:${id}`, title: plainText(title), company: plainText(company), location: plainText(location) || 'Localização não informada', workModel, remote: workModel === 'remote', types, description: plainText(description), url: safe, publishedAt, tags: [], sourceId: portal.id, sourceName: portal.name, sourceUrl: portal.url, ...extra };
}

export function parseRandstad(html) {
  const $ = load(html);
  const rows = $('.cards__item').toArray();
  if (!rows.length) throw new Error('Listagem pública da Randstad não reconhecida');
  const months = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];
  const portal = PORTALS.find(p => p.id === 'randstad');
  const jobs = rows.map(element => {
    const card = $(element);
    const href = card.find('.cards__title .cards__link').attr('href');
    if (!href) return null;
    const url = new URL(href, portal.url).href;
    const id = new URL(url).pathname.match(/_(\d+)\/?$/)?.[1];
    const location = card.find('.cards__meta-item').filter((_, e) => $(e).find('svg[aria-label="Localização da vaga"]').length > 0).text().trim();
    const contract = card.find('.cards__meta-item').filter((_, e) => $(e).find('svg[aria-label="Tipo de posição"]').length > 0).text().trim();
    const date = card.find('.cards__date').text().match(/(\d{1,2})\s+(\S+)\s+(\d{4})/);
    const month = date ? months.indexOf(date[2].toLowerCase()) + 1 : 0;
    const publishedAt = date && month ? `${date[3]}-${String(month).padStart(2, '0')}-${date[1].padStart(2, '0')}` : null;
    return baseJob(portal, { id, title: card.find('.cards__title').text(), company: 'Randstad', employerReference: id ? `randstad-${id}` : undefined, location, workModel: normalizeWorkModel(location), types: normalizeContracts([contract]), description: card.find('.cards__description').text(), url, publishedAt, country: 'BR', postedDatePrecision: 'day' });
  }).filter(Boolean);
  if (!jobs.length) throw new Error('Nenhum anúncio reconhecido na Randstad');
  return jobs;
}

// Lê somente um literal JSON público. Nunca executa JavaScript recebido dos portais.
export function readAssignedJson(html, marker) {
  const markerIndex = html.indexOf(marker);
  if (markerIndex < 0) throw new Error('Dados públicos não encontrados');
  const start = html.indexOf('{', markerIndex + marker.length);
  if (start < 0) throw new Error('Objeto JSON ausente');
  let depth = 0, quoted = false, escape = false;
  for (let i = start; i < html.length; i++) {
    const character = html[i];
    if (quoted) {
      if (escape) escape = false;
      else if (character === '\\') escape = true;
      else if (character === '"') quoted = false;
    } else if (character === '"') quoted = true;
    else if (character === '{' || character === '[') depth++;
    else if (character === '}' || character === ']') {
      depth--;
      if (depth === 0) return JSON.parse(html.slice(start, i + 1));
    }
  }
  throw new Error('Dados públicos incompletos');
}

export function parseIndeed(html, now = Date.now()) {
  const data = readAssignedJson(html, 'window.mosaic.providerData["mosaic-provider-jobcards"]=');
  const rows = data.metaData?.mosaicProviderJobCardsModel?.results;
  if (!Array.isArray(rows)) throw new Error('Listagem pública do Indeed não reconhecida');
  const portal = PORTALS.find(p => p.id === 'indeed');
  return rows.map(job => {
    if (!job.jobkey || job.expired === true || (job.country && normalizeText(job.country) !== 'br')) return null;
    const publishedAt = isoDate(job.pubDate);
    if (publishedAt && now - Date.parse(publishedAt) > 180 * 86400000) return null;
    const remote = job.remoteLocation === true ? 'remote' : normalizeWorkModel(job.remoteLocation);
    return baseJob(portal, { id: job.jobkey, title: job.displayTitle || job.title, company: job.company, location: job.formattedLocation, workModel: remote, types: normalizeContracts(Array.isArray(job.jobTypes) ? job.jobTypes : []), description: job.snippet, url: `https://br.indeed.com/viewjob?jk=${encodeURIComponent(job.jobkey)}`, publishedAt, country: 'BR' });
  }).filter(Boolean);
}

export function parseGlassdoor(html) {
  const $ = load(html);
  const cards = $('[data-test="jobListing"]');
  if (!cards.length) throw new Error('A consulta pública do Glassdoor não disponibilizou anúncios reconhecíveis');
  const portal = PORTALS.find(p => p.id === 'glassdoor');
  return cards.toArray().map(element => {
    const card = $(element);
    const link = card.find('a[data-test="job-title"]');
    const url = safeJobUrl(link.attr('href'));
    const id = url ? new URL(url).searchParams.get('jl') : null;
    const location = card.find('[data-test="emp-location"]').text();
    const description = card.find('[data-test="descSnippet"]').text();
    return baseJob(portal, { id, title: link.text(), company: card.find('[class*="compactEmployerName"]').first().text(), location, workModel: normalizeWorkModel(location), description, url, postedLabel: plainText(card.find('[data-test="job-age"]').text()) || null });
  }).filter(Boolean);
}

export function parseInfojobs(html) {
  const $ = load(html);
  const jobs = [];
  // Apenas anúncios JobPosting publicados no HTML; não consulta perfis nem currículos.
  $('script[type="application/ld+json"]').each((_, element) => {
    let json;
    try { json = JSON.parse($(element).text()); } catch { return; }
    const items = Array.isArray(json) ? json : [json, ...(json?.['@graph'] ?? [])];
    for (const item of items) {
      if (item?.['@type'] !== 'JobPosting') continue;
      const address = item.jobLocation?.address;
      const country = typeof address?.addressCountry === 'string' ? address.addressCountry : address?.addressCountry?.name;
      if (country && !['br', 'brasil', 'brazil'].includes(normalizeText(country))) continue;
      const job = baseJob(PORTALS.find(p => p.id === 'infojobs'), { id: item.identifier?.value || canonicalJobUrl(item.url), title: item.title, company: item.hiringOrganization?.name, location: [address?.addressLocality, address?.addressRegion].filter(Boolean).join(', '), workModel: item.jobLocationType === 'TELECOMMUTE' ? 'remote' : 'unknown', types: normalizeContracts([item.employmentType || '']), description: item.description, url: item.url, publishedAt: isoDate(item.datePosted), country: 'BR' });
      if (job) jobs.push(job);
    }
  });
  if (!jobs.length) {
    // O portal também publica cartões HTML, sem JSON-LD, inclusive na versão móvel.
    $('a.js_vacancyLoad').each((_, element) => {
      const card = $(element);
      const href = card.attr('href');
      if (!href) return;
      const portal = PORTALS.find(p => p.id === 'infojobs');
      const url = safeJobUrl(new URL(href, portal.url).href);
      const id = url && new URL(url).pathname.match(/__(\d+)\.aspx$/i)?.[1];
      const locationNode = card.find('div.text-body.mb-8').first().clone();
      locationNode.find('[hidden], svg, style').remove();
      const mode = card.find('svg.icon-buildings').parent().text();
      const rawDate = card.find('.js_date').attr('data-value');
      const date = rawDate?.match(/^(\d{4})\/(\d{2})\/(\d{2})/);
      const job = baseJob(portal, {
        id, title: card.find('.js_vacancyTitle').text(),
        company: card.find('.d-flex.align-items-center > .text-body').first().text(),
        location: locationNode.text(), workModel: normalizeWorkModel(mode),
        types: [], description: 'Anúncio público do InfoJobs. Consulte a página original para ler os requisitos, benefícios e condições da candidatura.',
        url, publishedAt: date ? `${date[1]}-${date[2]}-${date[3]}` : null, postedDatePrecision: 'day', country: 'BR',
      });
      if (job) jobs.push(job);
    });
  }
  if (!jobs.length) throw new Error('InfoJobs não disponibilizou uma listagem pública reconhecida');
  return jobs;
}

export function createPortalSources({ getApiKey = () => process.env.SERPAPI_KEY } = {}) {
  const provider = createGoogleJobsProvider({ getApiKey });
  const parsers = { randstad: parseRandstad, indeed: parseIndeed, glassdoor: parseGlassdoor, infojobs: parseInfojobs };
  return PORTALS.map(portal => ({ ...portal, async load({ fetchImpl, now }) {
    if (parsers[portal.id]) {
      try { return parsers[portal.id](await fetchPublic(portal.url, fetchImpl), now); }
      catch (error) { if (!getApiKey()) throw error; }
    }
    if (!getApiKey()) { const error = new Error('Integração autorizada ainda não configurada'); error.code = 'NOT_CONFIGURED'; throw error; }
    return (await provider.getJobs({ fetchImpl, now })).filter(job => job.sourceId === portal.id);
  } }));
}
