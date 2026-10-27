import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createGoogleJobsProvider } from '../server/search-provider.js';
import { createJobsService } from '../server/jobs.js';
import { loadPublicPages } from '../server/source-utils.js';
import { normalizeSearch } from '../shared/search.js';
import { SOURCES } from '../server/sources.js';
import { deduplicateJobs } from '../shared/job-identity.js';
import { filterJobs } from '../src/jobs.js';

// Respostas simuladas; nenhuma credencial ou chamada autenticada real neste arquivo.
const indexed = id => ({ job_id: `index-${id}`, title: 'Garçom', company_name: `Restaurante ${id}`, location: 'Limeira, SP, Brasil', apply_options: [{ link: `https://br.indeed.com/viewjob?jk=abc${id}` }] });
const job = id => ({ id: `gupy:${id}`, title: 'Garçom - Coco Bambu Limeira', company: 'Coco Bambu', location: 'Limeira, São Paulo, Brasil', country: 'BR', url: `https://cocobambu.gupy.io/jobs/${id}`, sourceId: 'gupy', sourceName: 'Gupy', types: [], tags: [], description: '', workModel: 'unknown' });

test('pesquisa indexada usa cargo e cidade, segue tokens e isola cache por busca', async () => {
  const calls = [];
  const provider = createGoogleJobsProvider({ getApiKey: () => 'fixture-only' });
  const fetchImpl = async url => {
    assert.equal(url.origin, 'https://serpapi.com');
    const token = url.searchParams.get('next_page_token');
    const n = token ? Number(token.replace('page-', '')) : 0;
    calls.push({ query: url.searchParams.get('q'), token });
    return Response.json({ jobs_results: [indexed(n)], serpapi_pagination: n < 3 ? { next_page_token: `page-${n + 1}` } : {} });
  };
  const search = { query: 'garçom', location: 'Limeira, SP', fetchImpl, now: 1000 };
  const [one, same] = await Promise.all([provider.getJobs(search), provider.getJobs(search)]);
  assert.equal(calls.length, 2);
  assert.equal(calls[0].query, 'garçom em Limeira, SP');
  assert.equal(one.jobs.length, 2); assert.equal(one.hasMore, true); assert.deepEqual(one, same);
  const more = await provider.getJobs({ ...search, page: 1 });
  assert.equal(calls.length, 4); assert.equal(more.jobs.length, 2); assert.equal(more.hasMore, false);
  await provider.getJobs({ ...search, query: 'recepcionista' });
  assert.equal(calls.length, 6); assert.equal(calls[4].query, 'recepcionista em Limeira, SP');
  await provider.getJobs({ ...search, location: 'Campinas, SP' });
  assert.equal(calls.length, 8);
});

test('falha numa próxima página conserva resultados e permite recuperação sem repetir a primeira consulta', async () => {
  let failing = true, firstCalls = 0;
  const provider = createGoogleJobsProvider({ getApiKey: () => 'fixture-only' });
  const fetchImpl = async url => {
    if (!url.searchParams.has('next_page_token')) {
      firstCalls++; return Response.json({ jobs_results: [indexed(1)], serpapi_pagination: { next_page_token: 'next' } });
    }
    return failing ? new Response('', { status: 429 }) : Response.json({ jobs_results: [indexed(2)] });
  };
  const partial = await provider.getJobs({ fetchImpl, now: 1000 });
  assert.equal(partial.jobs.length, 1); assert.equal(partial.partial, true); assert.equal(partial.hasMore, true);
  failing = false;
  const recovered = await provider.getJobs({ fetchImpl, now: 62000 });
  assert.equal(recovered.jobs.length, 2); assert.equal(recovered.partial, false); assert.equal(firstCalls, 1);
});

test('lotes acumulam vagas, eliminam cópias e não usam cache de outro cargo ou cidade', async () => {
  const calls = [];
  const source = { id: 'gupy', name: 'Gupy', load: async options => {
    calls.push([options.query, options.location, options.page]);
    return { jobs: options.page ? [job(1), { ...job(2), title: 'Outro cargo' }] : [job(1)], hasMore: options.page === 0 };
  } };
  const getJobs = createJobsService({ sources: [source], now: () => 1000 });
  const search = { query: 'garçom', location: 'Limeira, SP' };
  await Promise.all([getJobs(search), getJobs(search)]);
  assert.equal(calls.length, 1);
  const more = await getJobs({ ...search, page: 1 });
  assert.equal(more.jobs.length, 2); assert.equal(more.pagination.hasMore, false);
  assert.equal(more.deduplication.received, 2);
  await getJobs({ ...search, page: 2 }); assert.equal(calls.length, 2, 'Não consultar fonte já esgotada');
  await getJobs({ ...search, query: 'recepcionista' });
  await getJobs({ ...search, location: 'Campinas, SP' });
  assert.equal(calls.length, 4);
});

test('paginação pública consulta páginas distintas, preserva falhas parciais e detecta páginas ignoradas', async () => {
  const fetchImpl = async url => {
    const page = Number(new URL(url).searchParams.get('page'));
    if (page === 2) return new Response('', { status: 503 });
    return Response.json([job(page + 1)]);
  };
  const result = await loadPublicPages({ fetchImpl, pageSize: 1, json: true, urlForPage: page => `https://portal.gupy.io/?page=${page}`, parse: data => data });
  assert.equal(result.jobs.length, 2); assert.equal(result.partial, true); assert.equal(result.hasMore, true);
  const repeated = await loadPublicPages({ fetchImpl: async () => Response.json([job(1)]), pageSize: 1, json: true, urlForPage: page => `https://portal.gupy.io/?page=${page}`, parse: data => data });
  assert.equal(repeated.jobs.length, 1); assert.equal(repeated.hasMore, false);
});

test('caso garçom em Limeira aceita SP e São Paulo, encontra a vaga e mostra uma origem', () => {
  const gupy = job(12704599);
  const indeed = { ...gupy, id: 'indeed:b3cc06ea93801b68', sourceId: 'indeed', sourceName: 'Indeed', location: 'Limeira, SP', url: 'https://br.indeed.com/viewjob?jk=b3cc06ea93801b68' };
  const results = filterJobs(deduplicateJobs([gupy, indeed]), { query: 'garçom', location: 'Limeira, SP' });
  assert.equal(results.length, 1); assert.equal(results[0].duplicateCount, 2);
  assert.equal(filterJobs([gupy], { location: 'Campinas, SP' }).length, 0);
  assert.equal(filterJobs([gupy], { location: 'SP' }).length, 1);
});

test('Gupy envia jobName, cidade e nome do estado para a rota pública real', async () => {
  await SOURCES.find(s => s.id === 'gupy').load({ query: 'garçom', location: 'Limeira, SP', now: 1000, fetchImpl: async value => {
    const url = new URL(value);
    assert.equal(url.searchParams.get('jobName'), 'garçom'); assert.equal(url.searchParams.get('city'), 'Limeira');
    assert.equal(url.searchParams.get('state'), 'São Paulo'); assert.equal(url.searchParams.get('offset'), '0');
    return Response.json({ data: [] });
  } });
});

test('rejeita páginas sem limite e textos longos antes de consultar fontes', () => {
  for (const value of [-1, 5, 1.5, Infinity, 'abc']) assert.throws(() => normalizeSearch({ page: value }), error => error.status === 400);
  assert.throws(() => normalizeSearch({ query: 'x'.repeat(121) }));
  assert.throws(() => normalizeSearch({ location: 'x'.repeat(101) }));
  assert.equal(normalizeSearch({ query: '  garçom\n   restaurante  ' }).query, 'garçom restaurante');
});
