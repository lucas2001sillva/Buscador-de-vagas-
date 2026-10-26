import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseRandstad, parseIndeed, parseGlassdoor, parseInfojobs, readAssignedJson, createPortalSources } from '../server/portal-sources.js';
import { normalizeSearchResults, createGoogleJobsProvider, PROVIDER_CACHE_TTL } from '../server/search-provider.js';
import { deduplicateJobs } from '../shared/job-identity.js';
import { createJobsService } from '../server/jobs.js';
import { safeJobUrl } from '../shared/job-schema.js';

const randstad = `<li class="cards__item"><h3 class="cards__title"><a class="cards__link" href="/vagas/analista_sao-paulo_123/">Analista</a></h3><li class="cards__meta-item"><svg aria-label="Localização da vaga"></svg>São Paulo, São Paulo</li><li class="cards__meta-item"><svg aria-label="Tipo de posição"></svg>Temporário</li><div class="cards__description">Descrição pública</div><span class="cards__date">vaga postada em 26 outubro 2026</span></li>`;
test('Randstad extrai contrato e data sem inferir modalidade a partir da cidade', () => {
  // Fragmento com lista de metadados corretamente aninhada como no portal.
  const html = randstad.replace('<li class="cards__meta-item">', '<ul><li class="cards__meta-item">').replace('</li><div class="cards__description">', '</li></ul><div class="cards__description">');
  const [job] = parseRandstad(html);
  assert.equal(job.company, 'Randstad'); assert.equal(job.workModel, 'unknown');
  assert.deepEqual(job.types, ['Temporário']); assert.equal(job.publishedAt, '2026-10-26');
  assert.equal(job.employerReference, 'randstad-123');
  assert.throws(() => parseRandstad('<h1>Bloqueado</h1>'));
});

test('Indeed lê somente JSON de anúncios públicos e rejeita expiradas, exterior e anúncios antigos', () => {
  const recent = { jobkey: 'abc1', company: 'Empresa', title: 'Analista', formattedLocation: 'São Paulo, SP', country: 'BR', pubDate: Date.parse('2026-10-26'), jobTypes: ['Efetivo/CLT'], remoteLocation: true, snippet: '<p>Descrição</p>' };
  const html = `window.mosaic.providerData["mosaic-provider-jobcards"]=${JSON.stringify({ metaData: { mosaicProviderJobCardsModel: { results: [recent, { ...recent, expired: true }, { ...recent, country: 'US' }, { ...recent, pubDate: Date.parse('2020-01-01') }] } } })};window.doNotExecute=true;`;
  const jobs = parseIndeed(html, Date.parse('2026-10-26T12:00:00Z'));
  assert.equal(jobs.length, 1); assert.equal(jobs[0].workModel, 'remote'); assert.deepEqual(jobs[0].types, ['CLT']);
  assert.equal(jobs[0].url, 'https://br.indeed.com/viewjob?jk=abc1');
  assert.deepEqual(readAssignedJson('data={"text":"} escaped \\\" quote","nested":[{}]};', 'data='), { text: '} escaped " quote', nested: [{}] });
  assert.throws(() => readAssignedJson('data={x:process.exit()};', 'data='));
});

