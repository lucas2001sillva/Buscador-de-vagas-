import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { createJobsService, deduplicateJobs, CACHE_TTL, ERROR_RETRY_TTL } from '../server/jobs.js';
import { SOURCES, BOARDS, parseGithubListing, normalizeGithub, normalizeGupy, parseGupyListing, parseProgramathor, plainText } from '../server/sources.js';
import { createApiHandler } from '../server/app.js';
import { filterJobs } from '../src/jobs.js';
import { normalizeContracts, normalizeWorkModel, safeJobUrl, restoreFavorite } from '../shared/job-schema.js';
import { dailyVerseIndex, VERSES } from '../src/verses.js';

const now = Date.parse('2026-10-26T20:00:00Z');
const raw = { id: 10, name: 'Desenvolvedor de software', careerPageName: 'Empresa de teste', jobUrl: 'https://empresa.gupy.io/jobs/10', city: 'São Paulo', state: 'SP', country: 'Brasil', workplaceType: 'hybrid', isRemote: false, description: '<h2>Responsabilidades</h2><p>Criar &amp; testar.</p><script>alert(1)</script>', type: 'Efetivo', publishedDate: '2026-10-25T12:00:00Z' };
const job = normalizeGupy(raw, now);
const issue = { number: 42, title: '[São Paulo] Desenvolvedor na Empresa de teste', state: 'REPO_ISSUE_STATE_OPEN', permalink: 'https://github.com/frontendbr/vagas/issues/42', createdAt: '2026-10-25T12:00:00Z', labels: [{ name: 'Presencial' }, { name: 'CLT' }] };
const source = (id, load) => ({ id, name: id, url: 'https://github.com/frontendbr/vagas', load });

test('normaliza contratos em português sem transformar jornada em contrato', () => {
  assert.deepEqual(normalizeContracts(['CLT', 'PJ', 'Internship', 'Aprendiz', 'Freelance']), ['CLT', 'PJ', 'Estágio', 'Aprendiz', 'Autônomo']);
  assert.deepEqual(normalizeContracts(['Full time', 'Part time', 'Unbefristeter arbeitsvertrag']), []);
  assert.deepEqual(normalizeContracts(['Efetivo']), ['CLT']);
});

test('normaliza modalidades e não presume presencial a partir de remoto falso', () => {
  for (const [input, expected] of [['HÍBRIDO', 'hybrid'], ['on-site', 'onsite'], ['HOME OFFICE', 'remote'], ['false', 'unknown'], ['CLT', 'unknown']]) assert.equal(normalizeWorkModel(input), expected);
  assert.equal(normalizeGupy({ ...raw, workplaceType: null, isRemote: false }, now).workModel, 'unknown');
  assert.equal(normalizeGupy({ ...raw, workplaceType: 'hybrid', isRemote: true }, now).workModel, 'hybrid');
});

test('Gupy aceita Brasil, remove HTML e rejeita exterior, banco de talentos e prazo vencido', () => {
  assert.equal(job.description, 'Responsabilidades\nCriar & testar.');
  assert.equal(job.country, 'BR');
  assert.equal(normalizeGupy({ ...raw, country: undefined }, now).country, 'BR');
  assert.deepEqual(normalizeGupy({ ...raw, type: 'vacancy_type_effective' }, now).types, ['CLT']);
  assert.ok(safeJobUrl('https://empresa.gupy.io/job/eyJqb2JJZCI6MTB9?jobBoardSource=gupy_portal'));
  const row = { ...raw, description: 'Descrição de teste' };
  assert.deepEqual(parseGupyListing(`<script id="__NEXT_DATA__" type="application/json">${JSON.stringify({ props: { pageProps: { initialJobList: { data: [row] } } } })}</script>`), [row]);
  assert.throws(() => parseGupyListing('<h1>Falha</h1>'));
  assert.deepEqual(job.types, ['CLT']);
  for (const change of [{ country: 'Portugal' }, { country: null, state: 'Buenos Aires' }, { name: 'Banco de talentos' }, { applicationDeadline: '2025-01-01' }, { jobUrl: 'javascript:alert(1)' }]) assert.equal(normalizeGupy({ ...raw, ...change }, now), null);
  assert.equal(plainText('<style>bad</style><p>Olá</p>'), 'Olá');
});

test('links só aceitam HTTPS e páginas de vagas em fontes conhecidas', () => {
  for (const url of ['javascript:alert(1)', 'http://empresa.gupy.io/jobs/10', 'https://evil.test/', 'https://empresa.gupy.io.evil.test/jobs/1', 'https://user:pass@empresa.gupy.io/jobs/10', 'https://github.com/frontendbr/vagas/settings', 'https://github.com/unrelated/repo/issues/1', 'https://empresa.gupy.io:8443/jobs/10']) assert.equal(safeJobUrl(url), null);
  assert.ok(safeJobUrl(raw.jobUrl));
  assert.ok(safeJobUrl(issue.permalink));
});

