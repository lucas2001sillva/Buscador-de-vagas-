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
