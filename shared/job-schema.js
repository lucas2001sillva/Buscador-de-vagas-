export const WORK_MODELS = Object.freeze({ remote: 'Remoto', hybrid: 'Híbrido', onsite: 'Presencial', unknown: 'Não informado' });
export const CONTRACT_TYPES = Object.freeze(['CLT', 'PJ', 'Estágio', 'Aprendiz', 'Temporário', 'Autônomo', 'Cooperado', 'Voluntário', 'Bolsista']);
export function normalizeText(value = '') {
  return String(value).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase('pt-BR');
}
export function normalizeWorkModel(value) {
  const text = normalizeText(value).trim();
  if (/^(hybrid|hibrido|hibrida|trabalho hibrido)$/.test(text)) return 'hybrid';
  if (/^(remote|remoto|remota|home[- ]office|anywhere|100% remoto|teletrabalho)$/.test(text)) return 'remote';
  if (/^(on[- ]?site|onsite|presencial|alocado|alocada|in[- ]office)$/.test(text)) return 'onsite';
  return 'unknown';
}
export function detectWorkModel(values = []) {
  const modes = new Set(values.map(normalizeWorkModel).filter(value => value !== 'unknown'));
  return modes.size === 1 ? [...modes][0] : 'unknown';
}
export function normalizeContracts(values = []) {
  const patterns = [
    ['CLT', /\bclt\b|^efetivo$|^effective$/], ['PJ', /\bpj\b|pessoa juridica/],
    ['Estágio', /estagi|internship/], ['Aprendiz', /aprendiz|apprentice/],
    ['Temporário', /temporari|temporary/], ['Autônomo', /autonom|freelanc/],
    ['Cooperado', /cooperad|cooperativ/], ['Voluntário', /voluntari|volunteer/], ['Bolsista', /bolsista/],
  ];
  const text = values.map(value => normalizeText(value).replace(/^vacancy_type_/, '')).join(' ');
  return patterns.filter(([, pattern]) => pattern.test(text)).map(([name]) => name);
}
export function safeJobUrl(value) {
  try {
    const url = new URL(value);
    if (url.protocol !== 'https:' || url.username || url.password || (url.port && url.port !== '443')) return null;
    const host = url.hostname;
    if (host === 'github.com' && /^\/(frontendbr|backend-br|react-brasil)\/vagas\/issues\/\d+\/?$/.test(url.pathname)) return url.href;
    if (host.endsWith('.gupy.io') && host !== 'portal.api.gupy.io' && (/^\/jobs\/\d+\/?$/.test(url.pathname) || /^\/job\/[A-Za-z0-9_+%=-]+\/?$/.test(url.pathname))) return url.href;
    if (['programathor.com.br', 'www.programathor.com.br'].includes(host) && /^\/jobs\/\d+[^/]*\/?$/.test(url.pathname)) return url.href;
    // Mantém os favoritos antigos, sem incluí-los na nova seleção brasileira.
    if (host === 'www.arbeitnow.com' && url.pathname.startsWith('/jobs/')) return url.href;
  } catch { /* link inválido */ }
  return null;
}
export function restoreFavorite(item) {
  if (!item || !['id', 'title', 'company', 'location'].every(key => typeof item[key] === 'string') || !safeJobUrl(item.url)) return null;
  const tags = Array.isArray(item.tags) ? item.tags.filter(tag => typeof tag === 'string') : [];
  const workModel = Object.hasOwn(WORK_MODELS, item.workModel) ? item.workModel : item.remote === true ? 'remote' : 'unknown';
  return { ...item, url: safeJobUrl(item.url), tags, types: normalizeContracts(Array.isArray(item.types) ? item.types : []), workModel, remote: workModel === 'remote', sourceName: typeof item.sourceName === 'string' ? item.sourceName : 'Arbeitnow (favorito antigo)', sourceId: typeof item.sourceId === 'string' ? item.sourceId : 'legacy', description: typeof item.description === 'string' ? item.description : '', publishedAt: typeof item.publishedAt === 'string' ? item.publishedAt : null };
}
