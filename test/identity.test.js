import { test } from 'node:test';
import assert from 'node:assert/strict';
import { canonicalCompany, canonicalTitle, canonicalLocation, canonicalJobUrl, deduplicateJobs, isSavedJob } from '../shared/job-identity.js';
import { filterJobs } from '../src/jobs.js';
const first = { id: 'indeed:1', sourceId: 'indeed', sourceName: 'Indeed', title: 'Desenvolvedor(a) Front-End Pleno', company: 'Ácme Ltda.', location: 'São Paulo, São Paulo, Brasil', workModel: 'hybrid', types: ['CLT'], tags: [], description: '', url: 'https://br.indeed.com/viewjob?jk=abc1', country: 'BR', publishedAt: '2026-10-26T12:00:00Z' };
const second = { ...first, id: 'linkedin:2', sourceId: 'linkedin', sourceName: 'LinkedIn', title: 'Desenvolvedor Front End Pleno na ACME', company: 'ACME', location: 'São Paulo/SP', url: 'https://br.linkedin.com/jobs/view/desenvolvedor-222' };

test('normaliza nome jurídico, gênero no cargo e cidade/UF sem remover senioridade', () => {
  assert.equal(canonicalCompany(first.company), 'acme');
  assert.equal(canonicalCompany('ACME S.A.'), 'acme');
  assert.equal(canonicalTitle(first), canonicalTitle(second));
  assert.deepEqual(canonicalLocation(first.location), canonicalLocation(second.location));
  assert.notEqual(canonicalTitle({ ...first, title: 'Desenvolvedor Front-end Júnior' }), canonicalTitle(first));
});

test('mesma vaga em sites diferentes aparece uma vez, com um único site selecionado', () => {
  const jobs = deduplicateJobs([first, second]);
  assert.equal(jobs.length, 1);
  assert.equal(jobs[0].duplicateCount, 2);
  assert.deepEqual(jobs[0].duplicateIds, [first.id, second.id]);
  assert.equal(typeof jobs[0].sourceId, 'string');
  assert.ok(!('alternativeUrls' in jobs[0]));
  assert.deepEqual(deduplicateJobs([second, first]), jobs);
});

test('não une diferenças de senioridade, empresa, cidade, UF, modalidade ou contrato', () => {
  for (const changes of [
    { title: 'Desenvolvedor Front-end Sênior' }, { company: 'Outra empresa' },
    { location: 'Curitiba, PR' }, { location: 'São Paulo, MG' }, { workModel: 'onsite' },
    { types: ['PJ'] }, { employerReference: 'R-2' },
  ]) {
    const a = { ...first, employerReference: changes.employerReference ? 'R-1' : undefined };
    assert.equal(deduplicateJobs([a, { ...second, ...changes }]).length, 2, JSON.stringify(changes));
  }
});

test('dados ausentes não viram conflitos e não permitem ligação transitiva entre modalidades diferentes', () => {
  const unknown = { ...second, workModel: 'unknown' };
  assert.equal(deduplicateJobs([first, unknown]).length, 1);
  const onsite = { ...second, id: 'glassdoor:3', sourceId: 'glassdoor', url: 'https://www.glassdoor.com.br/job-listing/dev-JV.htm?jl=3', workModel: 'onsite' };
  assert.equal(deduplicateJobs([first, unknown, onsite]).length, 2);
});

test('empresa confidencial e IDs distintos do mesmo portal não são fundidos por cargo genérico', () => {
  assert.equal(deduplicateJobs([{ ...first, company: 'Empresa confidencial' }, { ...second, company: 'Empresa confidencial' }]).length, 2);
  assert.equal(deduplicateJobs([first, { ...first, id: 'indeed:2', url: 'https://br.indeed.com/viewjob?jk=abc2' }]).length, 2);
});

test('descrições conflitantes preservam vagas distintas apesar de cargo, empresa e cidade iguais', () => {
  const descriptionA = 'Projetar desenvolver implantar manter sistemas financeiros bancos seguros pagamentos transações auditoria contabilidade tributos relatórios fiscais gestão orçamentária compras fornecedores faturamento caixa conciliação livros contábeis indicadores liquidez investimentos controladoria análise riscos tesouraria consolidação balanços receitas despesas capital.';
  const descriptionB = 'Trabalhar produzindo desenhando publicando campanhas publicitárias pesquisas consumidores criação produtos marketing vendas comunicação redes sociais fotografias vídeos anúncios design identidade visual estratégia posicionamento marca segmentação público conteúdo eventos influência patrocínio relacionamento promoção lançamentos publicidade mídia digital.';
  assert.equal(deduplicateJobs([{ ...first, description: descriptionA }, { ...second, description: descriptionB }]).length, 2);
});

test('IDs e URLs canônicas reconhecem rastreamento e rotas alternativas do mesmo anúncio', () => {
  assert.equal(canonicalJobUrl('https://br.indeed.com/rc/clk?jk=abc1&from=search'), canonicalJobUrl(first.url));
  assert.equal(canonicalJobUrl('https://www.linkedin.com/jobs/view/222/?trackingId=x'), canonicalJobUrl(second.url));
  const token = btoa(JSON.stringify({ jobId: 100, source: 'gupy_portal' }));
  assert.equal(canonicalJobUrl(`https://empresa.gupy.io/job/${token}?jobBoardSource=x`), canonicalJobUrl('https://empresa.gupy.io/jobs/100'));
});

test('prefere dados atuais a cache e conserva favoritos quando muda a fonte principal', () => {
  const old = { ...first, sourceStale: true };
  const [selected] = deduplicateJobs([old, second]);
  assert.equal(selected.id, second.id);
  assert.equal(isSavedJob(selected, [old]), true);
  assert.equal(isSavedJob(second, [old]), true);
  assert.equal(deduplicateJobs([selected, old]).length, 1);
});

test('filtro por fonte mostra apenas a origem selecionada para a vaga única', () => {
  const [selected] = deduplicateJobs([first, second]);
  const hidden = selected.sourceId === 'indeed' ? 'linkedin' : 'indeed';
  assert.equal(filterJobs([selected], { source: selected.sourceId }).length, 1);
  assert.equal(filterJobs([selected], { source: hidden }).length, 0);
});

test('metadados contam as vagas selecionadas de cada site depois do agrupamento', async () => {
  const { createJobsService } = await import('../server/jobs.js');
  const sources = [
    { id: 'indeed', name: 'Indeed', load: async () => [first] },
    { id: 'linkedin', name: 'LinkedIn', load: async () => [second] },
  ];
  const data = await createJobsService({ sources })();
  assert.deepEqual(data.deduplication, { received: 2, unique: 1, removed: 1 });
  assert.equal(data.sources.reduce((count, item) => count + item.count, 0), 1);
  assert.equal(data.sources.reduce((count, item) => count + item.rawCount, 0), 2);
});