test('Glassdoor usa o link da vaga, não o rastreador, e preserva a idade informada', () => {
  const html = `<li data-test="jobListing"><a data-test="job-title" href="https://www.glassdoor.com.br/job-listing/analista-JV.htm?jl=123">Analista</a><span class="EmployerProfile_compactEmployerName__test">Empresa</span><div data-test="emp-location">Trabalho remoto</div><div data-test="descSnippet">Descrição</div><div data-test="job-age">mais de 30 dias</div><a data-test="job-link" href="/partner/tracker">rastreamento</a></li>`;
  const [job] = parseGlassdoor(html); assert.equal(job.workModel, 'remote'); assert.equal(job.postedLabel, 'mais de 30 dias');
  assert.equal(job.publishedAt, null); assert.match(job.url, /\/job-listing\//);
  assert.throws(() => parseGlassdoor('<h1>Faça login</h1>'));
});

test('InfoJobs aceita apenas anúncios estruturados com URL válida', () => {
  const row = { '@type': 'JobPosting', title: 'Analista', identifier: { value: 1 }, hiringOrganization: { name: 'Empresa' }, url: 'https://www.infojobs.com.br/vaga-de-analista__123.aspx', jobLocation: { address: { addressLocality: 'São Paulo', addressRegion: 'SP', addressCountry: 'BR' } }, employmentType: 'CLT' };
  const [job] = parseInfojobs(`<script type="application/ld+json">${JSON.stringify(row)}</script>`);
  assert.equal(job.sourceId, 'infojobs'); assert.deepEqual(job.types, ['CLT']);
  assert.throws(() => parseInfojobs('<h1>Erro 500</h1>'));
});

const links = ['https://www.glassdoor.com.br/job-listing/analista-JV.htm?jl=123', 'https://br.indeed.com/viewjob?jk=abc1', 'https://www.infojobs.com.br/vaga-de-analista__123.aspx', 'https://www.catho.com.br/vagas/analista/123/', 'https://www.linkedin.com/jobs/view/123/', 'https://www.randstad.com.br/vagas/analista_123/'];
const payload = { jobs_results: [{ job_id: 'test-indexed-job', title: 'Analista', company_name: 'Empresa de teste', location: 'São Paulo, SP, Brasil', description: 'Descrição de teste', extensions: ['CLT', 'Híbrido'], apply_options: links.map(link => ({ link, title: 'Rótulo não confiável' })) }] };

test('indexador reconhece os seis portais pelo domínio e agrupa uma vaga com seis publicações', () => {
  const jobs = normalizeSearchResults(payload); assert.equal(jobs.length, 6);
  assert.deepEqual(new Set(jobs.map(job => job.sourceId)), new Set(['glassdoor', 'indeed', 'infojobs', 'catho', 'linkedin', 'randstad']));
  const [selected] = deduplicateJobs(jobs); assert.equal(deduplicateJobs(jobs).length, 1); assert.equal(selected.duplicateCount, 6);
  assert.equal(selected.sourceId, 'randstad');
  for (const link of links) assert.ok(safeJobUrl(link));
  for (const link of ['https://linkedin.com.evil.test/jobs/view/123', 'https://evil.test/?url=https://br.indeed.com/viewjob?jk=abc1']) assert.equal(safeJobUrl(link), null);
});

test('indexador não aceita links genéricos, exterior explícito, erros ou formato desconhecido', () => {
  assert.equal(normalizeSearchResults({ jobs_results: [{ ...payload.jobs_results[0], apply_options: [{ link: 'https://www.linkedin.com/jobs/' }] }] }).length, 0);
  assert.equal(normalizeSearchResults({ jobs_results: [{ ...payload.jobs_results[0], location: 'United States' }] }).length, 0);
  assert.throws(() => normalizeSearchResults({ error: 'Private diagnostic' }));
  assert.throws(() => normalizeSearchResults({}));
  assert.deepEqual(normalizeSearchResults({ jobs_results: [] }), []);
});

test('consulta ao provedor é compartilhada e fica em cache por uma hora', async () => {
  let calls = 0;
  const provider = createGoogleJobsProvider({ getApiKey: () => 'fixture-not-a-real-key' });
  const fetchImpl = async url => { calls++; assert.equal(url.hostname, 'serpapi.com'); assert.equal(url.searchParams.get('engine'), 'google_jobs'); return Response.json(payload); };
  await Promise.all([provider.getJobs({ fetchImpl, now: 1000 }), provider.getJobs({ fetchImpl, now: 1000 })]);
  await provider.getJobs({ fetchImpl, now: 1001 }); assert.equal(calls, 1);
  await provider.getJobs({ fetchImpl, now: PROVIDER_CACHE_TTL + 1001 }); assert.equal(calls, 2);
});

test('sem chave, portais protegidos ficam pendentes e não fazem chamadas autenticadas fictícias', async () => {
  let calls = 0;
  const sources = createPortalSources({ getApiKey: () => undefined });
  const linkedin = sources.find(source => source.id === 'linkedin');
  await assert.rejects(linkedin.load({ fetchImpl: async () => { calls++; }, now: Date.now() }), error => error.code === 'NOT_CONFIGURED');
  assert.equal(calls, 0);
  const service = createJobsService({ sources: [linkedin, { id: 'empty', name: 'Outra fonte', load: async () => [] }] });
  const data = await service(); assert.equal(data.sources[0].status, 'not_configured'); assert.equal(data.sources[0].count, 0);
});

test('diagnóstico público informa HTTP e não expõe o texto privado da falha', async () => {
  const service = createJobsService({ sources: [
    { id: 'blocked', load: async () => { const error = new Error('private credential diagnostic'); error.status = 403; throw error; } },
    { id: 'available', load: async () => [] },
  ] });
  const data = await service();
  assert.equal(data.sources[0].failureReason, 'HTTP_403');
  assert.equal(data.sources[1].failureReason, null);
  assert.ok(!JSON.stringify(data).includes('private credential'));
});
