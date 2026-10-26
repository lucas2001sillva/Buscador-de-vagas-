import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { createJobsService, normalizeJob, CACHE_TTL } from '../server/jobs.js';
import { createApiHandler } from '../server/app.js';
import { filterJobs } from '../src/jobs.js';

const raw = { slug: 'test-engineer', title: 'Software Engineer', company_name: 'Empresa de teste', url: 'https://www.arbeitnow.com/jobs/test-engineer', location: 'São Paulo', remote: true, description: '<h2>Responsabilidades</h2><p>Criar &amp; testar.</p><script>alert(1)</script>', tags: ['Engineering'], job_types: ['Full time'], created_at: 1750000000 };

test('normaliza vagas e remove HTML e scripts da fonte', () => {
  const job = normalizeJob(raw);
  assert.equal(job.description, 'Responsabilidades\nCriar & testar.');
  assert.equal(job.company, raw.company_name);
  assert.equal(job.publishedAt, '2025-06-15T15:06:40.000Z');
  assert.deepEqual(job.tags, ['Engineering']);
});

test('rejeita links inseguros, origens externas e vagas incompletas', () => {
  for (const url of ['javascript:alert(1)', 'http://www.arbeitnow.com/jobs/a', 'https://evil.test/', 'https://www.arbeitnow.com.evil.test/', 'https://user:pass@www.arbeitnow.com/a']) assert.equal(normalizeJob({ ...raw, url }), null);
  assert.equal(normalizeJob({ title: 'Sem empresa' }), null);
  assert.equal(normalizeJob(null), null);
});

test('compartilha consultas simultâneas, elimina duplicatas e reutiliza cache', async () => {
  let calls = 0;
  const getJobs = createJobsService({ fetchImpl: async () => { calls++; await new Promise(resolve => setTimeout(resolve, 10)); return Response.json({ data: [raw, raw, {}] }); } });
  const [first, second] = await Promise.all([getJobs(), getJobs()]);
  assert.equal(calls, 1);
  assert.equal(first.jobs.length, 1);
  assert.deepEqual(first, second);
  await getJobs();
  assert.equal(calls, 1);
});

test('identifica cache antigo na falha e recupera a fonte', async () => {
  let clock = 1750000000000;
  let unavailable = false;
  const getJobs = createJobsService({ now: () => clock, fetchImpl: async () => { if (unavailable) throw new Error('offline'); return Response.json({ data: [raw] }); } });
  const first = await getJobs();
  clock += CACHE_TTL + 1;
  unavailable = true;
  const old = await getJobs();
  assert.equal(old.stale, true);
  assert.equal(old.updatedAt, first.updatedAt);
  unavailable = false;
  assert.equal((await getJobs()).stale, false);
});

test('não fabrica vagas quando a fonte falha ou muda de formato', async () => {
  for (const response of [new Response('blocked', { status: 403 }), Response.json({ unexpected: [] }), Response.json({ data: [{}] })]) await assert.rejects(createJobsService({ fetchImpl: async () => response })());
  assert.deepEqual((await createJobsService({ fetchImpl: async () => Response.json({ data: [] }) })()).jobs, []);
});

test('combina busca sem acentos, localização, remoto, contrato e favoritos', () => {
  const first = normalizeJob(raw);
  const second = { ...first, id: 'second', title: 'Product Designer', company: 'Outra empresa', location: 'Lisboa', remote: false, types: ['Part time'] };
  assert.deepEqual(filterJobs([first, second], { query: 'SOFTWARE empresa', location: 'sao paulo', remoteOnly: true, type: 'Full time' }), [first]);
  assert.deepEqual(filterJobs([first, second], { query: 'Design', remoteOnly: true }), []);
  assert.deepEqual(filterJobs([first, second], { savedOnly: true, savedIds: ['second'] }), [second]);
  assert.deepEqual(filterJobs([second, first], { sort: 'company' }), [first, second]);
});

test('ordena por data sem modificar a lista original', () => {
  const older = { ...normalizeJob(raw), id: 'old', publishedAt: '2024-01-01T00:00:00Z' };
  const recent = { ...older, id: 'new', publishedAt: '2025-01-01T00:00:00Z' };
  const jobs = [older, recent];
  assert.deepEqual(filterJobs(jobs), [recent, older]);
  assert.equal(jobs[0].id, 'old');
});

test('API HTTP entrega vagas, saúde, erros e métodos corretos', async t => {
  let fail = false;
  const api = createApiHandler(async () => { if (fail) throw new Error('private details'); return { jobs: [normalizeJob(raw)], stale: false }; });
  const server = createServer(async (req, res) => { if (!(await api(req, res))) { res.statusCode = 404; res.end(); } });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise(resolve => server.close(resolve)));
  const base = `http://127.0.0.1:${server.address().port}`;
  assert.equal((await (await fetch(`${base}/api/health`)).json()).status, 'ok');
  const response = await fetch(`${base}/api/jobs`);
  assert.equal(response.status, 200);
  assert.equal((await response.json()).jobs[0].title, raw.title);
  assert.equal((await fetch(`${base}/api/unknown`)).status, 404);
  assert.equal((await fetch(`${base}/api/jobs`, { method: 'POST' })).status, 405);
  fail = true;
  const error = await fetch(`${base}/api/jobs`);
  assert.equal(error.status, 502);
  assert.ok(!(await error.text()).includes('private details'));
});
