import { normalizeText } from '../shared/job-schema.js';
export { normalizeText } from '../shared/job-schema.js';

export function filterJobs(jobs, { query = '', location = '', workModels = [], type = '', source = '', savedOnly = false, savedIds = [], sort = 'recent' } = {}) {
  const terms = normalizeText(query).trim().split(/\s+/).filter(Boolean);
  const place = normalizeText(location).trim();
  const filtered = jobs.filter(job => {
    const searchable = normalizeText([job.title, job.company, ...job.tags].join(' '));
    return terms.every(term => searchable.includes(term))
      && (!place || normalizeText(job.location).includes(place))
      && (!workModels.length || workModels.includes(job.workModel ?? 'unknown'))
      && (!type || (type === 'unknown' ? !job.types.length : job.types.includes(type)))
      && (!source || job.sourceId === source)
      && (!savedOnly || savedIds.includes(job.id));
  });
  return filtered.sort((a, b) => sort === 'company'
    ? a.company.localeCompare(b.company, 'pt-BR')
    : (Date.parse(b.publishedAt) || 0) - (Date.parse(a.publishedAt) || 0));
}

export function relativeDate(value) {
  if (!value) return 'Data não informada';
  const days = Math.max(0, Math.floor((Date.now() - Date.parse(value)) / 86400000));
  if (!Number.isFinite(days)) return 'Data não informada';
  if (days === 0) return 'Hoje';
  if (days === 1) return 'Há 1 dia';
  return `Há ${days} dias`;
}
