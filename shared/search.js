export const MAX_SEARCH_PAGE = 4;

export function normalizeSearch({ query = '', location = '', page = 0 } = {}) {
  const clean = value => String(value).replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim();
  const search = { query: clean(query), location: clean(location), page: Number(page) };
  if (search.query.length > 120 || search.location.length > 100 || !Number.isInteger(search.page) || search.page < 0 || search.page > MAX_SEARCH_PAGE) {
    const error = new Error('Use até 120 caracteres no cargo, 100 na localização e uma página válida.');
    error.status = 400;
    throw error;
  }
  return search;
}

export function searchKey({ query, location }) {
  return JSON.stringify([query.toLocaleLowerCase('pt-BR'), location.toLocaleLowerCase('pt-BR')]);
}

export function originalSearchLinks(query, location) {
  const params = new URLSearchParams({ q: query, l: location || 'Brasil' });
  return [
    { name: 'Indeed', url: `https://br.indeed.com/jobs?${params}` },
    { name: 'LinkedIn', url: `https://www.linkedin.com/jobs/search/?${new URLSearchParams({ keywords: query, location: location ? `${location}, Brasil` : 'Brasil' })}` },
    { name: 'InfoJobs', url: `https://www.infojobs.com.br/empregos.aspx?${new URLSearchParams({ Palabra: [query, location].filter(Boolean).join(' ') })}` },
  ];
}