test('conector Gupy usa a rota pública atual e descarta vagas fora do Brasil', async () => {
  const gupy = SOURCES.find(item => item.id === 'gupy');
  const jobs = await gupy.load({ now, fetchImpl: async url => {
    assert.ok(url.startsWith('https://portal.gupy.io/api/job-search/jobs?'));
    return Response.json({ data: [raw, { ...raw, id: 11, country: 'Argentina' }] });
  } });
  assert.equal(jobs.length, 1);
  assert.equal(jobs[0].country, 'BR');
});

test('conector Gupy recupera a listagem pública quando a rota JSON falha', async () => {
  let calls = 0;
  const row = { ...raw, description: 'Descrição de teste' };
  const html = `<script id="__NEXT_DATA__" type="application/json">${JSON.stringify({ props: { pageProps: { initialJobList: { data: [row] } } } })}</script>`;
  const jobs = await SOURCES.find(item => item.id === 'gupy').load({ now, fetchImpl: async url => {
    calls++;
    return url.includes('/api/') ? new Response('Indisponível', { status: 503 }) : new Response(html);
  } });
  assert.equal(calls, 2);
  assert.equal(jobs.length, 1);
});

test('extrai a lista pública do GitHub, ignora PRs e falha quando o site muda', () => {
  const html = `<script type="application/json" data-target="react-app.embeddedData">${JSON.stringify({ payload: { issuesIndexContentRoute: { results: [{ issue }, { pullRequest: {} }] } } })}</script>`;
  assert.deepEqual(parseGithubListing(html), [issue]);
  assert.throws(() => parseGithubListing('<html>Página de bloqueio</html>'));
  assert.throws(() => parseGithubListing('<script data-target="react-app.embeddedData">{}</script>'));
});

test('GitHub classifica título e rótulos, exclui encerradas, anúncios antigos e exterior explícito', () => {
  const normalized = normalizeGithub(issue, BOARDS[0], now);
  assert.equal(normalized.workModel, 'onsite');
  assert.equal(normalized.company, 'Empresa de teste');
  assert.deepEqual(normalized.types, ['CLT']);
  assert.equal(normalizeGithub({ ...issue, title: '[Híbrido] Analista', labels: [{ name: 'Alocado' }] }, BOARDS[0], now).workModel, 'hybrid');
  assert.ok(normalizeGithub({ ...issue, title: '[Porto Alegre, RS] Analista' }, BOARDS[0], now));
  for (const change of [{ state: 'closed' }, { pull_request: {} }, { createdAt: '2020-01-01' }, { title: '[Lisboa, Portugal] Vaga' }, { permalink: 'https://github.com/backend-br/vagas/issues/42' }]) assert.equal(normalizeGithub({ ...issue, ...change }, BOARDS[0], now), null);
});

const programathorHtml = `<div class="cell-list"><a href="/jobs/123-dev"><div class="cell-list-content"><h3>Dev Brasil</h3><div class="cell-list-content-icon"><span><i class="fa-briefcase"></i>Empresa</span><span><i class="fa-map-marker-alt"></i>Remoto</span><span><i class="fa-file-alt"></i>PJ</span></div><span class="tag-list">React</span></div></a></div><div class="cell-list">publicidade</div>`;
test('ProgramaThor extrai anúncios, ignora publicidade e não inventa datas ou modalidade', () => {
  const [item] = parseProgramathor(programathorHtml);
  assert.equal(item.title, 'Dev Brasil');
  assert.equal(item.workModel, 'remote');
  assert.deepEqual(item.types, ['PJ']);
  assert.equal(item.publishedAt, null);
  assert.equal(parseProgramathor(programathorHtml.replace('>Remoto<', '>São Paulo<'))[0].workModel, 'unknown');
  assert.throws(() => parseProgramathor('<h1>Bloqueado</h1>'));
});

test('agrega fontes em paralelo, compartilha consultas e reutiliza cache', async () => {
  let calls = 0;
  const sources = ['a', 'b'].map(id => source(id, async () => { calls++; await new Promise(resolve => setTimeout(resolve, 10)); return [job]; }));
  const getJobs = createJobsService({ sources, now: () => now });
  const [first, second] = await Promise.all([getJobs(), getJobs()]);
  assert.equal(calls, 2);
  assert.equal(first.jobs.length, 1);
  assert.equal(first.sources.length, 2);
  assert.deepEqual(first, second);
  await getJobs();
  assert.equal(calls, 2);
});

test('falha isolada mantém outras fontes e identifica a fonte indisponível', async () => {
  const getJobs = createJobsService({ sources: [source('good', async () => [job]), source('bad', async () => { throw new Error('offline'); })] });
  const data = await getJobs();
  assert.equal(data.partial, true);
  assert.equal(data.stale, false);
  assert.equal(data.sources.find(item => item.id === 'bad').status, 'unavailable');
  assert.equal(data.jobs.length, 1);
});

