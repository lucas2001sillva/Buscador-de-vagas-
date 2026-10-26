import { detectWorkModel, normalizeContracts, normalizeText, normalizeWorkModel, safeJobUrl } from '../shared/job-schema.js';
import { load } from 'cheerio';
export function plainText(value = '') {
  return String(value).replace(/<(script|style)\b[^>]*>[\s\S]*?<\/\1>/gi, '')
    .replace(/<\/(p|div|li|h[1-6])\s*>|<br\s*\/?\s*>/gi, '\n').replace(/<[^>]*>/g, '')
    .replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"').replace(/&#0?39;/g, "'").trim();
}
function isoDate(value) {
  const date = new Date(value);
  return value && Number.isFinite(date.getTime()) ? date.toISOString() : null;
}
const BRAZILIAN_STATES = new Set('AC|AL|AP|AM|BA|CE|DF|ES|GO|MA|MT|MS|MG|PA|PB|PR|PE|PI|RJ|RN|RS|RO|RR|SC|SP|SE|TO|Acre|Alagoas|Amapá|Amazonas|Bahia|Ceará|Distrito Federal|Espírito Santo|Goiás|Maranhão|Mato Grosso|Mato Grosso do Sul|Minas Gerais|Pará|Paraíba|Paraná|Pernambuco|Piauí|Rio de Janeiro|Rio Grande do Norte|Rio Grande do Sul|Rondônia|Roraima|Santa Catarina|São Paulo|Sergipe|Tocantins'.split('|').map(normalizeText));
export function parseGupyListing(html) {
  const $ = load(html);
  const data = JSON.parse($('#__NEXT_DATA__').text() || 'null')?.props?.pageProps?.initialJobList;
  if (!Array.isArray(data?.data)) throw new Error('Estrutura pública de vagas da Gupy mudou');
  return data.data;
}
export function normalizeGupy(job, now = Date.now()) {
  if (!job || !job.id || !job.name || !job.careerPageName) return null;
  const country = normalizeText(job.country ?? job.countryCode ?? '');
  if (country ? !['br', 'brasil', 'brazil'].includes(country) : !BRAZILIAN_STATES.has(normalizeText(job.state))) return null;
  if (/banco de talentos|talent.?pool/.test(normalizeText(`${job.name} ${job.type}`))) return null;
  if (isoDate(job.applicationDeadline) && Date.parse(job.applicationDeadline) < now) return null;
  const url = safeJobUrl(job.jobUrl);
  if (!url || !new URL(url).hostname.endsWith('.gupy.io')) return null;
  const explicitModel = normalizeWorkModel(job.workplaceType);
  const workModel = explicitModel !== 'unknown' ? explicitModel : job.isRemote === true ? 'remote' : 'unknown';
  return {
    id: `gupy:${job.id}`, title: plainText(job.name), company: plainText(job.careerPageName),
    location: [job.city, job.state, 'Brasil'].filter(Boolean).map(plainText).join(', '), country: 'BR',
    workModel, remote: workModel === 'remote', types: normalizeContracts([job.type ?? '']),
    tags: [...(Array.isArray(job.badges) ? job.badges.filter(tag => typeof tag === 'string').map(plainText) : []), ...(job.badges?.isPWD === true || job.disabilities === true ? ['Vaga PcD'] : [])],
    description: plainText(job.description || ''), url, publishedAt: isoDate(job.publishedDate),
    sourceId: 'gupy', sourceName: 'Gupy', sourceUrl: 'https://portal.gupy.io',
  };
}
export const BOARDS = [
  { id: 'frontendbr', name: 'Front-end BR · GitHub', repository: 'frontendbr/vagas' },
  { id: 'backendbr', name: 'Back-end BR · GitHub', repository: 'backend-br/vagas' },
  { id: 'reactbr', name: 'React Brasil · GitHub', repository: 'react-brasil/vagas' },
];
export function parseGithubListing(html) {
  const match = html.match(/<script\b(?=[^>]*data-target=["']react-app\.embeddedData["'])[^>]*>([\s\S]*?)<\/script>/i);
  if (!match) throw new Error('Estrutura da lista pública do GitHub mudou');
  const payload = JSON.parse(match[1]).payload?.issuesIndexContentRoute;
  if (!Array.isArray(payload?.results)) throw new Error('Lista pública de vagas ausente');
  return payload.results.map(item => item.issue).filter(Boolean);
}
export function normalizeGithub(issue, board, now = Date.now()) {
  if (!issue || issue.pull_request || !issue.title || !issue.number) return null;
  if (!['open', 'REPO_ISSUE_STATE_OPEN'].includes(issue.state)) return null;
  const url = safeJobUrl(issue.html_url ?? issue.permalink);
  if (!url || new URL(url).pathname !== `/${board.repository}/issues/${issue.number}`) return null;
  const date = isoDate(issue.created_at ?? issue.createdAt);
  if (!date || now - Date.parse(date) > 180 * 86400000) return null;
  const title = plainText(issue.title);
  const labels = (issue.labels ?? []).map(label => typeof label === 'string' ? label : label.name).filter(value => typeof value === 'string');
  const brackets = [...title.matchAll(/\[([^\]]+)\]/g)].map(match => match[1]);
  const location = brackets.find(value => normalizeWorkModel(value) === 'unknown' && !normalizeContracts([value]).length);
  if (location && /\b(portugal|lisboa|espanha|madrid|alemanha|berlim|canada|toronto|estados unidos|usa|eua|london|londres|argentina)\b/.test(normalizeText(location)) && !/brasil|brazil/.test(normalizeText(location))) return null;
  const titleModel = detectWorkModel(brackets);
  const workModel = titleModel !== 'unknown' ? titleModel : detectWorkModel(labels);
  const company = title.match(/\b(?:na|no|at|@)\s+(.+)$/i)?.[1]?.trim() || 'Empresa não informada';
  return {
    id: `github:${board.repository}:${issue.number}`, title, company,
    location: location || (workModel === 'remote' ? 'Remoto — confira a elegibilidade no anúncio' : 'Localização não informada'),
    country: /brasil|brazil/.test(normalizeText(location ?? '')) ? 'BR' : null,
    workModel, remote: workModel === 'remote', tags: labels.filter(label => normalizeWorkModel(label) === 'unknown' && !normalizeContracts([label]).length),
    types: normalizeContracts([...labels, ...brackets]),
    description: typeof issue.body === 'string' ? plainText(issue.body) : 'Anúncio publicado em uma comunidade brasileira de tecnologia. Consulte a página original para ler os requisitos, benefícios e instruções de candidatura. Confirme a localização e a possibilidade de contratação no Brasil.',
    url, publishedAt: date, sourceId: board.id, sourceName: board.name, sourceUrl: `https://github.com/${board.repository}`,
  };
}
async function get(url, fetchImpl, json = false) {
  const response = await fetchImpl(url, { signal: AbortSignal.timeout(15000), headers: { Accept: json ? 'application/json' : 'text/html', 'User-Agent': 'ProximaVaga/1.0 (public job listings)' } });
  if (!response.ok) throw new Error(`Fonte respondeu HTTP ${response.status}`);
  return json ? response.json() : response.text();
}
export function parseProgramathor(html) {
  const $ = load(html);
  if (!$('.cell-list').length) throw new Error('Estrutura da lista do ProgramaThor mudou');
  const jobs = [];
  $('.cell-list').each((_, element) => {
    const card = $(element);
    const link = card.find('a[href^="/jobs/"]').first();
    const title = plainText(card.find('h3').text());
    if (!link.length || !title) return; // ignora publicidade, sem contar como vaga
    const url = safeJobUrl(new URL(link.attr('href'), 'https://programathor.com.br').href);
    if (!url) return;
    const info = card.find('.cell-list-content-icon');
    const byIcon = selector => plainText(info.find(selector).parent('span').text());
    const company = byIcon('.fa-briefcase');
    if (!company) return;
    const location = byIcon('.fa-map-marker-alt') || 'Localização não informada';
    const workModel = normalizeWorkModel(location);
    jobs.push({
      id: `programathor:${new URL(url).pathname.match(/\/jobs\/(\d+)/)[1]}`,
      title, company, location, country: 'BR', workModel, remote: workModel === 'remote',
      types: normalizeContracts([byIcon('.fa-file-alt')]), tags: card.find('.tag-list').map((_, tag) => plainText($(tag).text())).get(),
      description: 'Vaga publicada no ProgramaThor, portal brasileiro de oportunidades em tecnologia. A descrição completa, os benefícios e as instruções de candidatura estão na página original. Confira se a contratação remota atende à sua localização.',
      url, publishedAt: null, sourceId: 'programathor', sourceName: 'ProgramaThor', sourceUrl: 'https://programathor.com.br/jobs',
    });
  });
  if (!jobs.length) throw new Error('Nenhuma vaga reconhecida no ProgramaThor');
  return jobs;
}
export const SOURCES = [
  { id: 'programathor', name: 'ProgramaThor', url: 'https://programathor.com.br/jobs', async load({ fetchImpl }) {
    return parseProgramathor(await get('https://programathor.com.br/jobs', fetchImpl));
  } },
  { id: 'gupy', name: 'Gupy', url: 'https://portal.gupy.io', async load({ fetchImpl, now }) {
    let rows;
    try {
      const payload = await get('https://portal.gupy.io/api/job-search/jobs?limit=100&offset=0&sortBy=publishedDate&sortOrder=desc', fetchImpl, true);
      if (!Array.isArray(payload.data)) throw new Error('Formato de vagas da Gupy mudou');
      rows = payload.data;
    } catch {
      // Usa apenas os dados já públicos na página de busca, sem login ou contornar bloqueios.
      rows = parseGupyListing(await get('https://portal.gupy.io/job-search/sortBy=publishedDate', fetchImpl));
    }
    return rows.map(job => normalizeGupy(job, now)).filter(Boolean);
  } },
  ...BOARDS.map(board => ({ id: board.id, name: board.name, url: `https://github.com/${board.repository}`, async load({ fetchImpl, now }) {
    const html = await get(`https://github.com/${board.repository}/issues?q=is%3Aissue%20is%3Aopen%20sort%3Acreated-desc`, fetchImpl);
    return parseGithubListing(html).map(issue => normalizeGithub(issue, board, now)).filter(Boolean);
  } })),
];
