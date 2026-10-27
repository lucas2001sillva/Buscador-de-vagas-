export function plainText(value = '') {
  return String(value).replace(/<(script|style)\b[^>]*>[\s\S]*?<\/\1>/gi, '')
    .replace(/<\/(p|div|li|h[1-6])\s*>|<br\s*\/?\s*>/gi, '\n').replace(/<[^>]*>/g, '')
    .replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"').replace(/&#0?39;/g, "'").replace(/&hellip;/g, '…').trim();
}
export function isoDate(value) {
  const date = new Date(value);
  return value !== undefined && value !== null && value !== '' && Number.isFinite(date.getTime()) ? date.toISOString() : null;
}
export async function fetchPublic(url, fetchImpl, json = false) {
  const response = await fetchImpl(url, { signal: AbortSignal.timeout(15000), headers: { Accept: json ? 'application/json' : 'text/html', 'User-Agent': 'ProximaVaga/1.0 (public job listings)' } });
  if (!response.ok) {
    const error = new Error('A fonte recusou a consulta pública');
    error.status = response.status;
    throw error;
  }
  return json ? response.json() : response.text();
}

export const PUBLIC_PAGES_PER_BATCH = 3;

export async function loadPublicPages({ urlForPage, parse, fetchImpl, page = 0, pageSize, json = false }) {
  const start = page * PUBLIC_PAGES_PER_BATCH;
  const first = await parse(await fetchPublic(urlForPage(start), fetchImpl, json));
  if (first.length < pageSize) return { jobs: first, hasMore: false };
  const extra = await Promise.allSettled([1, 2].map(async offset => parse(await fetchPublic(urlForPage(start + offset), fetchImpl, json))));
  const jobs = new Map(first.map(job => [job.id, job]));
  let hasMore = false, partial = false;
  for (const result of extra) {
    if (result.status === 'rejected') { partial = true; hasMore = true; continue; }
    const before = jobs.size;
    for (const job of result.value) jobs.set(job.id, job);
    // Alguns portais ignoram o parâmetro de página. Não anunciar páginas infinitas nesse caso.
    hasMore = hasMore || (result.value.length >= pageSize && jobs.size > before);
    if (result.value.length < pageSize) hasMore = false;
  }
  return { jobs: [...jobs.values()], hasMore: partial || hasMore, partial };
}