test('cache por fonte preserva data original e espera antes de tentar novamente', async () => {
  let clock = now;
  let unavailable = false;
  let calls = 0;
  const getJobs = createJobsService({ now: () => clock, sources: [source('a', async () => { calls++; if (unavailable) throw new Error('offline'); return [job]; })] });
  const first = await getJobs();
  clock += CACHE_TTL + 1;
  unavailable = true;
  const old = await getJobs();
  assert.equal(old.stale, true);
  assert.equal(old.sources[0].updatedAt, first.sources[0].updatedAt);
  assert.equal(old.jobs[0].sourceStale, true);
  await getJobs();
  assert.equal(calls, 2);
  unavailable = false;
  clock += ERROR_RETRY_TTL + 1;
  assert.equal((await getJobs()).stale, false);
  assert.equal(calls, 3);
});

test('falha total sem cache é erro; uma fonte vazia válida não vira falha', async () => {
  await assert.rejects(createJobsService({ sources: [source('a', async () => { throw new Error(); })] })());
  assert.deepEqual((await createJobsService({ sources: [source('empty', async () => [])] })()).jobs, []);
});

test('duplicatas por URL desconsideram rastreamento sem unir vagas diferentes', () => {
  const other = { ...job, id: 'other', url: 'https://empresa.gupy.io/jobs/11' };
  assert.equal(deduplicateJobs([job, { ...job, url: job.url + '?utm_source=test' }, other]).length, 2);
});

test('combina múltiplas modalidades com contrato, localização, termo e fonte', () => {
  const remote = { ...job, id: 'remote', workModel: 'remote', sourceId: 'programathor', types: ['PJ'] };
  const onsite = { ...job, id: 'onsite', workModel: 'onsite', types: [] };
  const jobs = [job, remote, onsite];
  assert.deepEqual(filterJobs(jobs, { query: 'desenvolvedor empresa', location: 'sao paulo', workModels: ['hybrid', 'remote'] }), [job, remote]);
  assert.deepEqual(filterJobs(jobs, { type: 'PJ', source: 'programathor' }), [remote]);
  assert.deepEqual(filterJobs(jobs, { type: 'unknown' }), [onsite]);
  assert.deepEqual(filterJobs(jobs, { savedOnly: true, savedIds: ['remote'] }), [remote]);
  assert.equal(jobs[0].id, job.id);
});

test('favoritos de várias fontes e favoritos antigos sobrevivem à migração', () => {
  assert.equal(restoreFavorite(job).sourceName, 'Gupy');
  const old = restoreFavorite({ ...job, sourceName: undefined, sourceId: undefined, workModel: undefined, remote: false, types: ['Full time'], url: 'https://www.arbeitnow.com/jobs/old' });
  assert.equal(old.workModel, 'unknown');
  assert.deepEqual(old.types, []);
  assert.equal(old.sourceId, 'legacy');
  assert.equal(restoreFavorite({ ...job, url: 'javascript:alert(1)' }), null);
});

test('passagens NVI têm referência e página dos PDFs; seleção diária usa São Paulo', () => {
  assert.equal(VERSES.length, 6);
  for (const verse of VERSES) { assert.ok(verse.reference && verse.text && verse.page > 0); assert.ok(['NT-NVI-Pt.pdf', 'AT-NVI-Pt.pdf'].includes(verse.file)); }
  assert.equal(dailyVerseIndex(new Date('2026-10-26T02:30:00Z')), dailyVerseIndex(new Date('2026-10-25T20:00:00Z')));
  assert.notEqual(dailyVerseIndex(new Date('2026-10-26T03:30:00Z')), dailyVerseIndex(new Date('2026-10-25T20:00:00Z')));
});

test('API HTTP mantém saúde, erros públicos, métodos e metadados de fontes', async t => {
  let fail = false;
  const api = createApiHandler(async () => { if (fail) throw new Error('private details'); return { jobs: [job], sources: [{ id: 'gupy', status: 'ok' }], stale: false }; });
  const server = createServer(async (req, res) => { if (!(await api(req, res))) { res.statusCode = 404; res.end(); } });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise(resolve => server.close(resolve)));
  const base = `http://127.0.0.1:${server.address().port}`;
  assert.equal((await (await fetch(`${base}/api/health`)).json()).status, 'ok');
  const response = await fetch(`${base}/api/jobs`);
  assert.equal(response.status, 200);
  assert.equal((await response.json()).sources[0].id, 'gupy');
  assert.equal((await fetch(`${base}/api/unknown`)).status, 404);
  assert.equal((await fetch(`${base}/api/jobs`, { method: 'POST' })).status, 405);
  fail = true;
  const error = await fetch(`${base}/api/jobs`);
  assert.equal(error.status, 502);
  assert.ok(!(await error.text()).includes('private details'));
});
